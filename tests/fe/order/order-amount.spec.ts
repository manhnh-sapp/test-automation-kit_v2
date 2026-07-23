import { test, expect, type Page } from '@playwright/test';

/*
 * F6 — suite FE THẬT (promote từ SAPP-26523 / VNPay split payment).
 * Smoke module Order (Impact 5 — tiền): bất biến "Total Amount Due = Net Amount − Paid Amount + Payback"
 * trên form Create Order (OPS). Deterministic, KHÔNG phụ thuộc chọn product cụ thể.
 *
 * AN TOÀN (non-destructive): chỉ mở form + đọc summary + KHÔNG bấm Confirm (không tạo Order, không đẩy HubSpot).
 * Guard: thiếu OPS creds → skip có lý do (không fail oan). Login form 1 lần (né throttle — xem memory auth).
 * Selector bám đúng automation task gốc; muốn XANH thật phải chạy CI/local có OPS creds + deal test UAT.
 *
 * Env: OPS_BASE_URL, OPS_USERNAME, OPS_PASSWORD, (ORDER_TEST_DEAL_ID mặc định deal test UAT).
 * Tag: @order @smoke — dùng cho test-selection (F9) + smoke gate.
 */

const BASE = (process.env.OPS_BASE_URL || '').replace(/\/$/, '');
const USER = process.env.OPS_USERNAME || '';
const PASS = process.env.OPS_PASSWORD || '';
const DEAL = process.env.ORDER_TEST_DEAL_ID || '62115321374'; // deal test UAT (reuse SAPP-18500/26523)

const haveCreds = Boolean(BASE && USER && PASS);

// "9.500.000" / "9,500,000" / "9500000" → 9500000
function toNumber(raw: string | null): number | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, '');
  return digits ? Number(digits) : null;
}

async function loginOps(page: Page): Promise<void> {
  await page.goto(`${BASE}/auth/login`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.fill('input[name=username]', USER);
  await page.fill('input[name=password]', PASS);
  await page.getByRole('button', { name: /sign in|đăng nhập/i }).first().click({ timeout: 6000 })
    .catch(() => page.keyboard.press('Enter'));
  await page.waitForTimeout(4500);
  expect(/\/auth\/login/.test(page.url()), 'OPS login thất bại (còn ở /auth/login)').toBeFalsy();
}

async function readOrderSummary(page: Page) {
  return page.evaluate(() => {
    const t = document.body.innerText;
    const grab = (lb: string) => {
      const m = new RegExp(lb + ':?\\s*([\\d.,]+)', 'i').exec(t);
      return m ? m[1] : null;
    };
    return { net: grab('Net Amount'), paid: grab('Paid Amount'), payback: grab('Payback'), due: grab('Total Amount Due') };
  });
}

test.describe('@order @smoke Order — Total Amount Due (SAPP-26523)', () => {
  test.skip(!haveCreds, 'Thiếu OPS_BASE_URL/OPS_USERNAME/OPS_PASSWORD → skip (không fail oan). Chạy ở CI/local có creds.');

  test('Total Amount Due = Net − Paid + Payback (bất biến, non-destructive)', async ({ page }) => {
    await loginOps(page);

    await page.goto(`${BASE}/operations/sales/orders`, { waitUntil: 'networkidle', timeout: 40000 });
    await page.getByRole('button', { name: /New Order/i }).first().click({ timeout: 6000 });
    await page.waitForTimeout(2000);

    const dealInput = page.locator('input[name=deal_id]');
    await expect(dealInput, 'Không thấy input deal_id — UX Create Order có thể đã đổi').toHaveCount(1);
    await dealInput.fill(DEAL);
    await page.getByRole('button', { name: /Đồng bộ thông tin|Sync/i }).first().click({ timeout: 5000 });
    await page.waitForTimeout(6000);

    const s = await readOrderSummary(page);
    const net = toNumber(s.net);
    const paid = toNumber(s.paid);
    const payback = toNumber(s.payback) ?? 0;
    const due = toNumber(s.due);

    expect(net, `Không đọc được Net Amount (summary: ${JSON.stringify(s)})`).not.toBeNull();
    expect(due, `Không đọc được Total Amount Due (summary: ${JSON.stringify(s)})`).not.toBeNull();

    // Bất biến nghiệp vụ (FSD): Total Amount Due = Net − Paid + Payback.
    expect(due).toBe((net as number) - (paid ?? 0) + payback);

    // Non-destructive: rời form không Confirm.
    await page.getByRole('button', { name: /Cancel|Hủy|Huỷ/i }).first().click({ timeout: 4000 }).catch(() => {});
  });
});
