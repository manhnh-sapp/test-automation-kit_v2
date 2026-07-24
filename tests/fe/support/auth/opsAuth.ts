import { type Page, type BrowserContext } from '@playwright/test';
import { loginOps, OPS_USER } from '../opsLogin';

// JS libs (CommonJS) — pure logic đã offline-test.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sessionCache = require('../../../../scripts/utils/auth/session_cache');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const authStrategy = require('../../../../scripts/utils/auth/auth_strategy');

/*
 * Auth Strategy (P1) — reuse session né throttle/lockout, additive (KHÔNG thay loginOps).
 * ensureOpsAuth: session cache còn tươi → SEED cookies+localStorage (không login); else login UI rồi cache.
 * ⚠️ Luồng login thật cần UAT smoke để nghiệm thu (browser + creds). Pure logic (cache/decision) đã test offline.
 */

export interface EnsureAuthOpts {
  ttlMinutes?: number;
  prefer?: 'auto' | 'storage' | 'api' | 'ui';
  key?: string;
}

export async function ensureOpsAuth(page: Page, context: BrowserContext, opts: EnsureAuthOpts = {}): Promise<string> {
  const key: string = opts.key || OPS_USER || 'ops';
  const fresh: boolean = sessionCache.isFresh(key, opts.ttlMinutes ?? 25);
  const method: string = authStrategy.chooseMethod({
    freshSession: fresh,
    apiToken: Boolean(process.env.OPS_API_TOKEN),
    prefer: opts.prefer,
  });

  if (method === 'storage') {
    const rec = sessionCache.load(key);
    const ss = (rec && rec.storageState) || { cookies: [], origins: [] };
    if (Array.isArray(ss.cookies) && ss.cookies.length) await context.addCookies(ss.cookies);
    // Seed localStorage (actToken/refreshToken) TRƯỚC mọi navigation: addInitScript chạy trước script trang
    // → token có sẵn khi app check auth → KHÔNG bị redirect /auth/login (bug phát hiện qua UAT smoke).
    for (const o of ss.origins || []) {
      if (Array.isArray(o.localStorage) && o.localStorage.length) {
        await context.addInitScript((items: Array<{ name: string; value: string }>) => {
          try { for (const it of items) window.localStorage.setItem(it.name, it.value); } catch (e) { /* origin khác scope */ }
        }, o.localStorage);
      }
    }
    const base = (ss.origins && ss.origins[0] && ss.origins[0].origin) || process.env.OPS_BASE_URL || '';
    if (base) await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => { /* verify ở caller */ });
    return 'storage(reuse)';
  }

  // 'api' seed token là app-specific (chưa hiện thực) → hiện fallback login UI; 'ui' = login form.
  await loginOps(page);
  try { sessionCache.save(key, await context.storageState()); } catch { /* cache best-effort */ }
  return method === 'ui' ? 'ui(login+cached)' : `${method}->ui(login+cached)`;
}
