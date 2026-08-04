#!/usr/bin/env node
'use strict';

/*
 * learn_task.js — MẮT XÍCH HỌC còn thiếu: biến kết quả execute của 1 task thành learning data.
 *
 * Vấn đề nó giải: `knowledge/` trống dù đã làm nhiều task, vì 2 nguồn ghi đều không nối vào luồng thật —
 * metrics chỉ chạy trong CI `merge-report`, còn learning entry thì "Suggest-only" nên hay bị bỏ. Script này
 * gom lại thành MỘT lệnh chạy được cả local:
 *   1) KPI/flaky  → knowledge/metrics/{runs,tc-history}.jsonl   (gọi metrics_collect.js, nguồn: results.json)
 *   2) Snapshot   → knowledge/historical_execution/<TASK>__<date>.json  (nguồn: testcase-status.json)
 *      `modules` map theo TÊN MODULE NGHIỆP VỤ (không phải tên file) vì risk_score.js cộng fail/total
 *      theo module — map tcId→Module lấy từ testcase canonical (test-cases/*.md | from-xray/*.xlsx).
 *   3) index.json → thêm entry type=historical_execution (schema knowledge/SCHEMA.md).
 *
 * IDEMPOTENT: snapshot cùng {task,date} và metrics cùng {label,at} sẽ bị bỏ qua → chạy lại/backfill nhiều
 * lần KHÔNG nhân đôi dữ liệu. Thời điểm lấy từ artifact (generatedAt/mtime), KHÔNG lấy "bây giờ" khi backfill.
 *
 * Dùng:
 *   TASK_ENV=profiles/<TASK>/task.env node scripts/qa/learn_task.js            # 1 task (theo TASK context)
 *   node scripts/qa/learn_task.js --task SAPP-1234 --project-out outputs/<proj>
 *   node scripts/qa/learn_task.js --scan                                        # BACKFILL mọi task đã chạy
 *   [--dry-run] [--force]
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const rc = require(path.resolve(__dirname, '..', 'utils', 'runtime_config'));
const canonical = require(path.resolve(__dirname, '..', 'lib', 'testcase'));

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };
const flag = (n) => process.argv.includes(`--${n}`);

const SCAN = flag('scan');
const DRY = flag('dry-run');
const FORCE = flag('force');
const REPO = rc.REPO_ROOT;
const KNOW = path.join(REPO, 'knowledge');
const HIST_DIR = path.join(KNOW, 'historical_execution');

// Verdict → pass/fail/skip. Theo .agent/config/verdict_taxonomy.json: chỉ PASSED là pass, FAILED là fail,
// còn SKIP/BLOCKED_SETUP/SKIP_SETUP/TODO là skip (KHÔNG tính vào fail để không bôi đen module oan).
function bucket(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'PASSED' || s === 'PASS') return 'pass';
  if (s === 'FAILED' || s === 'FAIL') return 'fail';
  return 'skip';
}

/** Map tcId → module nghiệp vụ từ testcase canonical. Cột `Module` dạng "Nhóm / US" → lấy phần NHÓM. */
function buildModuleMap(taskDir) {
  const map = new Map();
  const dirs = [path.join(taskDir, 'test-cases'), path.join(taskDir, 'test-cases', 'from-xray')];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      const full = path.join(dir, f);
      if (!fs.statSync(full).isFile()) continue;
      let doc = null;
      try {
        if (f.endsWith('.md')) doc = canonical.parseMarkdown(fs.readFileSync(full, 'utf8'));
        else if (f.endsWith('.xlsx') && canonical.parseXlsx) doc = canonical.parseXlsx(full);
      } catch (e) { continue; } // file lỗi/không phải bảng testcase → bỏ qua, không chặn
      for (const t of (doc && doc.tests) || []) {
        if (!t.tcId) continue;
        const mod = String(t.module || '').split('/')[0].trim() || '(unmapped)';
        if (!map.has(t.tcId)) map.set(t.tcId, mod);
      }
    }
  }
  return map;
}

function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } }

/** results.json mới nhất của task (kể cả run-scoped runs/<RUN_ID>/). */
function findResults(taskDir) {
  const cands = [];
  const tr = path.join(taskDir, 'test-results');
  if (fs.existsSync(path.join(tr, 'results.json'))) cands.push(path.join(tr, 'results.json'));
  const runsDir = path.join(tr, 'runs');
  if (fs.existsSync(runsDir)) {
    for (const d of fs.readdirSync(runsDir)) {
      const p = path.join(runsDir, d, 'results.json');
      if (fs.existsSync(p)) cands.push(p);
    }
  }
  // thêm sub-dir 1 cấp (vd test-results/ui-cases/results.json)
  if (fs.existsSync(tr)) {
    for (const d of fs.readdirSync(tr)) {
      const p = path.join(tr, d, 'results.json');
      if (d !== 'runs' && fs.existsSync(p)) cands.push(p);
    }
  }
  return [...new Set(cands)];
}

function collectMetrics(resultsFile, label, atISO) {
  if (DRY) { console.log(`  [dry] metrics: ${path.relative(REPO, resultsFile)} label=${label} at=${atISO}`); return 'dry'; }
  const r = spawnSync(process.execPath, [path.join(__dirname, 'metrics_collect.js'), '--results', resultsFile, '--label', label, '--at', atISO], { encoding: 'utf8' });
  const out = `${r.stdout || ''}${r.stderr || ''}`.trim().split(/\r?\n/).pop() || '';
  return out.includes('BỎ QUA') ? 'dup' : (r.status === 0 ? 'ok' : `err(${r.status})`);
}

/** Snapshot historical_execution theo schema knowledge/SCHEMA.md. */
function writeSnapshot(taskKey, taskDir, statusDoc, resultsDoc, statusFile) {
  const tests = Array.isArray(statusDoc.tests) ? statusDoc.tests : Object.values(statusDoc.tests || {});
  if (!tests.length) return { skipped: 'không có test nào trong testcase-status.json' };

  // Thời điểm THẬT của lần execute: generatedAt của artifact → fallback mtime file.
  // TUYỆT ĐỐI không fallback "bây giờ" (backfill sẽ gán sai hết về hôm nay → trend vô nghĩa).
  let at;
  if (statusDoc.generatedAt) at = new Date(statusDoc.generatedAt);
  else if (statusFile && fs.existsSync(statusFile)) at = new Date(fs.statSync(statusFile).mtime);
  else at = new Date();
  const date = at.toISOString().slice(0, 10);
  const file = path.join(HIST_DIR, `${taskKey}__${date}.json`);
  if (fs.existsSync(file) && !FORCE) return { skipped: `đã có ${path.basename(file)} (dùng --force để ghi lại)` };

  const modMap = buildModuleMap(taskDir);
  const modules = {};
  let pass = 0, fail = 0, skip = 0, unmapped = 0;
  for (const t of tests) {
    const b = bucket(t.status);
    const mod = modMap.get(t.tcId) || '(unmapped)';
    if (mod === '(unmapped)') unmapped += 1;
    modules[mod] = modules[mod] || { total: 0, pass: 0, fail: 0, skip: 0 };
    modules[mod].total += 1; modules[mod][b] += 1;
    if (b === 'pass') pass += 1; else if (b === 'fail') fail += 1; else skip += 1;
  }
  // unassisted = pass NGAY (không retry). results.json có `expected` (pass clean) → chính xác hơn.
  let unassisted = (pass + fail) > 0 ? Math.round((pass / (pass + fail)) * 1000) / 1000 : null;
  const st = resultsDoc && resultsDoc.stats;
  if (st) {
    const clean = Number(st.expected || 0); const ran = clean + Number(st.flaky || 0) + Number(st.unexpected || 0);
    if (ran > 0) unassisted = Math.round((clean / ran) * 1000) / 1000;
  }
  const snap = { task_key: taskKey, date, phase: 'phase2', unassisted_pass_rate: unassisted, modules };

  if (DRY) { console.log(`  [dry] snapshot: ${path.relative(REPO, file)} · ${Object.keys(modules).length} module · pass ${pass}/fail ${fail}/skip ${skip}`); return { dry: true, modules, unmapped, pass, fail, skip }; }
  fs.mkdirSync(HIST_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(snap, null, 2), 'utf8');
  return { file, modules, unmapped, pass, fail, skip, date };
}

/** index.json: thêm/cập nhật entry historical_execution (idempotent theo `file`). */
function updateIndex(entries) {
  if (DRY || !entries.length) return 0;
  const idxFile = path.join(KNOW, 'index.json');
  const idx = readJson(idxFile) || { version: 1, updated_at: null, entries: [] };
  idx.entries = idx.entries || [];
  let added = 0;
  for (const e of entries) {
    const rel = path.relative(KNOW, e.file).replace(/\\/g, '/');
    const dominant = Object.entries(e.modules).sort((a, b) => b[1].total - a[1].total)[0];
    const rec = {
      type: 'historical_execution', file: rel,
      module: dominant ? dominant[0] : '(unmapped)',
      tags: Object.keys(e.modules).map((m) => m.toLowerCase().replace(/\s+/g, '-')).slice(0, 8),
      task_key: e.task_key, status: e.fail > 0 ? 'has-fail' : 'clean',
    };
    const i = idx.entries.findIndex((x) => x && x.file === rel);
    if (i >= 0) idx.entries[i] = rec; else { idx.entries.push(rec); added += 1; }
  }
  idx.updated_at = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(idxFile, JSON.stringify(idx, null, 2), 'utf8');
  return added;
}

/** 1 task: thu metrics + snapshot. */
function learnOne(taskKey, taskDir) {
  console.log(`\n▶ ${taskKey}  (${path.relative(REPO, taskDir)})`);
  const out = { taskKey, metrics: [], snapshot: null };

  for (const rf of findResults(taskDir)) {
    const atISO = new Date(fs.statSync(rf).mtime).toISOString(); // thời điểm THẬT của run
    const sub = path.relative(path.join(taskDir, 'test-results'), path.dirname(rf)).replace(/\\/g, '/');
    const label = sub && sub !== '.' ? `${taskKey}/${sub}` : taskKey;
    const st = collectMetrics(rf, label, atISO);
    out.metrics.push({ label, status: st });
    console.log(`  metrics[${st}] ${label} · ${atISO.slice(0, 10)}`);
  }

  const statusFile = path.join(taskDir, 'test-results', 'testcase-status.json');
  const statusDoc = readJson(statusFile);
  if (!statusDoc) { console.log('  snapshot: BỎ QUA — không có test-results/testcase-status.json'); return out; }
  const resultsDoc = readJson(path.join(taskDir, 'test-results', 'results.json'));
  const snap = writeSnapshot(taskKey, taskDir, statusDoc, resultsDoc, statusFile);
  if (snap.skipped) { console.log(`  snapshot: BỎ QUA — ${snap.skipped}`); return out; }
  out.snapshot = { ...snap, task_key: taskKey };
  const mods = Object.keys(snap.modules || {});
  console.log(`  snapshot: ${snap.dry ? '[dry] ' : ''}${mods.length} module · pass ${snap.pass} / fail ${snap.fail} / skip ${snap.skip}${snap.unmapped ? ` · ⚠ ${snap.unmapped} TC không map được module` : ''}`);
  return out;
}

function main() {
  const results = [];
  if (SCAN) {
    // Backfill: quét outputs/*/tasks/*/ có test-results/
    const outRoot = path.join(REPO, 'outputs');
    if (!fs.existsSync(outRoot)) { console.error('[learn] không có outputs/'); process.exit(2); }
    for (const proj of fs.readdirSync(outRoot)) {
      const tasksDir = path.join(outRoot, proj, 'tasks');
      if (!fs.existsSync(tasksDir)) continue;
      for (const task of fs.readdirSync(tasksDir)) {
        const taskDir = path.join(tasksDir, task);
        if (!fs.existsSync(path.join(taskDir, 'test-results'))) continue;
        results.push(learnOne(task, taskDir));
      }
    }
  } else {
    const TASK = arg('task', process.env.TASK_KEY || '');
    const POD = arg('project-out', process.env.PROJECT_OUTPUT_DIR || '');
    if (!TASK || !POD) { console.error('[learn] cần TASK context (TASK_ENV / --task + --project-out) hoặc --scan'); process.exit(2); }
    const taskDir = path.resolve(REPO, POD, 'tasks', TASK);
    if (!fs.existsSync(taskDir)) { console.error(`[learn] không thấy task dir: ${taskDir}`); process.exit(2); }
    results.push(learnOne(TASK, taskDir));
  }

  const snaps = results.map((r) => r.snapshot).filter(Boolean).filter((s) => !s.dry);
  const added = updateIndex(snaps);
  const nMetrics = results.reduce((a, r) => a + r.metrics.filter((m) => m.status === 'ok').length, 0);
  const nDup = results.reduce((a, r) => a + r.metrics.filter((m) => m.status === 'dup').length, 0);
  console.log(`\n[learn] ${results.length} task · metrics mới ${nMetrics} (bỏ qua trùng ${nDup}) · snapshot ${snaps.length} · index +${added}${DRY ? '  (DRY-RUN — chưa ghi gì)' : ''}`);
  if (!DRY && (nMetrics || snaps.length)) console.log('[learn] Kế tiếp: `npm run risk` (Likelihood từ fail thật) · `npm run reliability` · `npm run dashboard`.');
}

main();
