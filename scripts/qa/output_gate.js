#!/usr/bin/env node
'use strict';

/*
 * output_gate.js — Gate chất lượng output THỰC THI, tự chạy trước khi push Jira/Xray.
 *
 * Vì sao: rule chất lượng (RULE_GLOBAL + prompt) trước nay là prose → agent dễ lướt qua →
 * bug/test-execution ra sai (comment run-on, thiếu evidence/step status, thiếu video case phức tạp,
 * bug description thừa phần). Gate này biến rule máy-kiểm-được thành check THỰC THI:
 *   - TỰ SỬA phần deterministic an toàn (--fix): bỏ prefix [PASS], xoá debug key=value trong comment.
 *   - CHẶN (exit 1) phần không tự sửa an toàn được, in checklist để agent tự sửa trong session.
 * NON-INVASIVE: chỉ đọc/ghi file status local, KHÔNG gọi Jira/Xray → chạy/test được không cần mạng.
 *
 * Dùng (wire vào workflow phase2_04 TRƯỚC push_test_execution):
 *   node scripts/qa/output_gate.js --mode test-execution --status <testcase-status.json>
 *   node scripts/qa/output_gate.js --mode test-execution --status <file> --fix   # tự sửa comment rồi ghi lại
 *   thêm --qa-approved để QA cố ý bỏ qua (vẫn in cảnh báo, exit 0).
 *
 * Exit: 0 = đạt (hoặc đã --qa-approved); 1 = có vi phạm chặn (chưa đạt).
 */

const fs = require('fs');
const path = require('path');
const rules = require(path.resolve(__dirname, 'lib', 'output_rules'));

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };
const has = (n) => process.argv.includes(`--${n}`);

const MODE = arg('mode', 'test-execution');
const STATUS = arg('status', '');
const FIX = has('fix');
const QA_APPROVED = has('qa-approved');

const PASS_RE = /^(pass|passed)$/i;
const FAIL_RE = /^(fail|failed)$/i;
const isExecuted = (s) => PASS_RE.test(String(s || '').trim()) || FAIL_RE.test(String(s || '').trim());

// evidence có thể là string | array; step dùng evidence | evidences.
const evList = (v) => (Array.isArray(v) ? v : (v ? [v] : [])).map(String).filter(Boolean);

function gateTestExecution(doc, { fix = false } = {}) {
  const tests = Array.isArray(doc) ? doc : (doc.tests || doc.testcases || []);
  const problems = [];
  const fixes = [];
  let executed = 0;

  for (const t of tests) {
    const id = t.testKey || t.tcId || t.id || '(no-id)';
    if (!isExecuted(t.status)) continue;
    executed++;

    // 1) Comment: auto-fix an toàn + chặn phần còn lại.
    if (fix) {
      const c = rules.cleanComment(t.comment);
      if (c.changed) { t.comment = c.text; fixes.push(`${id}: comment (${c.notes.join(', ')})`); }
    }
    rules.lintComment(t.comment).forEach((p) => problems.push(`${id}: ${p}`));

    // 2) Evidence: gộp case + step.
    const caseEv = evList(t.evidence);
    const steps = Array.isArray(t.steps) ? t.steps : [];
    const stepEv = steps.flatMap((s) => evList(s.evidence).concat(evList(s.evidences)));
    const allEv = [...caseEv, ...stepEv];

    if (!caseEv.some(rules.isVisualEvidence) && !stepEv.some(rules.isVisualEvidence)) {
      problems.push(`${id}: THIẾU evidence ảnh/video (case đã execute bắt buộc có)`);
    }
    const nonVisual = allEv.filter((e) => !rules.isVisualEvidence(e));
    if (nonVisual.length) problems.push(`${id}: evidence KHÔNG phải ảnh/video: ${nonVisual.map((e) => e.split(/[\\/]/).pop()).join(', ')} (chỉ nhận .png/.jpg/.webp/.gif/.mp4/.webm)`);

    // 3) Step status: mọi step phải có status (không để trống → "TO DO" rối).
    const stepsNoStatus = steps.filter((s) => !String(s.status || '').trim()).length;
    if (steps.length && stepsNoStatus) problems.push(`${id}: ${stepsNoStatus}/${steps.length} step THIẾU status (mỗi step phải PASS/FAIL)`);
    // step (nếu có khai) nên có evidence riêng.
    const stepsNoEv = steps.filter((s) => !evList(s.evidence).concat(evList(s.evidences)).some(rules.isVisualEvidence)).length;
    if (steps.length && stepsNoEv) problems.push(`${id}: ${stepsNoEv}/${steps.length} step THIẾU evidence ảnh/video riêng`);

    // 4) Video cho case phức tạp.
    if (rules.looksComplex([t.comment, id, t.name].filter(Boolean).join(' ')) && allEv.length && !allEv.some(rules.isVideoEvidence)) {
      problems.push(`${id}: case có dấu hiệu PHỨC TẠP nhưng thiếu VIDEO (ảnh không mô tả đủ chuỗi bước) → rerun quay video`);
    }
  }

  return { problems, fixes, executed, doc: Array.isArray(doc) ? { tests } : doc };
}

function main() {
  if (!STATUS) { console.error('[gate] Thiếu --status <testcase-status.json>.'); process.exit(2); }
  if (!fs.existsSync(STATUS)) { console.error(`[gate] Không thấy file: ${STATUS}`); process.exit(2); }
  if (MODE !== 'test-execution') { console.error(`[gate] mode "${MODE}" chưa hỗ trợ (hiện: test-execution).`); process.exit(2); }

  let doc;
  try { doc = JSON.parse(fs.readFileSync(STATUS, 'utf8')); } catch (e) { console.error(`[gate] JSON lỗi: ${e.message}`); process.exit(2); }

  const { problems, fixes, executed, doc: outDoc } = gateTestExecution(doc, { fix: FIX });

  if (FIX && fixes.length) {
    fs.writeFileSync(STATUS, JSON.stringify(Array.isArray(doc) ? outDoc.tests : outDoc, null, 2), 'utf8');
    console.log(`[gate] TỰ SỬA ${fixes.length} chỗ (ghi lại ${path.basename(STATUS)}):`);
    fixes.forEach((f) => console.log(`  ✎ ${f}`));
  }

  console.log(`[gate] test-execution · ${executed} case đã execute · ${problems.length} vi phạm chặn.`);
  if (!problems.length) { console.log('[gate] ✓ ĐẠT — comment gọn, evidence/step/video đủ.'); process.exit(0); }

  console.log('\n[gate] ✗ VI PHẠM (RULE_GLOBAL — sửa cho đúng rồi chạy lại, đừng push):');
  problems.forEach((p) => console.log(`  - ${p}`));
  console.log('\n  Nhắc: comment mỗi ý 1 dòng "- …", không debug key=value; mọi step PASS/FAIL + ảnh riêng; case phức tạp cần video.');
  if (QA_APPROVED) { console.log('\n[gate] [--qa-approved] QA cố ý bỏ qua → exit 0 (đã ghi log vi phạm ở trên).'); process.exit(0); }
  console.log('\n[gate] BLOCK: chưa được push. (Muốn bỏ qua có chủ đích: --qa-approved.)');
  process.exit(1);
}

module.exports = { gateTestExecution, isExecuted };

if (require.main === module) main();
