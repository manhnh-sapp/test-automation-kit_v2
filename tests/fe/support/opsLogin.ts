import { expect, type Page } from '@playwright/test';

/*
 * Helper login OPS dùng chung cho suite FE thật (F6). Đọc creds từ env (OPS_* — thường ở
 * profiles/<TASK>/task.env, nạp qua TASK_ENV; .env chung để rỗng). KHÔNG hardcode credential.
 */

export const OPS_BASE = (process.env.OPS_BASE_URL || '').replace(/\/$/, '');
export const OPS_USER = process.env.OPS_USERNAME || '';
export const OPS_PASS = process.env.OPS_PASSWORD || '';
export const haveOpsCreds = Boolean(OPS_BASE && OPS_USER && OPS_PASS);

/** "9.500.000" / "9,500,000" / "9500000" → 9500000 (null nếu không có số). */
export function toNumber(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const digits = String(raw).replace(/[^\d]/g, '');
  return digits ? Number(digits) : null;
}

/** Login form OPS (1 lần/worker — né throttle: gọi trong beforeAll/1 test, không lặp). Fail rõ nếu còn ở /auth/login. */
export async function loginOps(page: Page): Promise<void> {
  await page.goto(`${OPS_BASE}/auth/login`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.fill('input[name=username]', OPS_USER);
  await page.fill('input[name=password]', OPS_PASS);
  await page.getByRole('button', { name: /sign in|đăng nhập/i }).first().click({ timeout: 6000 })
    .catch(() => page.keyboard.press('Enter'));
  await page.waitForTimeout(4500);
  expect(/\/auth\/login/.test(page.url()), 'OPS login thất bại (còn ở /auth/login)').toBeFalsy();
}
