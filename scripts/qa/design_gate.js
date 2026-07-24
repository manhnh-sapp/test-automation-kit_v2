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

// Cột canonical của bảng testcase 9 cột (khớp prompt gen Phase 1). 'Dữ liệu Test' optional.
const REQUIRED_COLS = ['TC ID', 'Module', 'Trường hợp kiểm thử', 'Tiền điều kiện', 'Các bước thực hiện', 'Kết quả mong đợi', 'Ưu tiên', 'Mức độ rủi ro'];
// Ô lõi mỗi TC bắt buộc không rỗng (Kết quả mong đợi để output_gate lo oracle-rỗng; Dữ liệu Test/Tiền điều kiện có thể rỗng hợp lệ).
const REQUIRED_CELLS = ['Module', 'Trường hợp kiểm thử', 'Các bước thực hiện', 'Ưu tiên', 'Mức độ rủi ro'];

// Parse bảng testcase → { found, header:[], rows:[{colName: value}] }.
function parseFullTable(md) {
  const lines = String(md || '').split(/\r?\n/);
  const hi = lines.findIndex((l) => l.includes('|') && /TC ID/i.test(l) && /Kết quả mong đợi/i.test(l));
  if (hi < 0) return { found: false, header: [], rows: [] };
  const header = lines[hi].split('|').map((c) => c.trim()).filter((c, i, a) => !(i === 0 && !c) && !(i === a.length - 1 && !c));
  const rows = [];
  for (let i = hi + 1; i < lines.length; i++) {
    const l = lines[i];
    if (!/^\s*\|/.test(l)) { if (l.trim() === '') continue; break; }
    if (/^\s*\|[\s|:-]+\|?\s*$/.test(l)) continue; // separator |---|
    const cells = l.split('|').map((c) => c.trim());
    // cells có phần tử rỗng đầu/cuối do pipe biên → map theo vị trí header (bù offset 1 nếu có leading empty)
    const offset = cells[0] === '' ? 1 : 0;
    const row = {};
    header.forEach((h, idx) => { row[h] = (cells[idx + offset] || '').trim(); });
    const tcId = row['TC ID'] || '';
    if (!tcId || tcId.toLowerCase() === 'tc id') continue;
    rows.push(row);
  }
  return { found: true, header, rows };
}

function gateDesign(md) {
  const problems = []; const warnings = [];
  const { found, header, rows } = parseFullTable(md);
  if (!found) return { found: false, problems, warnings, rowCount: 0 };

  // 1) STRUCTURAL — đủ cột canonical.
  const norm = header.map((h) => h.toLowerCase());
  for (const col of REQUIRED_COLS) {
    if (!norm.includes(col.toLowerCase())) problems.push(`Bảng testcase THIẾU cột "${col}" (cột canonical) — downstream (convert/gate/risk) sẽ vỡ`);
  }

  // 2) COMPLETENESS — mỗi TC không rỗng ô lõi.
  for (const r of rows) {
    const id = r['TC ID'] || '(no-id)';
    for (const col of REQUIRED_CELLS) {
      if (col in r && !String(r[col] || '').trim()) problems.push(`${id}: rỗng ô "${col}" — testcase thiết kế dở`);
    }
  }

  // 3) DIMENSION (set-level) — cảnh báo (depth per-module do risk_gate ép).
  const allCases = rows.map((r) => r['Trường hợp kiểm thử'] || '').join(' \n ').toLowerCase();
  if (rows.length && !/\[negative\]|negative|âm tính|không hợp lệ/.test(allCases)) {
    warnings.push('Bộ testcase chưa thấy case [Negative] nào — mọi chức năng nên có ít nhất 1 negative (input sai/không hợp lệ/không quyền)');
  }
  const highRows = rows.filter((r) => /high|cao/i.test(r['Mức độ rủi ro'] || ''));
  if (highRows.length && !/\[boundary\]|boundary|biên|\[security\]|security|bảo mật|idor|injection/.test(allCases)) {
    warnings.push(`Có ${highRows.length} case High-risk nhưng chưa thấy dimension [Boundary]/[Security] — chạy \`npm run risk:gate:enforce\` để ép depth theo band`);
  }

  return { found: true, problems, warnings, rowCount: rows.length };
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

module.exports = { gateDesign, parseFullTable, REQUIRED_COLS, REQUIRED_CELLS };

if (require.main === module) main();
