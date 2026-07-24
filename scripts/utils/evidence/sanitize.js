'use strict';

/*
 * sanitize.js (#3 EvidenceManager — concern Sanitizer) — LƯỚI AN TOÀN mask PII trong text evidence.
 * RULE_GLOBAL bắt agent tự mask PII khách (email/SĐT/…) trong comment/report; sanitizer này bắt phần
 * agent LỠ QUÊN — mask deterministic trước khi persist. Bảo thủ (chỉ pattern PII rõ) để không phá số
 * nghiệp vụ (tiền/ID/deal). Dependency-free.
 */

// Email: user@domain.tld
const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
// SĐT VN: +84 hoặc 0 + 9 số (mobile 10 số) — KHÔNG bắt số 7/11+ chữ số (tiền/ID).
const PHONE_VN = /(?<![\d])(?:\+84|0)\d{9}(?![\d])/g;

/** Có dấu hiệu PII (email/SĐT) không — cho gate cảnh báo. */
function hasPII(text) {
  const s = String(text || '');
  EMAIL.lastIndex = 0; PHONE_VN.lastIndex = 0;
  return EMAIL.test(s) || PHONE_VN.test(s);
}

/** Mask PII trong text: email → [email], SĐT → [phone]. Giữ nguyên phần còn lại. */
function sanitize(text) {
  if (text == null) return text;
  return String(text).replace(EMAIL, '[email]').replace(PHONE_VN, '[phone]');
}

/** Đếm số PII bị mask (để log). */
function countPII(text) {
  const s = String(text || '');
  return (s.match(EMAIL) || []).length + (s.match(PHONE_VN) || []).length;
}

module.exports = { sanitize, hasPII, countPII, EMAIL, PHONE_VN };
