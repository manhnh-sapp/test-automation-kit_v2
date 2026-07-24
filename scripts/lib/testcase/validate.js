'use strict';

/*
 * validate — kiểm STRUCTURAL (đủ cột canonical) + COMPLETENESS (ô lõi không rỗng) trên TestCaseDoc.
 * Superset của design_gate.gateDesign (GĐ 1b sẽ cho design_gate delegate về đây). Row-quality/oracle
 * (KQ khớp bước, range, tautology) vẫn ở output_rules — validate KHÔNG lặp lại, chỉ structural/completeness.
 */

const m = require('./model');

const REQUIRED_COLS = [
  ['TC ID', m.COL.tcId], ['Module', m.COL.module], ['Trường hợp kiểm thử', m.COL.title],
  ['Tiền điều kiện', m.COL.precondition], ['Các bước thực hiện', m.COL.steps],
  ['Kết quả mong đợi', m.COL.expected], ['Ưu tiên', m.COL.priority], ['Mức độ rủi ro', m.COL.risk],
];
// ô lõi mỗi TC không được rỗng (KQ mong đợi để output_rules lo oracle-rỗng; precondition/data có thể rỗng hợp lệ)
const REQUIRED_FIELDS = [['module', 'Module'], ['title', 'Trường hợp kiểm thử'], ['stepsRaw', 'Các bước thực hiện'], ['priority', 'Ưu tiên'], ['risk', 'Mức độ rủi ro']];

/**
 * @param {import('./model').TestCaseDoc} doc
 * @returns {{ problems: string[], warnings: string[] }}
 */
function validate(doc) {
  const problems = []; const warnings = [];
  if (!doc || !doc.tests || !doc.tests.length) { problems.push('Không có testcase nào (bảng 9-cột không parse được).'); return { problems, warnings }; }

  // 1) STRUCTURAL — đủ cột canonical.
  for (const [label, matcher] of REQUIRED_COLS) {
    if (m.colIndex(doc.headers || [], matcher) < 0) problems.push(`Bảng testcase THIẾU cột "${label}" (canonical) — downstream sẽ vỡ`);
  }
  // 2) COMPLETENESS — ô lõi không rỗng.
  for (const tc of doc.tests) {
    const id = tc.tcId || '(no-id)';
    for (const [field, label] of REQUIRED_FIELDS) {
      if (!String(tc[field] || '').trim()) problems.push(`${id}: rỗng ô "${label}"`);
    }
  }
  // 3) DIMENSION (set-level) — cảnh báo.
  const dims = new Set(doc.tests.flatMap((t) => t.dimensions));
  if (!dims.has('negative')) warnings.push('Bộ testcase chưa có case [Negative] nào — mọi chức năng nên có ≥1 negative');
  const highs = doc.tests.filter((t) => /high|cao/i.test(t.risk));
  if (highs.length && !dims.has('boundary') && !dims.has('security')) {
    warnings.push(`Có ${highs.length} case High-risk nhưng chưa thấy [Boundary]/[Security] — chạy risk:gate:enforce để ép depth`);
  }
  return { problems, warnings };
}

module.exports = { validate, REQUIRED_COLS, REQUIRED_FIELDS };
