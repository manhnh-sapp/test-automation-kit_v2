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
    for (const o of ss.origins || []) {
      try {
        await page.goto(o.origin, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.evaluate((items: Array<{ name: string; value: string }>) => {
          for (const it of items) window.localStorage.setItem(it.name, it.value);
        }, o.localStorage || []);
      } catch {
        /* origin không mở được → bỏ; caller nên verify đã login, nếu chưa thì gọi lại với prefer:'ui' */
      }
    }
    return 'storage(reuse)';
  }

  // 'api' seed token là app-specific (chưa hiện thực) → hiện fallback login UI; 'ui' = login form.
  await loginOps(page);
  try { sessionCache.save(key, await context.storageState()); } catch { /* cache best-effort */ }
  return method === 'ui' ? 'ui(login+cached)' : `${method}->ui(login+cached)`;
}
