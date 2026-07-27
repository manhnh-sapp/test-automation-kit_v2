import { expect, type Page } from '@playwright/test';

/*
 * Helper login LMS (SAPP) dùng chung cho suite FE thật. LMS dùng **Keycloak** (auth-code + PKCE):
 * goto app → redirect trang login Keycloak (`uat-accounts.sapp.edu.vn/realms/lms-uat/.../auth`) → điền form.
 * KHÔNG seed localStorage được (Keycloak validate qua SSO cookie/code — khác OPS). Creds từ env LMS_*
 * (profiles/<TASK>/task.env qua TASK_ENV; .env chung để rỗng). KHÔNG hardcode credential.
 * Login ĐÚNG 1 LẦN/worker — LMS khoá theo SỐ LẦN login; lặp nhiều → lockout dai dẳng.
 */

export const LMS_BASE = (process.env.LMS_BASE_URL || '').replace(/\/$/, '');
export const LMS_LOGIN_URL = process.env.LMS_LOGIN_URL || (LMS_BASE ? `${LMS_BASE}/auth/login` : '');
export const LMS_USER = process.env.LMS_USERNAME || '';
export const LMS_PASS = process.env.LMS_PASSWORD || '';
// Coi placeholder chưa điền (`<LMS_USERNAME>`) là CHƯA có creds → skip, tránh submit rác gây lockout oan.
const isReal = (v: string): boolean => Boolean(v) && !/^<.*>$/.test(v.trim());
export const haveLmsCreds = Boolean(LMS_BASE && isReal(LMS_USER) && isReal(LMS_PASS));

// Còn Ở KEYCLOAK (chưa login xong): host accounts | path /realms/. Sau login THÀNH CÔNG, Keycloak redirect
// (response_mode=fragment) về `uat-lms.sapp.edu.vn/auth/login#code=…` — URL này Ở LMS, KHÔNG tính là fail.
const KC_HOST_RE = /accounts\.sapp\.edu\.vn|\/realms\//i;

/** Login LMS qua Keycloak (1 lần/worker). Fail rõ nếu còn kẹt ở trang login.
 * LƯU Ý: cần launch với `--disable-blink-features=AutomationControlled` (đã set ở playwright.config.js) —
 * không có thì LMS SPA phát hiện automation → loop trang login trắng, form KHÔNG render. */
export async function loginLms(page: Page): Promise<void> {
  await page.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => undefined }));
  await page.goto(LMS_LOGIN_URL || LMS_BASE, { waitUntil: 'domcontentloaded', timeout: 45000 });
  // chờ redirect sang Keycloak (uat-accounts…/realms/lms-uat) + form hiện.
  await page.waitForSelector('input[name=username]', { timeout: 45000 });
  await page.fill('input[name=username]', LMS_USER);
  await page.fill('input[name=password]', LMS_PASS);
  await page.getByRole('button', { name: /login|đăng nhập|sign in/i }).first().click({ timeout: 6000 })
    .catch(() => page.locator('button[type=submit], #kc-login').first().click({ timeout: 6000 }))
    .catch(() => page.keyboard.press('Enter'));
  // Thành công = rời khỏi Keycloak (quay về LMS để đổi code lấy token). Sai creds → Keycloak giữ nguyên → fail rõ.
  await page.waitForURL((u) => !KC_HOST_RE.test(u.toString()), { timeout: 30000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);
  expect(KC_HOST_RE.test(page.url()), `LMS login thất bại (còn kẹt ở Keycloak: ${page.url()})`).toBeFalsy();
}
