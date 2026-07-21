#!/usr/bin/env node
'use strict';

/*
 * Seed Knowledge từ lịch sử Jira/Xray (Suggest-only, DRY-RUN mặc định).
 *
 * Vì sao: kit chỉ điền knowledge/ khi bug qua Jira gate ở Phase 2 (learning_recorder).
 * Dự án mới → knowledge rỗng → risk_score cold-start chỉ dựa Impact (đoán Likelihood).
 * Script này nạp bug đã resolved + kết quả execution cũ có sẵn trên Jira/Xray vào
 * knowledge/{bugs,historical_execution} → risk_score có ngay Likelihood thật
 * (bugCount + failRate) thay vì cold-start. Không đổi risk_score, chỉ cấp dữ liệu.
 *
 * AN TOÀN:
 *   - DRY-RUN mặc định (chỉ in preview + bảng map module). Phải --apply mới ghi file.
 *   - Chỉ đọc Jira/Xray (GET/JQL/GraphQL query). KHÔNG tạo/sửa issue.
 *   - KHÔNG ghi PII: mask email/SĐT trong mô tả; chỉ trích field theo SCHEMA (không description/assignee).
 *   - Idempotent: dedup theo bug id (chạy lại không nhân đôi).
 *   - Chỉ seed bug có resolution = fix thật (loại Duplicate/Won't Do/Cannot Reproduce...).
 *   - Đánh dấu source="jira-seed" để phân biệt với bug qua kit-gate (learning_recorder).
 *
 * Dùng:
 *   node scripts/qa/seed_knowledge_from_jira.js                         # dry-run, project = JIRA_PROJECT_KEY
 *   node scripts/qa/seed_knowledge_from_jira.js --project SAPP --since 2025-01-01
 *   node scripts/qa/seed_knowledge_from_jira.js --module-from label --label-prefix module-
 *   node scripts/qa/seed_knowledge_from_jira.js --with-execution        # + seed historical_execution (Xray)
 *   node scripts/qa/seed_knowledge_from_jira.js --apply                 # ghi thật vào knowledge/
 *   node scripts/qa/seed_knowledge_from_jira.js --jql 'project=SAPP AND issuetype=Bug AND fixVersion="2025.Q4"' --apply
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const rc = require(path.resolve(__dirname, '..', 'utils', 'runtime_config'));
const jiraUtils = require(path.resolve(__dirname, '..', 'integrations', 'jira', 'utils'));
const { XrayCloudClient, isUsableCreds } = require(path.resolve(__dirname, '..', 'integrations', 'jira', 'xray_cloud'));

jiraUtils.loadEnv();

const KNOW = path.join(rc.REPO_ROOT, 'knowledge');
const BASE = String(process.env.JIRA_BASE_URL || process.env.JIRA_URL || '').replace(/\/+$/, '');

// ---------- args ----------
const has = (n) => process.argv.includes(`--${n}`);
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };

const APPLY = has('apply');
const PROJECT = arg('project', process.env.JIRA_PROJECT_KEY);
const MODULE_FROM = String(arg('module-from', 'component')).toLowerCase(); // component | label
const LABEL_PREFIX = arg('label-prefix', '');
const SINCE = arg('since', '');
const MAX = parseInt(arg('max', '500'), 10);
const CUSTOM_JQL = arg('jql', '');
const WITH_EXEC = has('with-execution');
const EXEC_MAX = Math.min(100, parseInt(arg('exec-max', '50'), 10));
const FALLBACK_MODULE = arg('fallback-module', '');
const INCLUDE_ALL_RES = has('include-all-resolutions');

// Label không mang nghĩa module (do kit/tooling tự gắn) → không dùng làm module/tag.
const GENERIC_LABELS = new Set(['auto-bug', 'qa-testcase', 'deprecated', 'out-of-scope', 'stale-from-excel', 'bug']);
const isGenericLabel = (l) => GENERIC_LABELS.has(String(l).toLowerCase()) || /^task-/i.test(l) || /^sprint/i.test(l);
// Resolution KHÔNG phải fix thật → không seed (không phải confirmed product bug).
const NON_FIX_RES = /duplicate|won'?t\s*(do|fix)|cannot\s*reproduce|can'?t\s*reproduce|not\s*a\s*bug|rejected|declined|incomplete|gone\s*away|as\s*designed/i;

// ---------- helpers ----------
const today = () => new Date().toISOString().slice(0, 10);
const kebab = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
  .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60);
const scrubPII = (s) => String(s || '')
  .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, '[email]')
  .replace(/(?<![\w.])(?:\+?84|0)\d{8,10}(?![\w.])/g, '[phone]');

function jiraStatusOf(fields) {
  const cat = (fields.status && fields.status.statusCategory && fields.status.statusCategory.key) || '';
  if (cat === 'done') return 'Done';
  if (cat === 'indeterminate') return 'In Progress';
  return 'Open';
}

function resolveModule(fields) {
  const comps = (fields.components || []).map((c) => c.name).filter(Boolean);
  const labels = (fields.labels || []).filter(Boolean);
  const stripPrefix = (l) => (LABEL_PREFIX && l.startsWith(LABEL_PREFIX) ? l.slice(LABEL_PREFIX.length) : l);
  const labelCands = LABEL_PREFIX ? labels.filter((l) => l.startsWith(LABEL_PREFIX)).map(stripPrefix) : labels.filter((l) => !isGenericLabel(l));

  if (MODULE_FROM === 'label') {
    if (labelCands.length) return labelCands[0];
    if (comps.length) return comps[0];
  } else {
    if (comps.length) return comps[0];
    if (labelCands.length) return labelCands[0];
  }
  return FALLBACK_MODULE || null;
}

function tagsOf(fields) {
  const raw = [
    ...(fields.components || []).map((c) => c.name),
    ...(fields.labels || []).filter((l) => !isGenericLabel(l)),
    fields.priority && fields.priority.name,
  ].filter(Boolean).map((t) => kebab(t)).filter(Boolean);
  return [...new Set(raw)].slice(0, 6);
}

// ---------- Jira search (endpoint mới /search/jql, fallback /search cũ) ----------
async function searchModern(jql, fields, cap) {
  const headers = jiraUtils.buildJiraHeaders();
  const out = []; let nextPageToken;
  do {
    const body = { jql, fields, maxResults: 100 };
    if (nextPageToken) body.nextPageToken = nextPageToken;
    const r = await axios.post(`${BASE}/rest/api/3/search/jql`, body, { headers });
    (r.data.issues || []).forEach((i) => out.push(i));
    nextPageToken = r.data.nextPageToken;
    if (r.data.isLast || !(r.data.issues || []).length) break;
  } while (nextPageToken && out.length < cap);
  return out.slice(0, cap);
}
async function searchLegacy(jql, fields, cap) {
  const headers = jiraUtils.buildJiraHeaders();
  const out = []; let startAt = 0; let total = Infinity;
  while (startAt < total && out.length < cap) {
    const r = await axios.post(`${BASE}/rest/api/3/search`, { jql, fields, startAt, maxResults: 100 }, { headers });
    const issues = r.data.issues || [];
    issues.forEach((i) => out.push(i));
    total = Number.isFinite(r.data.total) ? r.data.total : out.length;
    startAt += 100;
    if (!issues.length) break;
  }
  return out.slice(0, cap);
}
async function searchIssues(jql, fields, cap) {
  try { return await searchModern(jql, fields, cap); }
  catch (e) { return await searchLegacy(jql, fields, cap); }
}

// ---------- knowledge writes ----------
function purgeById(dir, id) {
  const p = path.join(KNOW, dir);
  if (!fs.existsSync(p)) return;
  for (const f of fs.readdirSync(p)) {
    if (!f.endsWith('.json')) continue;
    try { const o = JSON.parse(fs.readFileSync(path.join(p, f), 'utf8')); if (o.id === id) fs.unlinkSync(path.join(p, f)); } catch { /* ignore */ }
  }
}
function rebuildIndex() {
  const entries = [];
  const add = (type, dir, statusPick) => {
    const p = path.join(KNOW, dir);
    if (!fs.existsSync(p)) return;
    for (const f of fs.readdirSync(p).filter((x) => x.endsWith('.json'))) {
      let o; try { o = JSON.parse(fs.readFileSync(path.join(p, f), 'utf8')); } catch { continue; }
      entries.push({ type, file: `${dir}/${f}`, module: o.module || null, tags: o.tags || [], task_key: o.task_key || o.id || null, status: statusPick(o) });
    }
  };
  add('bug', 'bugs', (o) => o.jira_status || null);
  add('root_cause', 'root_causes', (o) => o.status || null);
  add('historical_execution', 'historical_execution', () => null);
  add('locator', 'locators', () => null);
  fs.writeFileSync(path.join(KNOW, 'index.json'), JSON.stringify({ version: 1, updated_at: today(), entries }, null, 2), 'utf8');
  return entries.length;
}

// ---------- main ----------
async function seedBugs() {
  const jql = CUSTOM_JQL || [
    `project = "${PROJECT}"`, 'issuetype = Bug', 'statusCategory = Done',
    SINCE ? `resolutiondate >= "${SINCE}"` : '',
  ].filter(Boolean).join(' AND ') + ' ORDER BY resolutiondate DESC';

  console.log(`[seed] Bug JQL: ${jql}`);
  const fields = ['summary', 'components', 'labels', 'priority', 'status', 'resolution', 'resolutiondate', 'created'];
  const issues = await searchIssues(jql, fields, MAX);
  console.log(`[seed] Jira trả ${issues.length} bug (cap ${MAX}).`);

  const planned = []; const skipped = { resolution: 0, noModule: 0 };
  const perModule = {};
  for (const it of issues) {
    const f = it.fields || {};
    const resName = (f.resolution && f.resolution.name) || '';
    if (!INCLUDE_ALL_RES && resName && NON_FIX_RES.test(resName)) { skipped.resolution++; continue; }
    const module = resolveModule(f);
    if (!module) { skipped.noModule++; continue; }
    const summary = scrubPII(f.summary || '');
    const slug = kebab(summary) || kebab(it.key);
    const entry = {
      id: it.key,
      bug: summary,
      module,
      tags: tagsOf(f),
      task_key: it.key,
      detected_phase: 'historical',
      confirmed_via_gate: true,
      jira_status: jiraStatusOf(f),
      created_at: (f.created || '').slice(0, 10) || today(),
      source: 'jira-seed',
      jira_resolution: resName || null,
      resolved_at: (f.resolutiondate || '').slice(0, 10) || null,
    };
    planned.push({ file: `bugs/${it.key}__${slug}.json`, entry, comps: (f.components || []).map((c) => c.name), labels: f.labels || [] });
    perModule[module] = (perModule[module] || 0) + 1;
  }

  console.log(`\n[seed] Map module (module-from=${MODULE_FROM}${LABEL_PREFIX ? `, prefix="${LABEL_PREFIX}"` : ''}):`);
  console.log('  Module'.padEnd(34) + '#bug');
  Object.entries(perModule).sort((a, b) => b[1] - a[1]).forEach(([m, n]) => console.log('  ' + m.padEnd(32) + ' ' + n));
  console.log(`\n[seed] Mẫu 8 map đầu (KEY → module ← nguồn):`);
  planned.slice(0, 8).forEach((p) => console.log(`  ${p.entry.id} → "${p.entry.module}"  ←  comp[${p.comps.join(',') || '-'}] label[${p.labels.join(',') || '-'}]`));
  console.log(`\n[seed] Sẽ ghi ${planned.length} bug · bỏ ${skipped.resolution} (resolution không phải fix) · ${skipped.noModule} (không suy được module).`);

  if (APPLY && planned.length) {
    fs.mkdirSync(path.join(KNOW, 'bugs'), { recursive: true });
    for (const p of planned) { purgeById('bugs', p.entry.id); fs.writeFileSync(path.join(KNOW, p.file), JSON.stringify(p.entry, null, 2), 'utf8'); }
    console.log(`[seed] ✓ Đã ghi ${planned.length} file vào knowledge/bugs/.`);
  }
  return planned.length;
}

const bucket = (statusName) => (/pass/i.test(statusName) ? 'pass' : /fail/i.test(statusName) ? 'fail' : 'skip');

async function seedExecution() {
  if (!isUsableCreds(process.env.XRAY_CLIENT_ID, process.env.XRAY_CLIENT_SECRET)) {
    console.log('[seed] --with-execution: thiếu XRAY_CLIENT_ID/SECRET → BỎ QUA phần execution (bug vẫn seed).');
    return 0;
  }
  const xc = new XrayCloudClient({ clientId: process.env.XRAY_CLIENT_ID, clientSecret: process.env.XRAY_CLIENT_SECRET, baseUrl: process.env.XRAY_CLOUD_BASE_URL });
  let execs;
  try {
    const d = await xc.graphql(
      `query($jql:String!,$limit:Int!){ getTestExecutions(jql:$jql, limit:$limit){ total results { issueId jira(fields:["key","created"]) } } }`,
      { jql: `project = "${PROJECT}" AND issuetype = "Test Execution" ORDER BY created DESC`, limit: EXEC_MAX });
    execs = (d.getTestExecutions && d.getTestExecutions.results) || [];
  } catch (e) {
    console.log(`[seed] --with-execution: Xray GraphQL lỗi (${String(e.message).slice(0, 120)}) → BỎ QUA execution. Schema Xray có thể khác version; bug vẫn seed.`);
    return 0;
  }
  console.log(`\n[seed] Xray: ${execs.length} Test Execution (cap ${EXEC_MAX}).`);
  let written = 0;
  for (const ex of execs) {
    const key = (ex.jira && ex.jira.key) || ex.issueId;
    const date = ((ex.jira && ex.jira.created) || '').slice(0, 10) || today();
    let runs;
    try {
      const r = await xc.graphql(
        `query($ids:[String],$limit:Int!){ getTestRuns(testExecIssueIds:$ids, limit:$limit){ total results { status{ name } test{ jira(fields:["key","labels","components"]) } } } }`,
        { ids: [String(ex.issueId)], limit: 100 });
      runs = (r.getTestRuns && r.getTestRuns.results) || [];
    } catch { continue; }
    const modules = {};
    for (const run of runs) {
      const jf = (run.test && run.test.jira) || {};
      const module = resolveModule({ components: (jf.components || []).map((c) => (typeof c === 'string' ? { name: c } : c)), labels: jf.labels || [] });
      if (!module) continue;
      const m = modules[module] || (modules[module] = { total: 0, pass: 0, fail: 0, skip: 0 });
      m.total++; m[bucket((run.status && run.status.name) || '')]++;
    }
    if (!Object.keys(modules).length) continue;
    const tot = Object.values(modules).reduce((a, v) => a + v.pass + v.fail, 0);
    const pass = Object.values(modules).reduce((a, v) => a + v.pass, 0);
    const snap = { task_key: key, date, phase: 'phase2', unassisted_pass_rate: tot ? Math.round((pass / tot) * 100) / 100 : 0, modules, source: 'xray-seed' };
    console.log(`  ${key} (${date}): ${Object.keys(modules).length} module, ${tot} run`);
    if (APPLY) {
      fs.mkdirSync(path.join(KNOW, 'historical_execution'), { recursive: true });
      fs.writeFileSync(path.join(KNOW, 'historical_execution', `${key}__${date}.json`), JSON.stringify(snap, null, 2), 'utf8');
      written++;
    }
  }
  if (APPLY) console.log(`[seed] ✓ Đã ghi ${written} snapshot vào knowledge/historical_execution/.`);
  return written;
}

async function main() {
  if (!BASE) { console.error('[seed] Thiếu JIRA_BASE_URL. Điền .env (xem scripts/integrations/jira/.env.example).'); process.exit(1); }
  if (!PROJECT && !CUSTOM_JQL) { console.error('[seed] Thiếu --project hoặc JIRA_PROJECT_KEY (hoặc dùng --jql).'); process.exit(1); }
  console.log(`[seed] MODE: ${APPLY ? 'APPLY (ghi thật)' : 'DRY-RUN (chỉ preview — thêm --apply để ghi)'} · project=${PROJECT || '(từ --jql)'}`);

  await seedBugs();
  if (WITH_EXEC) await seedExecution();

  if (APPLY) {
    const n = rebuildIndex();
    console.log(`[seed] ✓ Rebuild knowledge/index.json (${n} entry).`);
    console.log('[seed] Xong. Chạy `npm run risk` để thấy Likelihood có dữ liệu (hết cold-start). QA nên soi lại bảng map module.');
  } else {
    console.log('\n[seed] DRY-RUN — chưa ghi gì. Kiểm bảng map module ở trên; ổn thì chạy lại với --apply.');
  }
}

main().catch((e) => { console.error('[seed] LỖI:', e && e.message ? e.message : e); process.exit(1); });
