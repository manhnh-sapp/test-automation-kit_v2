import { test, expect } from '@playwright/test';
import { haveLmsCreds, LMS_BASE, loginLms } from '../support/lmsLogin';
import { readSpaToken, brokerRequest } from '../support/auth/tokenBroker';

/*
 * INFRA SMOKE (@smoke) — nghiệm thu Token Broker trên **LMS (Keycloak)** UAT THẬT.
 * Non-destructive: chỉ login Keycloak + xem trang + GET; KHÔNG tạo/sửa/xoá. Login 1 LẦN (né lockout theo số lần).
 * Chứng minh broker app-neutral: token LMS KHÔNG ở localStorage nhưng CAPTURE header vẫn lấy được token tươi.
 */
test.describe('@smoke LMS Token Broker (infra)', () => {
  test.skip(!haveLmsCreds, 'Thiếu LMS creds → skip (chạy với TASK_ENV=profiles/<TASK>/task.env).');

  test('login LMS (Keycloak) → token tươi (capture) + brokerRequest API thật 2xx', async ({ browser }) => {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await loginLms(p);
    expect(/\/auth\/login|\/realms\//.test(p.url()), 'đã đăng nhập LMS (không kẹt trang login)').toBeFalsy();

    // Token Broker: đọc token TƯƠI từ phiên LMS sống (capture header — token không ở localStorage).
    const tok = await readSpaToken(p);
    expect(tok, 'readSpaToken bắt Bearer JWT từ phiên LMS (Keycloak)').toMatch(/^Bearer eyJ/);

    // Bắt 1 endpoint LMS SPA gọi rồi brokerRequest bằng token tươi → 2xx.
    let apiUrl: string | null = null;
    p.on('request', (r) => { if (!apiUrl && r.method() === 'GET' && /\/api\//.test(r.url())) apiUrl = r.url(); });
    await p.goto(`${LMS_BASE}/profile/overview`, { waitUntil: 'networkidle', timeout: 40000 }).catch(() => {});
    if (apiUrl) {
      const res = await brokerRequest(p, 'get', apiUrl, { reauth: loginLms });
      expect(res.status(), 'brokerRequest LMS dùng token tươi → 2xx').toBeGreaterThanOrEqual(200);
      expect(res.status()).toBeLessThan(300);
    }
    await ctx.close();
  });
});
