#!/usr/bin/env node
'use strict';

/*
 * metrics_collect.js (F11) — thu KPI mỗi lần chạy test → knowledge/metrics/ (tích luỹ theo thời gian).
 * Đọc Playwright JSON report (results.json). Ghi:
 *   - knowledge/metrics/runs.jsonl      : 1 dòng/run {at,label,testsFound,passed,failed,flaky,skipped,durationSec,passRate}
 *   - knowledge/metrics/tc-history.jsonl : 1 dòng/test/run {at,label,key,file,title,status,retries,flaky} (nguồn cho F10 reliability_index)
 * Append-only → số liệu KPI/độ tin cậy đầy dần. Nguồn cho dashboard (KPI + reliability).
 *
 * Dùng: node scripts/qa/metrics_collect.js --results <results.json> [--label "<nhãn run>"]
 *   Mặc định results = <TASK_OUTPUT_DIR>/test-results[/runs/<RUN_ID>]/results.json (nếu có TASK context).
 */

const fs = require('fs');
const path = require('path');
const rc = require(path.resolve(__dirname, '..', 'utils', 'runtime_config'));

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };

function resultsPath() {
  const explicit = arg('results');
  if (explicit) return path.resolve(explicit);
  try {
    const tr = rc.getTestResultsDir ? rc.getTestResultsDir() : null;
    if (tr) return path.join(tr, 'results.json');
  } catch (e) { /* no task context */ }
  return null;
}

const rp = resultsPath();
if (!rp || !fs.existsSync(rp)) { console.error(`[metrics] Không thấy results.json (${rp}). Truyền --results <file> hoặc đặt TASK context.`); process.exit(2); }

let doc;
try { doc = JSON.parse(fs.readFileSync(rp, 'utf8')); } catch (e) { console.error('[metrics] results.json parse lỗi:', e.message); process.exit(2); }

const at = new Date().toISOString();
const label = arg('label') || process.env.RUN_ID || path.basename(path.dirname(rp));
const st = doc.stats || {};
// Semantics rõ (P2): passed_clean = pass ngay (expected) · passed_flaky = pass sau retry (flaky) ·
// eventual_success = clean + flaky. Tách 2 tỉ lệ: cleanPassRate (governance thật) vs eventualPassRate.
const passedClean = Number(st.expected || 0);
const passedFlaky = Number(st.flaky || 0);
const failed = Number(st.unexpected || 0);
const skipped = Number(st.skipped || 0);
const ran = passedClean + passedFlaky + failed;
const eventualSuccess = passedClean + passedFlaky;
const testsFound = ran + skipped;
const durationSec = Math.round((Number(st.duration || 0) / 1000) * 10) / 10;
const cleanPassRate = ran > 0 ? Math.round((passedClean / ran) * 1000) / 1000 : null;
const eventualPassRate = ran > 0 ? Math.round((eventualSuccess / ran) * 1000) / 1000 : null;
// giữ tên cũ (passed/flaky/passRate) để dashboard/tương thích ngược.
const passed = passedClean; const flaky = passedFlaky; const passRate = cleanPassRate;

// Per-TC: walk suites đệ quy.
const tcRecs = [];
function walk(suites, file) {
  for (const s of suites || []) {
    const f = s.file || file || '';
    for (const spec of s.specs || []) {
      for (const t of spec.tests || []) {
        const results = t.results || [];
        const final = results[results.length - 1] || {};
        const status = final.status || 'unknown';
        const retries = Math.max(0, results.length - 1);
        const isFlaky = retries > 0 && status === 'passed';
        tcRecs.push({ at, label, key: `${f}::${spec.title}`, file: f, title: spec.title, status, retries, flaky: isFlaky });
      }
    }
    if (s.suites) walk(s.suites, f);
  }
}
walk(doc.suites, '');

const OUT = path.resolve(arg('out', path.join(rc.REPO_ROOT, 'knowledge', 'metrics')));
fs.mkdirSync(OUT, { recursive: true });
const runRec = { at, label, testsFound, passedClean, passedFlaky, eventualSuccess, failed, skipped, durationSec, cleanPassRate, eventualPassRate, passed, flaky, passRate };
fs.appendFileSync(path.join(OUT, 'runs.jsonl'), JSON.stringify(runRec) + '\n', 'utf8');
if (tcRecs.length) fs.appendFileSync(path.join(OUT, 'tc-history.jsonl'), tcRecs.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');

console.log(`[metrics] run "${label}": ${testsFound} test · clean ${passedClean} · flaky ${passedFlaky} · fail ${failed} · skip ${skipped} · ${durationSec}s · cleanPassRate ${cleanPassRate ?? 'n/a'} · eventual ${eventualPassRate ?? 'n/a'}`);
console.log(`[metrics] → knowledge/metrics/runs.jsonl (+${tcRecs.length} per-TC vào tc-history.jsonl)`);
