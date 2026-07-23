import { test, expect } from '@playwright/test';
import { OPS_BASE, haveOpsCreds, loginOps } from '../fe/support/opsLogin';

/*
 * F6 — spec API-first (BE) — Product-Orders (SAPP-26523, Impact 5 — tiền).
 * OPS auth là SPA (không có API-login username/password sạch) → hybrid: UI login → BẮT url+token
 * THẬT mà SPA gọi tới /api/v1/product-orders → re-issue qua request → assert 2xx + JSON có list.
 * Robust (dùng đúng url/params/token của app đang chạy), non-destructive (GET-only).
 * Env: OPS_* (login) + OPS_API_BASE_URL. Tag @api @smoke.
 */

const API_BASE = (process.env.OPS_API_BASE_URL || '').replace(/\/$/, '');

test.describe('@api @smoke Product-Orders API (SAPP-26523)', () => {
  test.skip(!haveOpsCreds || !API_BASE, 'Thiếu OPS creds / OPS_API_BASE_URL → skip.');

  test('GET /product-orders trả 2xx + JSON list (BE health, non-destructive)', async ({ page }) => {
    let captured: { url: string; auth: string } | null = null;
    page.on('request', (r) => {
      const u = r.url();
      if (!captured && r.method() === 'GET' && u.startsWith(API_BASE) && /\/product-orders/i.test(u)) {
        const a = r.headers()['authorization'];
        if (a) captured = { url: u, auth: a };
      }
    });

    await loginOps(page);
    await page.goto(`${OPS_BASE}/operations/sales/transactions`, { waitUntil: 'networkidle', timeout: 40000 });
    await page.waitForTimeout(3000);

    expect(captured, 'SPA không gọi GET /api/v1/product-orders (không bắt được endpoint/token thật)').not.toBeNull();
    const call = captured as unknown as { url: string; auth: string };

    const res = await page.request.get(call.url, { headers: { Authorization: call.auth, Accept: 'application/json' } });
    expect(res.status(), `product-orders API trả ${res.status()} (kỳ vọng 2xx)`).toBeGreaterThanOrEqual(200);
    expect(res.status()).toBeLessThan(300);

    const body = await res.json();
    const hasList = Array.isArray(body)
      || ['data', 'items', 'results', 'list', 'content'].some((k) => body && typeof body === 'object' && k in body);
    expect(hasList, `Body không có mảng/field list (keys: ${body && typeof body === 'object' ? Object.keys(body).join(',') : typeof body})`).toBeTruthy();
  });
});
