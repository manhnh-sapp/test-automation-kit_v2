#!/usr/bin/env node
'use strict';

/*
 * learn_bugs.js — nối mắt xích còn ĐỨT: bug đã log Jira → knowledge/bugs/ (+ root_causes ref, index).
 *
 * VÌ SAO CẦN: `risk_score` tính Likelihood = f(bugCount theo module, failRate theo module). Sau khi
 * learn_task.js cấp failRate thì bugCount vẫn = 0 vì `knowledge/bugs/` chỉ được ghi khi agent nhớ chạy
 * skill `learning_recorder` (Suggest-only) → thực tế luôn bị bỏ. Script này lấy bug TỪ CHÍNH JIRA nên
 * không phụ thuộc agent có nhớ hay không, và KHÔNG cần sửa `bug_reporter.js`.
 *
 * NGUỒN CANONICAL: bug do kit tạo luôn có label `auto-bug` + label `<tcId>` và là sub-task của story
 * (xem bug_reporter.js). Vào Jira query đúng bộ đó ⇒ chỉ học bug ĐÃ QUA GATE (đúng nguyên tắc
 * knowledge/SCHEMA.md: chỉ ghi fact đã qua gate, không học rác từ flaky/setup).
 *
 * Module của bug suy từ tcId → cột `Module` của testcase canonical (dùng chung map với learn_task.js).
 * Idempotent: đã có file thì chỉ ĐỒNG BỘ `jira_status` (rerun chuyển Done → cập nhật), không tạo trùng.
 *
 * Dùng:
 *   TASK_ENV=profiles/<TASK>/task.env node scripts/qa/learn_bugs.js            # dry-run: chỉ in
 *   TASK_ENV=profiles/<TASK>/task.env node scripts/qa/learn_bugs.js --apply
 *   [--task <KEY>] [--story <JIRA_STORY_KEY>] [--project <PROJ>] [--max 100]
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const rc = require(path.resolve(__dirname, '..', 'utils', 'runtime_config'));
const { loadEnv, buildJiraHeaders } = require(path.resolve(__dirname, '..', 'integrations', 'jira', 'utils.js'));
const learn = require(path.resolve(__dirname, 'learn_task.js'));

loadEnv();

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };
const APPLY = process.argv.includes('--apply');
const TASK = arg('task', process.env.TASK_KEY || '');
const STORY = arg('story', process.env.JIRA_STORY_KEY || '');
const PROJECT = arg('project', process.env.JIRA_PROJECT_KEY || 'SAPP');
const MAX = parseInt(arg('max', '100'), 10) || 100;
const BASE = (process.env.JIRA_BASE_URL || '').replace(/\/+$/, '');
const KNOW = path.join(rc.REPO_ROOT, 'knowledge');
const BUGS_DIR = path.join(KNOW, 'bugs');

if (!TASK) { console.error('[learn-bugs] cần TASK context (TASK_ENV hoặc --task).'); process.exit(2); }
if (!BASE) { console.error('[learn-bugs] thiếu JIRA_BASE_URL.'); process.exit(2); }

const POD = process.env.PROJECT_OUTPUT_DIR || '';
const taskDir = POD ? path.resolve(rc.REPO_ROOT, POD, 'tasks', TASK) : '';
const slugify = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'bug';

/** tcId xuất hiện trong labels của issue (bug_reporter gắn label = tcId). */
function tcIdFromLabels(labels, known) {
  for (const l of labels || []) { if (known.has(l)) return l; }
  // fallback: label trông giống TC ID (CHỮ_HOA_TC_001)
  return (labels || []).find((l) => /_TC_\d+/i.test(l)) || null;
}

(async () => {
  const H = buildJiraHeaders();
  // Chỉ lấy bug do KIT tạo (label auto-bug). Ưu tiên khoanh theo story (parent), fallback theo tcId.
  const statusDoc = taskDir ? learn.readJson(path.join(taskDir, 'test-results', 'testcase-status.json')) : null;
  const tests = statusDoc ? (Array.isArray(statusDoc.tests) ? statusDoc.tests : Object.values(statusDoc.tests || {})) : [];
  const knownTc = new Set(tests.map((t) => t.tcId).filter(Boolean));

  let jql = `project = "${PROJECT}" AND labels = "auto-bug"`;
  if (STORY) jql += ` AND parent = "${STORY}"`;
  else if (knownTc.size) jql += ` AND labels in (${[...knownTc].slice(0, 50).map((t) => `"${t}"`).join(',')})`;
  else { console.error('[learn-bugs] không có --story lẫn testcase-status.json → không khoanh được bug của task.'); process.exit(2); }
  jql += ' ORDER BY created DESC';

  let issues = [];
  try {
    const r = await axios.post(`${BASE}/rest/api/3/search/jql`, { jql, fields: ['summary', 'status', 'labels', 'created', 'resolution'], maxResults: MAX }, { headers: H });
    issues = r.data.issues || [];
  } catch (e) {
    console.error('[learn-bugs] Jira query lỗi:', e.response ? `${e.response.status} ${JSON.stringify(e.response.data).slice(0, 200)}` : e.message);
    process.exit(1);
  }
  console.log(`[learn-bugs] JQL: ${jql}`);
  console.log(`[learn-bugs] Jira trả ${issues.length} bug (label auto-bug)${STORY ? ` dưới story ${STORY}` : ''}.`);
  if (!issues.length) { console.log('[learn-bugs] Không có bug nào → knowledge/bugs giữ nguyên (đúng: không có bug thì không học bug).'); return; }

  const modMap = taskDir ? learn.buildModuleMap(taskDir) : new Map();
  const created = []; const synced = []; const skipped = [];

  for (const it of issues) {
    const f = it.fields || {};
    const tcId = tcIdFromLabels(f.labels, knownTc);
    const module = (tcId && modMap.get(tcId)) || '(unmapped)';
    const file = path.join(BUGS_DIR, `${TASK}__${slugify(f.summary)}.json`);
    const jiraStatus = (f.status && f.status.name) || 'Open';

    if (fs.existsSync(file)) {
      // Idempotent: chỉ đồng bộ trạng thái (SCHEMA: cập nhật khi rerun chuyển Done).
      const cur = learn.readJson(file) || {};
      if (cur.jira_status !== jiraStatus) {
        cur.jira_status = jiraStatus;
        if (APPLY) fs.writeFileSync(file, JSON.stringify(cur, null, 2), 'utf8');
        synced.push(`${it.key}: ${cur.jira_status} → ${jiraStatus}`);
      } else skipped.push(it.key);
      continue;
    }
    const rec = {
      id: it.key,
      bug: String(f.summary || '').slice(0, 160),
      module,
      tags: [...new Set([...(f.labels || []).filter((l) => l !== 'auto-bug' && !knownTc.has(l)), module.toLowerCase().replace(/\s+/g, '-')])].slice(0, 8),
      task_key: TASK,
      detected_phase: 'phase2',
      confirmed_via_gate: true,           // đã qua Jira gate của bug_reporter mới tồn tại trên Jira
      jira_status: jiraStatus,
      created_at: String(f.created || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
      ...(tcId ? { tc_id: tcId } : {}),
    };
    if (APPLY) { fs.mkdirSync(BUGS_DIR, { recursive: true }); fs.writeFileSync(file, JSON.stringify(rec, null, 2), 'utf8'); }
    created.push({ file, rec });
  }

  // index.json (schema knowledge/SCHEMA.md) — idempotent theo `file`.
  if (APPLY && created.length) {
    const idxFile = path.join(KNOW, 'index.json');
    const idx = learn.readJson(idxFile) || { version: 1, updated_at: null, entries: [] };
    idx.entries = idx.entries || [];
    for (const c of created) {
      const rel = path.relative(KNOW, c.file).replace(/\\/g, '/');
      const rec = { type: 'bug', file: rel, module: c.rec.module, tags: c.rec.tags, task_key: TASK, status: c.rec.jira_status };
      const i = idx.entries.findIndex((x) => x && x.file === rel);
      if (i >= 0) idx.entries[i] = rec; else idx.entries.push(rec);
    }
    idx.updated_at = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(idxFile, JSON.stringify(idx, null, 2), 'utf8');
  }

  console.log(`\n[learn-bugs] ${APPLY ? 'GHI' : 'DRY-RUN'}: mới ${created.length} · đồng bộ trạng thái ${synced.length} · đã có ${skipped.length}`);
  created.slice(0, 10).forEach((c) => console.log(`  + ${c.rec.id} [${c.rec.module}] ${c.rec.bug.slice(0, 60)}`));
  synced.slice(0, 5).forEach((s) => console.log(`  ~ ${s}`));
  const unmapped = created.filter((c) => c.rec.module === '(unmapped)').length;
  if (unmapped) console.log(`  ⚠ ${unmapped} bug không map được module (thiếu testcase canonical hoặc label tcId) → risk_score gom vào "(unmapped)".`);
  if (!APPLY && created.length) console.log('[learn-bugs] Thêm --apply để ghi thật.');
  if (APPLY && created.length) console.log('[learn-bugs] Kế tiếp: `npm run risk` — Likelihood giờ có CẢ bugCount lẫn failRate.');
})();
