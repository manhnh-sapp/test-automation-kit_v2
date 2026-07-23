'use strict';

/*
 * output_rules.js — Rule chất lượng output máy-kiểm-được, DÙNG CHUNG cho các gate
 * (push_test_execution, bug_reporter, và các phase khác về sau).
 *
 * Mục tiêu: biến rule prose trong RULE_GLOBAL/prompt thành hàm thuần để gate:
 *   - AUTO-FIX phần deterministic an toàn (strip prefix status, strip debug token).
 *   - PHÁT HIỆN + báo phần không tự sửa an toàn được (run-on, thiếu evidence, thiếu video)
 *     → gate chặn, agent tự sửa trong session (không nhồi auto-fix dễ sai ngữ nghĩa).
 *
 * Không phụ thuộc gì ngoài path — an toàn để require ở bất kỳ script nào.
 */

const VISUAL_EXT = /\.(png|jpe?g|webp|gif|bmp|mp4|webm|mov|m4v)$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v)$/i;

const isVisualEvidence = (p) => VISUAL_EXT.test(String(p || ''));
const isVideoEvidence = (p) => VIDEO_EXT.test(String(p || ''));

// Prefix trạng thái thừa ở đầu comment (status đã có badge riêng trên Test Run).
const STATUS_PREFIX = /^\s*\[(pass|passed|fail|failed|positive|negative)\]\s*/i;

// Dấu vết debug bị cấm trong comment (RULE_GLOBAL §"Comment kết quả").
const DEBUG_TOKEN = /(?:\b[\w.]+=(?:true|false|null|\d[\d.]*|"[^"]*"|'[^']*'))|(?:\b\w+\s*→\s*\w+)|(?:\bmatched=\[[^\]]*\])|(?:\bval="[^"]*")/i;
const hasDebugTokens = (t) => DEBUG_TOKEN.test(String(t || ''));

// Số thô kiểu tiền/timestamp máy (gợi ý format lại — chỉ cảnh báo, không auto-đổi để tránh sai đơn vị).
const RAW_MONEY = /(?<![\d.,])\d{7,}(?![\d.,])/;

// Tách "ý" trong 1 chuỗi: theo xuống dòng, dấu ; , hoặc ranh giới câu.
function splitIdeas(text) {
  return String(text || '')
    .split(/\r?\n|;\s*|(?<=[.。!?])\s+(?=[A-ZĐÀ-Ỹ0-9])/)
    .map((s) => s.replace(/^\s*[-*•]\s*/, '').trim())
    .filter((s) => s.length > 2);
}

// Comment run-on = 1 đoạn dài KHÔNG bullet nhồi nhiều ý (RULE_GLOBAL §comment mục 4).
function looksRunOn(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  const lines = t.split(/\r?\n/).filter((l) => l.trim());
  if (lines.some((l) => /^\s*[-*•]\s+/.test(l))) return false; // đã có bullet → OK
  const ideas = splitIdeas(t);
  if (t.length > 160 && ideas.length >= 2) return true;
  if (ideas.length >= 3) return true;
  // Chuỗi mệnh đề nối bằng "và"/phẩy trên 1 dòng (không dấu câu) — kiểu "1 mạch text".
  // (dùng split theo khoảng trắng vì \b không nhận diện được từ có dấu tiếng Việt)
  const andCount = t.split(/\s+(?:và|nhưng|đồng thời|ngoài ra|cũng như)\s+/i).length - 1;
  const conj = andCount + (t.match(/[,;]/g) || []).length;
  if (conj >= 3 && t.length > 80) return true;
  return false;
}

/**
 * AUTO-FIX an toàn cho comment Xray: bỏ prefix status + xoá cụm debug trong ngoặc.
 * KHÔNG tự tách run-on thành bullet (dễ sai ngữ nghĩa tiếng Việt) — để gate chặn, agent tự viết lại.
 * @returns {{ text, changed, notes }}
 */
function cleanComment(text) {
  let t = String(text || '').trim();
  const notes = [];
  if (STATUS_PREFIX.test(t)) { t = t.replace(STATUS_PREFIX, '').trim(); notes.push('bỏ prefix [PASS]/[FAIL]'); }
  // Xoá cụm ngoặc chỉ chứa debug token, vd " (editable=false, atGateway=true)".
  const before = t;
  t = t.replace(/\s*\(([^()]*)\)/g, (m, inner) => (hasDebugTokens(inner) && !/[.,]/.test(inner.replace(DEBUG_TOKEN, '')) ? ' ' : m)).replace(/\s{2,}/g, ' ').trim();
  if (t !== before) notes.push('xoá cụm debug key=value');
  return { text: t, changed: notes.length > 0, notes };
}

/**
 * Lint 1 comment case → danh sách vi phạm CHẶN (sau khi đã cleanComment).
 * @returns {string[]} lý do vi phạm (rỗng = đạt)
 */
function lintComment(text) {
  const problems = [];
  const t = String(text || '').trim();
  if (looksRunOn(t)) problems.push('comment run-on (nhiều ý dồn 1 dòng) → tách mỗi ý 1 dòng "- …"');
  if (hasDebugTokens(t)) problems.push('còn dấu vết debug (key=value / A→A / matched=[…]) → viết lại thành ý người đọc hiểu');
  if (STATUS_PREFIX.test(t)) problems.push('mở đầu bằng [PASS]/[FAIL] (thừa — status đã có badge)');
  return problems;
}

/**
 * Gợi ý case PHỨC TẠP (cần video) từ tên/mô tả (RULE_GLOBAL mục 4 evidence + prompt log bug).
 */
const COMPLEX_HINT = /thanh toán|payment|cổng|gateway|async|bất đồng bộ|đồng bộ|sync|nhiều màn|multi.?screen|iframe|popup|modal|toast|drag|drop|upload|realtime|websocket|debounce|pagination|refund|hoàn tiền|webhook|end.?to.?end|e2e/i;
const looksComplex = (text) => COMPLEX_HINT.test(String(text || ''));

/**
 * Lint bộ evidence của 1 case đã execute.
 * @param {object} opts { evidences: string[], isComplex: bool, requireVideoWhenComplex: bool }
 */
function lintEvidence({ evidences = [], isComplex = false, requireVideoWhenComplex = true } = {}) {
  const problems = [];
  const visual = evidences.filter(isVisualEvidence);
  const nonVisual = evidences.filter((e) => e && !isVisualEvidence(e));
  if (!visual.length) problems.push('thiếu evidence ảnh/video (bắt buộc cho case đã execute)');
  if (nonVisual.length) problems.push(`có evidence KHÔNG phải ảnh/video (${nonVisual.map((e) => e.split(/[\\/]/).pop()).join(', ')}) → chỉ ảnh/video`);
  if (isComplex && requireVideoWhenComplex && !evidences.some(isVideoEvidence)) {
    problems.push('case phức tạp nhưng THIẾU video (ảnh không mô tả đủ chuỗi thao tác) → rerun quay video');
  }
  return problems;
}

/**
 * Lint description bug đã build (mảng heading) — phải ĐÚNG 4 phần, đúng thứ tự (prompt 08 §Description).
 */
const BUG_SECTIONS = ['Tiền điều kiện', 'Bước', 'Kết quả hiện tại', 'Kết quả mong muốn'];
function lintBugHeadings(headings = []) {
  const problems = [];
  const norm = headings.map((h) => String(h || '').replace(/[:.]$/, '').trim());
  if (norm.length !== BUG_SECTIONS.length) problems.push(`description có ${norm.length} phần, phải ĐÚNG 4 (${BUG_SECTIONS.join(' / ')})`);
  BUG_SECTIONS.forEach((s, i) => { if (norm[i] && norm[i].toLowerCase() !== s.toLowerCase()) problems.push(`phần ${i + 1} là "${norm[i]}", phải là "${s}"`); });
  const extra = norm.filter((h) => !BUG_SECTIONS.some((s) => s.toLowerCase() === h.toLowerCase()));
  if (extra.length) problems.push(`phần thừa cấm đưa vào description: ${extra.join(', ')} (ghi ở report local)`);
  return problems;
}

module.exports = {
  isVisualEvidence, isVideoEvidence,
  hasDebugTokens, looksRunOn, splitIdeas, looksComplex,
  cleanComment, lintComment, lintEvidence, lintBugHeadings,
  BUG_SECTIONS, RAW_MONEY,
};
