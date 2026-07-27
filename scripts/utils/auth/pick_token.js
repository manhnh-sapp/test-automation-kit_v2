'use strict';

/*
 * pick_token.js (Token Broker — chọn bearer token hiện tại từ localStorage của SPA).
 * SPA OPS tự refresh actToken (dùng cả ngày không login lại) → chỉ cần ĐỌC token tươi từ localStorage.
 * pickToken auto-detect JWT (không cần biết tên key), ưu tiên key act/access/token; nhận cả blob JSON.
 * Pure (dependency-free) → offline-test được. TS broker (tokenBroker.ts) đọc localStorage rồi gọi hàm này.
 */

const JWT_RE = /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/;
const looksJwt = (v) => typeof v === 'string' && JWT_RE.test(v.trim());

/** Rút token từ 1 value: JWT trực tiếp, hoặc blob JSON chứa field token. */
function extract(v) {
  if (looksJwt(v)) return v.trim();
  if (typeof v === 'string' && v.trim().startsWith('{')) {
    try { const o = JSON.parse(v); for (const k of ['actToken', 'accessToken', 'access_token', 'token', 'idToken', 'jwt']) if (looksJwt(o && o[k])) return o[k].trim(); } catch (e) { /* not json */ }
  }
  return null;
}

/**
 * Chọn bearer token từ localStorage entries.
 * @param {Record<string,string>|Array<{name:string,value:string}>} entries
 * @param {{ key?: string }} [opts] key ưu tiên (env OPS_TOKEN_LS_KEY)
 * @returns {string|null} token thô (không kèm 'Bearer ')
 */
function pickToken(entries, opts = {}) {
  const map = Array.isArray(entries) ? Object.fromEntries(entries.map((e) => [e.name, e.value])) : (entries || {});
  if (opts.key && map[opts.key] != null) { const t = extract(map[opts.key]); if (t) return t; }
  // LOẠI refreshToken (không dùng làm bearer — sẽ 401). Ưu tiên access/act-token > token/auth chung.
  const keys = Object.keys(map).filter((k) => !/refresh/i.test(k));
  const strong = keys.filter((k) => /act.?token|access.?token|\baccess/i.test(k));
  const weak = keys.filter((k) => !strong.includes(k) && /bearer|\bauth|token|jwt/i.test(k));
  const rest = keys.filter((k) => !strong.includes(k) && !weak.includes(k));
  for (const k of [...strong, ...weak, ...rest]) { const t = extract(map[k]); if (t) return t; }
  return null;
}

module.exports = { pickToken, looksJwt, extract };
