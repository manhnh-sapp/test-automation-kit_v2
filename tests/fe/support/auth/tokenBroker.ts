import { type Page, type APIResponse } from '@playwright/test';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { pickToken } = require('../../../../scripts/utils/auth/pick_token');

/*
 * Token Broker (giải quyết bearer token TTL 30' làm gián đoạn execute — phải F12 dán lại).
 * Dùng cho **MỌI SPA gửi `Authorization: Bearer <jwt>`** — cả OPS (token ở localStorage, SPA tự rotate) LẪN
 * LMS (Keycloak, token KHÔNG ở localStorage) — vì broker CAPTURE header thật SPA gửi, không phụ thuộc token lưu ở đâu.
 * Broker GIỮ 1 phiên login SỐNG rồi lấy token TƯƠI mỗi lần cần → KHÔNG cần dán OPS_API_TOKEN/LMS_API_TOKEN,
 * execute không đứt dù token 30' hết giữa chừng.
 *
 * Lấy token theo 2 tầng (ưu tiên tầng 1 vì đó CHÍNH XÁC token SPA đang dùng):
 *   1) CAPTURE: nghe request của SPA, bắt header `Authorization: Bearer ...` mới nhất (đúng token thật,
 *      không lệ thuộc tên key / định dạng lưu trong localStorage — tránh nhầm refreshToken → 401).
 *   2) FALLBACK: đọc localStorage rồi pickToken() auto-detect JWT (loại refreshToken).
 *   401/403 → reload (ép SPA refresh) → capture token mới → retry 1 lần.
 */

const LS_KEY = process.env.OPS_TOKEN_LS_KEY || undefined;
const CAPTURED = new WeakMap<Page, string>();

/** Gắn listener bắt Authorization header SPA gửi (idempotent). */
function attachCapture(page: Page): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = page as any;
  if (p.__brokerCapture) return;
  p.__brokerCapture = true;
  page.on('request', (r) => {
    const a = r.headers().authorization || r.headers().Authorization;
    if (a && /^bearer\s+eyJ/i.test(a)) CAPTURED.set(page, a.trim());
  });
}

/** Đọc localStorage → pickToken (fallback khi chưa capture được). */
async function readFromStorage(page: Page): Promise<string | null> {
  const entries = await page.evaluate(() => {
    const out: Record<string, string> = {};
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (k) out[k] = window.localStorage.getItem(k) || '';
    }
    return out;
  });
  const tok = pickToken(entries, { key: LS_KEY });
  return tok ? `Bearer ${tok}` : null;
}

/**
 * Token bearer hiện tại của phiên SPA sống. Trả 'Bearer <jwt>' hoặc null.
 * Ưu tiên header đã capture; chưa có thì reload để SPA tự gọi API rồi capture; cuối cùng fallback localStorage.
 */
export async function readOpsToken(page: Page): Promise<string | null> {
  attachCapture(page);
  if (CAPTURED.get(page)) return CAPTURED.get(page) as string;
  // Chưa bắt được request nào → ép SPA gọi API (reload) rồi thử lại.
  try { await page.reload({ waitUntil: 'networkidle', timeout: 30000 }); } catch { /* best-effort */ }
  if (CAPTURED.get(page)) return CAPTURED.get(page) as string;
  return readFromStorage(page);
}

/** Ép SPA tự refresh (reload/goto) rồi lấy lại token tươi (capture ưu tiên). */
export async function refreshOpsToken(page: Page, base?: string): Promise<string | null> {
  attachCapture(page);
  try {
    if (base) await page.goto(base, { waitUntil: 'networkidle', timeout: 30000 });
    else await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1200); // để SPA gọi API + refresh actToken nếu cần
  } catch { /* best-effort */ }
  if (CAPTURED.get(page)) return CAPTURED.get(page) as string;
  return readFromStorage(page);
}

/**
 * Gọi API bằng token tươi từ phiên SPA sống; 401/403 → reload refresh → retry; vẫn 401 + có `reauth` → login lại → retry.
 * → execute KHÔNG gián đoạn dù token 30' hết giữa chừng, KHÔNG cần dán token thủ công.
 *   opts.reauth: hàm login lại (vd loginLms/loginOps) — dùng khi phiên SSO chết hẳn (reload không đủ, hiếm trong 1 buổi).
 */
export async function brokerRequest(
  page: Page,
  method: 'get' | 'post' | 'put' | 'delete',
  url: string,
  opts: { data?: unknown; headers?: Record<string, string>; base?: string; reauth?: (p: Page) => Promise<void> } = {},
): Promise<APIResponse> {
  const call = (a: string | null): Promise<APIResponse> => page.request[method](url, {
    headers: { ...(a ? { Authorization: a } : {}), Accept: 'application/json', ...(opts.headers || {}) },
    ...(opts.data !== undefined ? { data: opts.data } : {}),
  });
  const denied = (s: number): boolean => s === 401 || s === 403;
  let res = await call(await readOpsToken(page));
  if (denied(res.status())) res = await call(await refreshOpsToken(page, opts.base));
  if (denied(res.status()) && opts.reauth) { await opts.reauth(page); res = await call(await readOpsToken(page)); }
  return res;
}

// Alias app-neutral: broker chạy cho MỌI SPA dùng Bearer (OPS lẫn LMS). Dùng tên này khi không riêng OPS.
export const readSpaToken = readOpsToken;
export const refreshSpaToken = refreshOpsToken;
export const spaRequest = brokerRequest;
