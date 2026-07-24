#!/usr/bin/env node
'use strict';

/*
 * design_gate.js (G5 — round-3) — Gate CHẤT LƯỢNG THIẾT KẾ testcase (Phase 1), THỰC THI.
 *
 * Biến `tc_validator` (SKILL agent-gọi, bỏ được) thành check máy-chặn cho phần CHƯA được ép ở nơi khác:
 *   - STRUCTURAL : bảng testcase phải đủ cột canonical (thiếu/đổi tên cột = CHẶN → downstream vỡ).
 *   - COMPLETENESS: mỗi TC không được rỗng ô lõi (Module/Trường hợp/Các bước/Ưu tiên/Mức độ rủi ro) = CHẶN.
 *   - DIMENSION  : bộ testcase nên có ≥1 case [Negative]; High-risk nên có [Boundary]/[Security] = cảnh báo.
 * KHÔNG viết lại phần đã có: row-quality/oracle → output_gate (--mode gen-testcase); depth/dimension
 * per-module theo risk band → risk_gate (npm run risk:gate:enforce). design_gate ĐIỀU PHỐI + bổ khuyết.
 *
 * Dùng: node scripts/qa/design_gate.js --file <testcase.md> [--dir test-cases/] [--with-rows] [--qa-approved]
 *   --with-rows: chạy kèm output_gate gen-testcase (row-quality/oracle) để ra 1 báo cáo Phase-1 đầy đủ.
 * Exit: 0 = đạt (hoặc --qa-approved) · 1 = có CHẶN · 2 = lỗi dùng sai.
 */

const fs = require('fs');
const path = require('path');
const outputGate = require(path.resolve(__dirname, 'output_gate'));
const testcaseModel = require(path.resolve(__dirname, '..', 'lib', 'testcase')); // #1: parser canonical DUY NHẤT

// #1 (formalize): gateDesign DELEGATE canonical.validate (structural + completeness + dimension) —
// KHÔNG còn giữ logic riêng. validate() là superset đã dựng ở #1 GĐ1a; 1 nguồn kiểm thiết kế.
function gateDesign(md) {
  const doc = testcaseModel.parseMarkdown(md);
  if (!doc.tests.length) return { found: false, problems: [], warnings: [], rowCount: 0 };
  const { problems, warnings } = testcaseModel.validate(doc);
  return { found: true, problems, warnings, rowCount: doc.tests.length };
}

function runFile(file, { withRows }) {
  const md = fs.readFileSync(file, 'utf8');
  const base = path.basename(file);
  const d = gateDesign(md);
  if (!d.found) { console.log(`[design] ${base}: không thấy bảng testcase 9 cột — bỏ qua.`); return { problems: [], warnings: [], rowCount: 0, found: false }; }
  const problems = d.problems.map((p) => `${base} · ${p}`);
  const warnings = d.warnings.map((p) => `${base} · ${p}`);
  // Điều phối: chạy kèm row-quality/oracle của output_gate (không viết lại).
  if (withRows) {
    const parsed = outputGate.parseTestcaseTable(md);
    for (const r of parsed.rows) {
      const g = outputGate.gateTestcaseRow(r);
      g.problems.forEach((p) => problems.push(`${base} · [row] ${p}`));
      g.warnings.forEach((p) => warnings.push(`${base} · [row] ${p}`));
    }
  }
  return { problems, warnings, rowCount: d.rowCount, found: true };
}

function main() {
  const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };
  const has = (n) => process.argv.includes(`--${n}`);
  const FILE = arg('file', ''); const DIR = arg('dir', ''); const WITH_ROWS = has('with-rows'); const QA_APPROVED = has('qa-approved');

  let files = [];
  if (FILE) files = [FILE];
  else if (DIR) { try { files = fs.readdirSync(DIR).filter((f) => f.endsWith('.md')).map((f) => path.join(DIR, f)); } catch (e) { console.error(`[design] đọc --dir lỗi: ${e.message}`); process.exit(2); } }
  else { console.error('[design] cần --file <testcase.md> hoặc --dir <test-cases/>'); process.exit(2); }

  const problems = []; const warnings = []; let rowCount = 0; let fileCount = 0;
  for (const f of files) {
    if (!fs.existsSync(f)) { console.error(`[design] không thấy: ${f}`); continue; }
    const r = runFile(f, { withRows: WITH_ROWS });
    if (r.found) fileCount++;
    rowCount += r.rowCount; problems.push(...r.problems); warnings.push(...r.warnings);
  }

  console.log(`[design] ${fileCount} file · ${rowCount} testcase · ${problems.length} CHẶN · ${warnings.length} cảnh báo${WITH_ROWS ? ' (kèm row-quality)' : ''}.`);
  if (warnings.length) { console.log('\n[design] ⚠ Cảnh báo (nên sửa, không chặn):'); warnings.slice(0, 40).forEach((p) => console.log(`  ~ ${p}`)); if (warnings.length > 40) console.log(`  … +${warnings.length - 40} nữa`); }
  if (!problems.length) { console.log('\n[design] ✓ ĐẠT — đủ cột canonical, không rỗng ô lõi.'); process.exit(0); }

  console.log('\n[design] ✗ VI PHẠM CHẶN (thiết kế testcase dở — sửa rồi chạy lại):');
  problems.forEach((p) => console.log(`  - ${p}`));
  console.log('\n  Nhắc: đủ 8 cột canonical (TC ID/Module/Trường hợp/Tiền điều kiện/Các bước/Kết quả mong đợi/Ưu tiên/Mức độ rủi ro); không rỗng ô lõi. Depth per-module: risk:gate:enforce.');
  if (QA_APPROVED) { console.log('\n[design] [--qa-approved] bỏ qua → exit 0 (đã log).'); process.exit(0); }
  console.log('\n[design] BLOCK.');
  process.exit(1);
}

module.exports = { gateDesign };

if (require.main === module) main();
