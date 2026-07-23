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

/**
 * Gate 1 bug SẮP tạo (dùng bởi bug_reporter.js trước createIssue/upload).
 * @param {object} bug { id, summary, actualResult, expectedResult, attachments:[path], headings?:[] }
 * @returns {string[]} vi phạm (rỗng = đạt)
 */
function gateBug(bug = {}) {
  const id = bug.id || bug.tcId || '(no-id)';
  const problems = [];
  const att = (Array.isArray(bug.attachments) ? bug.attachments : (bug.attachments ? [bug.attachments] : [])).map(String).filter(Boolean);
  const complex = rules.looksComplex([bug.summary, bug.title, id].filter(Boolean).join(' '));
  rules.lintEvidence({ evidences: att, isComplex: complex }).forEach((p) => problems.push(`${id}: ${p}`));
  if (rules.looksRunOn(bug.actualResult)) problems.push(`${id}: "Kết quả hiện tại" run-on (dồn nhiều ý 1 dòng) → mỗi ý 1 dòng/bullet`);
  if (rules.looksRunOn(bug.expectedResult)) problems.push(`${id}: "Kết quả mong muốn" run-on → mỗi ý 1 dòng/bullet`);
  if (Array.isArray(bug.headings)) rules.lintBugHeadings(bug.headings).forEach((p) => problems.push(`${id}: ${p}`));
  return problems;
}

function mainBug() {
  const PREVIEW = arg('preview', '');
  if (!PREVIEW || !fs.existsSync(PREVIEW)) { console.error('[gate] --mode bug cần --preview <bugs.json> (mảng {id,summary,actualResult,expectedResult,attachments})'); process.exit(2); }
  let arr;
  try { const d = JSON.parse(fs.readFileSync(PREVIEW, 'utf8')); arr = Array.isArray(d) ? d : (d.bugs || []); } catch (e) { console.error(`[gate] JSON lỗi: ${e.message}`); process.exit(2); }
  const problems = arr.flatMap((b) => gateBug(b));
  console.log(`[gate] bug · ${arr.length} bug · ${problems.length} vi phạm.`);
  if (!problems.length) { console.log('[gate] ✓ ĐẠT — đủ ảnh/video, không run-on.'); process.exit(0); }
  console.log('\n[gate] ✗ VI PHẠM (RULE_GLOBAL):');
  problems.forEach((p) => console.log(`  - ${p}`));
  console.log('\n  Nhắc: bug cần ≥1 ảnh/video; case phức tạp cần video; Kết quả hiện tại/mong muốn mỗi ý 1 dòng.');
  if (QA_APPROVED) { console.log('\n[gate] [--qa-approved] bỏ qua → exit 0.'); process.exit(0); }
  console.log('\n[gate] BLOCK.'); process.exit(1);
}

// ---- gen-testcase: parse bảng testcase 9 cột trong Markdown ----
function parseTestcaseTable(md) {
  const lines = String(md || '').split(/\r?\n/);
  const hi = lines.findIndex((l) => l.includes('|') && /TC ID/i.test(l) && /Kết quả mong đợi/i.test(l));
  if (hi < 0) return { rows: [], found: false };
  const cols = lines[hi].split('|').map((c) => c.trim());
  const idx = (name) => cols.findIndex((c) => c.toLowerCase() === name.toLowerCase());
  const tcI = idx('TC ID'); const stepI = idx('Các bước thực hiện'); const expI = idx('Kết quả mong đợi');
  const rows = [];
  for (let i = hi + 1; i < lines.length; i++) {
    const l = lines[i];
    if (!/^\s*\|/.test(l)) { if (l.trim() === '') continue; break; } // hết bảng (dòng không phải |… )
    if (/^\s*\|[\s|:-]+\|?\s*$/.test(l)) continue; // dòng separator |---|
    const cells = l.split('|').map((c) => c.trim());
    const tcId = cells[tcI] || '';
    if (!tcId || tcId.toLowerCase() === 'tc id') continue;
    rows.push({ tcId, steps: cells[stepI] || '', expected: cells[expI] || '' });
  }
  return { rows, found: true };
}

// Trả về { problems (CHẶN), warnings (cảnh báo) }. `;`-packing là warning trừ khi strictSemicolon.
function gateTestcaseRow(row, { strictSemicolon = false } = {}) {
  const problems = []; const warnings = [];
  const id = row.tcId || '(no-id)';
  if (rules.hasRangeGrouping(row.steps)) problems.push(`${id}: "Các bước" gộp range (vd 1-2.) — mỗi bước 1 số`);
  if (rules.hasRangeGrouping(row.expected)) problems.push(`${id}: "Kết quả mong đợi" gộp range (vd 1-2.) — mỗi bước 1 kết quả`);
  const sN = rules.leadingNumbers(row.steps); const eN = rules.leadingNumbers(row.expected);
  if (sN.length >= 2 && eN.length) {
    const s = [...new Set(sN)].sort((a, b) => a - b).join(','); const e = [...new Set(eN)].sort((a, b) => a - b).join(',');
    if (s !== e) problems.push(`${id}: "Kết quả mong đợi" đánh số [${e}] KHÔNG khớp "Các bước" [${s}]`);
  }
  const vague = rules.vagueExpectedLines(row.expected);
  if (vague.length) problems.push(`${id}: "Kết quả mong đợi" chung chung: "${vague.join('", "')}" — mô tả cụ thể (text/URL/element)`);
  const semi = String(row.expected).split(/<br\s*\/?>|\r?\n/).filter((l) => l.includes(';')).length;
  if (semi) (strictSemicolon ? problems : warnings).push(`${id}: "Kết quả mong đợi" nhồi ý bằng ";" (${semi} dòng) — nên tách mỗi ý 1 dòng "- "`);
  return { problems, warnings };
}

function mainGenTestcase() {
  const FILE = arg('file', ''); const DIR = arg('dir', ''); const STRICT_SEMI = has('strict');
  let files = [];
  if (FILE) files = [FILE];
  else if (DIR) { try { files = fs.readdirSync(DIR).filter((f) => f.endsWith('.md')).map((f) => path.join(DIR, f)); } catch (e) { console.error(`[gate] đọc --dir lỗi: ${e.message}`); process.exit(2); } }
  else { console.error('[gate] --mode gen-testcase cần --file <testcase.md> hoặc --dir <test-cases/>'); process.exit(2); }
  const problems = []; const warnings = []; let rowCount = 0; let fileCount = 0;
  for (const f of files) {
    if (!fs.existsSync(f)) { console.error(`[gate] không thấy: ${f}`); continue; }
    const { rows, found } = parseTestcaseTable(fs.readFileSync(f, 'utf8'));
    if (!found) { console.log(`[gate] ${path.basename(f)}: không thấy bảng testcase 9 cột — bỏ qua.`); continue; }
    fileCount++; rowCount += rows.length;
    for (const r of rows) {
      const res = gateTestcaseRow(r, { strictSemicolon: STRICT_SEMI });
      res.problems.forEach((p) => problems.push(`${path.basename(f)} · ${p}`));
      res.warnings.forEach((p) => warnings.push(`${path.basename(f)} · ${p}`));
    }
  }
  console.log(`[gate] gen-testcase · ${fileCount} file · ${rowCount} testcase · ${problems.length} CHẶN · ${warnings.length} cảnh báo${STRICT_SEMI ? ' (--strict)' : ''}.`);
  if (warnings.length) { console.log('\n[gate] ⚠ Cảnh báo (nên sửa, không chặn — thêm --strict để chặn):'); warnings.slice(0, 40).forEach((p) => console.log(`  ~ ${p}`)); if (warnings.length > 40) console.log(`  … +${warnings.length - 40} nữa`); }
  if (!problems.length) { console.log('\n[gate] ✓ ĐẠT (không lỗi CHẶN) — KQ mong đợi khớp bước, không gộp range, không chung chung.'); process.exit(0); }
  console.log('\n[gate] ✗ VI PHẠM CHẶN (RULE_GLOBAL + prompt 02 §6):');
  problems.forEach((p) => console.log(`  - ${p}`));
  console.log('\n  Nhắc: mỗi bước 1 số + 1 kết quả tương ứng (ngăn <br>); cấm gộp "1-2."; không ghi trơ "thành công/đúng".');
  if (QA_APPROVED) { console.log('\n[gate] [--qa-approved] bỏ qua → exit 0.'); process.exit(0); }
  console.log('\n[gate] BLOCK.'); process.exit(1);
}

function main() {
  if (MODE === 'bug') return mainBug();
  if (MODE === 'gen-testcase') return mainGenTestcase();
  if (MODE !== 'test-execution') { console.error(`[gate] mode "${MODE}" không hỗ trợ (test-execution | bug | gen-testcase).`); process.exit(2); }
  if (!STATUS) { console.error('[gate] Thiếu --status <testcase-status.json>.'); process.exit(2); }
  if (!fs.existsSync(STATUS)) { console.error(`[gate] Không thấy file: ${STATUS}`); process.exit(2); }

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

module.exports = { gateTestExecution, gateBug, gateTestcaseRow, parseTestcaseTable, isExecuted };

if (require.main === module) main();
