#!/usr/bin/env node
'use strict';

/*
 * self_review.js (G9 round-3 · #2 dùng GateEngine) — Lượt 2: đối chiếu CHECKLIST trước finalize (ADVISORY).
 *
 * Chống "check chưa kỹ": gom mọi gate liên quan của 1 task → MỘT báo cáo qua GateEngine (interface
 * chuẩn {gateId,status,severity,findings} + aggregate). Điều phối (không viết lại) preflight + design_gate
 * + output_gate (gen-testcase rows + test-execution). CHỈ advisory (exit 0), nêu rõ còn CHẶN ở gate nào.
 *
 * Dùng: node scripts/qa/self_review.js [--task <TASK_KEY>] [--tc-dir <dir>] [--status <testcase-status.json>]
 * Exit: luôn 0 (advisory).
 */

const fs = require('fs');
const path = require('path');
const rc = require(path.resolve(__dirname, '..', 'utils', 'runtime_config'));
const preflight = require(path.resolve(__dirname, 'preflight_gate'));
const outputGate = require(path.resolve(__dirname, 'output_gate'));
const designGate = require(path.resolve(__dirname, 'design_gate'));
const engine = require(path.resolve(__dirname, 'lib', 'gate_engine'));

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };

const TASK = arg('task', process.env.TASK_KEY || '');
const POD = process.env.PROJECT_OUTPUT_DIR || '';
const taskDir = (TASK && POD) ? path.resolve(rc.REPO_ROOT, POD, 'tasks', TASK) : null;

const results = [];

// 1) Preflight — input/config integrity.
{
  const r = preflight.runPreflight({ mode: TASK ? 'phase2' : 'generic', task: TASK });
  results.push(engine.toResult('preflight (input/config)', { problems: r.problems || [], warnings: r.warnings || [], severity: engine.SEVERITY.P0 }));
}

// 2) Testcase design + row-quality.
const tcDir = arg('tc-dir', taskDir ? path.join(taskDir, 'test-cases') : '');
if (tcDir && fs.existsSync(tcDir)) {
  const files = fs.readdirSync(tcDir).filter((f) => f.endsWith('.md'));
  const problems = []; const warnings = [];
  for (const f of files) {
    const md = fs.readFileSync(path.join(tcDir, f), 'utf8');
    const d = designGate.gateDesign(md);
    (d.problems || []).forEach((p) => problems.push(`${f}: ${p}`));
    (d.warnings || []).forEach((p) => warnings.push(`${f}: ${p}`));
    const parsed = outputGate.parseTestcaseTable(md);
    for (const row of parsed.rows) { const g = outputGate.gateTestcaseRow(row); g.problems.forEach((p) => problems.push(`${f}: ${p}`)); g.warnings.forEach((p) => warnings.push(`${f}: ${p}`)); }
  }
  results.push(engine.toResult('testcase design + row-quality', { problems, warnings, skipped: !files.length, note: files.length ? `${files.length} file` : 'không có .md', severity: engine.SEVERITY.P0 }));
} else {
  results.push(engine.toResult('testcase design + row-quality', { skipped: true, note: 'không thấy test-cases/', severity: engine.SEVERITY.P0 }));
}

// 3) Execution output (comment/evidence/tầng-lỗi/attestation).
const statusFile = arg('status', taskDir ? path.join(taskDir, 'test-results', 'testcase-status.json') : '');
if (statusFile && fs.existsSync(statusFile)) {
  try {
    const doc = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
    const g = outputGate.gateTestExecution(doc);
    results.push(engine.toResult('execution output', { problems: g.problems, warnings: g.warnings, note: `${g.executed} case đã execute`, severity: engine.SEVERITY.P0 }));
  } catch (e) {
    results.push(engine.toResult('execution output', { problems: [`testcase-status.json lỗi JSON: ${e.message}`], severity: engine.SEVERITY.P0 }));
  }
} else {
  results.push(engine.toResult('execution output', { skipped: true, note: 'không thấy testcase-status.json', severity: engine.SEVERITY.P0 }));
}

// 4) Learning data (F10/F11) — chống "làm nhiều task mà knowledge/ vẫn trống".
// Workflow phase2_04 Bước 9 yêu cầu ghi learning entry, nhưng vốn "Suggest-only" nên hay bị bỏ →
// check ở đây: đã execute (có testcase-status.json) thì PHẢI có snapshot + KPI cho task này.
{
  const know = path.join(rc.REPO_ROOT, 'knowledge');
  const executed = Boolean(statusFile && fs.existsSync(statusFile));
  if (!executed || !TASK) {
    results.push(engine.toResult('learning data (knowledge/)', { skipped: true, note: executed ? 'thiếu TASK_KEY' : 'chưa execute', severity: engine.SEVERITY.P1 }));
  } else {
    const problems = [];
    const histDir = path.join(know, 'historical_execution');
    const hasSnap = fs.existsSync(histDir) && fs.readdirSync(histDir).some((f) => f.startsWith(`${TASK}__`));
    if (!hasSnap) problems.push(`Thiếu knowledge/historical_execution/${TASK}__<date>.json (snapshot pass/fail theo module — input cho risk_score + dashboard)`);
    const runsFile = path.join(know, 'metrics', 'runs.jsonl');
    let hasKpi = false;
    if (fs.existsSync(runsFile)) {
      hasKpi = fs.readFileSync(runsFile, 'utf8').split(/\r?\n/).filter(Boolean).some((line) => {
        try { return String(JSON.parse(line).label || '').split('/')[0] === TASK; } catch (e) { return false; }
      });
    }
    if (!hasKpi) problems.push(`Thiếu KPI cho ${TASK} trong knowledge/metrics/runs.jsonl (nguồn cho reliability/flaky)`);
    if (problems.length) problems.push('→ Chạy: `TASK_ENV=profiles/<TASK>/task.env npm run learn` (idempotent, chạy lại không nhân đôi).');
    results.push(engine.toResult('learning data (knowledge/)', { problems, note: problems.length ? 'learning loop ĐỨT — task chạy xong nhưng không học được gì' : 'đã tích luỹ snapshot + KPI', severity: engine.SEVERITY.P1 }));
  }
}

// ---- Gộp + in qua GateEngine ----
const agg = engine.aggregate(results);
console.log(engine.format(agg, { title: `SELF-REVIEW (G9) — lượt 2 trước finalize${TASK ? ` · task ${TASK}` : ''}` }));
if (agg.totalFail) console.log(`\n⚠ Còn ${agg.totalFail} vấn đề CHẶN — SỬA trước khi finalize/publish (self-review advisory; gate thật chặn ở push).`);
else console.log('\n✓ Không còn vấn đề CHẶN. Rà cảnh báo rồi finalize.');
process.exit(0);
