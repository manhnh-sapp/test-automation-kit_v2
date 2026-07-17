import { test as base, expect, type Page } from '@playwright/test';

type AuthFixtures = {
  authenticatedPage: Page;
};

function requiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

/**
 * Fixture mẫu cho authentication.
 * Team customize env key, route login và locator theo project thật.
 * Không hardcode username/password trong code; luôn đọc từ env hoặc secret store.
 */
export const test = base.extend<AuthFixtures>({
  authenticatedPage: async ({ page }, use) => {
    const baseUrl = requiredEnv('APP_BASE_URL');
    const username = requiredEnv('APP_USERNAME');
    const password = requiredEnv('APP_PASSWORD');
    const loginPath = process.env.APP_LOGIN_PATH || '/login';

    await page.goto(new URL(loginPath, baseUrl).toString());

    /**
     * Các locator bên dưới là ví dụ generic.
     * Nếu app dùng label/placeholder/text khác, hãy đổi sang locator semantic ổn định hơn.
     */
    await page.getByLabel(/email|username|tài khoản|user/i).fill(username);
    await page.getByLabel(/password|mật khẩu/i).fill(password);
    await page.getByRole('button', { name: /sign in|login|đăng nhập/i }).click();
    await page.waitForLoadState('networkidle').catch(() => undefined);

    await use(page);
  },
});

/**
 * Cách dùng trong spec:
 * import { test, expect } from '../fixtures/auth.fixture';
 *
 * test('user can open dashboard', async ({ authenticatedPage }) => {
 *   // Dùng authenticatedPage như Playwright page đã login.
 * });
 */
export { expect };
