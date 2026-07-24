#!/usr/bin/env node
'use strict';

/*
 * self_review.js (G9 — round-3) — Lượt 2: đối chiếu CHECKLIST trước khi finalize (ADVISORY, KHÔNG chặn).
 *
 * Chống "check chưa kỹ": gom tất cả gate liên quan của 1 task vào MỘT báo cáo checklist để agent tự soi
 * trước khi kết luận/publish — thay vì rải rác từng gate. Điều phối (không viết lại) preflight + design_gate
 * + output_gate (gen-testcase rows + test-execution). CHỈ cảnh báo (exit 0), nêu rõ còn CHẶN ở gate nào.
 *
 * Dùng: node scripts/qa/self_review.js [--task <TASK_KEY>] [--tc-dir <dir>] [--status <testcase-status.json>]
 *   Tự định vị artifact task qua PROJECT_OUTPUT_DIR + TASK_KEY nếu không truyền path.
 * Exit: luôn 0 (advisory). Dòng cuối tóm tắt số CHẶN/cảnh báo còn tồn.
 */

const fs = require('fs');
const path = require('path');
const rc = require(path.resolve(__dirname, '..', 'utils', 'runtime_config'));
const preflight = require(path.resolve(__dirname, 'preflight_gate'));
const outputGate = require(path.resolve(__dirname, 'output_gate'));
const designGate = require(path.resolve(__dirname, 'design_gate'));

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };

const TASK = arg('task', process.env.TASK_KEY || '');
const POD = process.env.PROJECT_OUTPUT_DIR || '';
const taskDir = (TASK && POD) ? path.resolve(rc.REPO_ROOT, POD, 'tasks', TASK) : null;

const checks = [];
const add = (name, { problems = [], warnings = [], skipped = false, note = '' } = {}) => checks.push({ name, problems, warnings, skipped, note });

// 1) Preflight — config/context integrity.
{
  const r = preflight.runPreflight({ mode: TASK ? 'phase2' : 'generic', task: TASK });
  add('Preflight (input/config)', { problems: r.problems || [], warnings: r.warnings || [] });
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
  add('Testcase design + row-quality', { problems, warnings, skipped: !files.length, note: files.length ? `${files.length} file` : 'không có .md' });
} else add('Testcase design + row-quality', { skipped: true, note: 'không thấy test-cases/' });

// 3) Execution output (comment/evidence/tầng-lỗi/attestation).
const statusFile = arg('status', taskDir ? path.join(taskDir, 'test-results', 'testcase-status.json') : '');
if (statusFile && fs.existsSync(statusFile)) {
  try {
    const doc = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
    const g = outputGate.gateTestExecution(doc);
    add('Execution output', { problems: g.problems, warnings: g.warnings, note: `${g.executed} case đã execute` });
  } catch (e) { add('Execution output', { problems: [`testcase-status.json lỗi JSON: ${e.message}`] }); }
} else add('Execution output', { skipped: true, note: 'không thấy testcase-status.json' });

// ---- In checklist gộp ----
let totalProblems = 0; let totalWarnings = 0;
console.log(`\n=== SELF-REVIEW (G9) — lượt 2 trước finalize${TASK ? ` · task ${TASK}` : ''} ===`);
for (const c of checks) {
  const np = c.problems.length; const nw = c.warnings.length; totalProblems += np; totalWarnings += nw;
  const mark = c.skipped ? '○ n/a' : (np ? '✗ CHẶN' : (nw ? '⚠ warn' : '✓ OK'));
  console.log(`\n${mark}  ${c.name}${c.note ? ` (${c.note})` : ''}`);
  c.problems.slice(0, 15).forEach((p) => console.log(`    - ${p}`));
  if (np > 15) console.log(`    … +${np - 15} CHẶN nữa`);
  c.warnings.slice(0, 8).forEach((p) => console.log(`    ~ ${p}`));
  if (nw > 8) console.log(`    … +${nw - 8} cảnh báo nữa`);
}
console.log(`\n=== Tổng: ${totalProblems} CHẶN · ${totalWarnings} cảnh báo ===`);
if (totalProblems) console.log(`⚠ Còn ${totalProblems} vấn đề CHẶN — SỬA trước khi finalize/publish (self-review chỉ advisory, gate thật sẽ chặn ở publish).`);
else console.log('✓ Không còn vấn đề CHẶN. Rà cảnh báo rồi finalize.');
process.exit(0);
