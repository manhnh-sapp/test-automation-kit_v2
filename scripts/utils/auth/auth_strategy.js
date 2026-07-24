'use strict';

/*
 * auth_strategy.js (P1 Auth Strategy — quyết định phương thức auth).
 * Ưu tiên rẻ→đắt để NÉ throttle/lockout: reuse session cache > API token > UI login.
 *   - storage : có session cache còn tươi → seed cookies+localStorage, KHÔNG login.
 *   - api     : có OPS_API_TOKEN → seed token trực tiếp (không mở form login).
 *   - ui      : fallback — login form (đắt nhất, dễ dính throttle nếu lặp).
 * `prefer` (khác 'auto') = ép phương thức cụ thể (test 1 luồng). Pure — offline-test được.
 */

const METHODS = ['storage', 'api', 'ui'];

/**
 * @param {{ freshSession?: boolean, apiToken?: boolean, prefer?: 'auto'|'storage'|'api'|'ui' }} o
 * @returns {'storage'|'api'|'ui'}
 */
function chooseMethod({ freshSession = false, apiToken = false, prefer = 'auto' } = {}) {
  if (prefer && prefer !== 'auto') {
    if (!METHODS.includes(prefer)) throw new Error(`auth prefer không hợp lệ: ${prefer} (storage|api|ui|auto)`);
    return prefer;
  }
  if (freshSession) return 'storage';
  if (apiToken) return 'api';
  return 'ui';
}

module.exports = { chooseMethod, METHODS };
