import { test, expect, type Page } from '@playwright/test';
import { OPS_BASE, haveOpsCreds, loginOps, toNumber } from '../support/opsLogin';

/*
 * F6 — suite FE THẬT (promote từ SAPP-26523 / VNPay split payment).
 * Smoke module Order (Impact 5 — tiền): bất biến "Total Amount Due = Net Amount − Paid Amount + Payback"
 * trên form Create Order (OPS). Deterministic, KHÔNG phụ thuộc chọn product cụ thể.
 * AN TOÀN (non-destructive): chỉ mở form + đọc summary + Cancel; KHÔNG bấm Confirm.
 * Env: OPS_* (profiles/<TASK>/task.env qua TASK_ENV) + ORDER_TEST_DEAL_ID (mặc định deal test UAT).
 */

const DEAL = process.env.ORDER_TEST_DEAL_ID || '62115321374'; // deal test UAT (reuse SAPP-18500/26523)

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
  test.skip(!haveOpsCreds, 'Thiếu OPS creds → skip (chạy ở CI/local có TASK_ENV profile hoặc OPS_* secrets).');

  test('Total Amount Due = Net − Paid + Payback (bất biến, non-destructive)', async ({ page }) => {
    await loginOps(page);

    await page.goto(`${OPS_BASE}/operations/sales/orders`, { waitUntil: 'networkidle', timeout: 40000 });
    await page.getByRole('button', { name: /New Order/i }).first().click({ timeout: 6000 });
    await page.waitForTimeout(2000);

    const dealInput = page.locator('input[name=deal_id]');
    await expect(dealInput, 'Không thấy input deal_id — UX Create Order có thể đã đổi').toHaveCount(1);
    await dealInput.fill(DEAL);
    await page.getByRole('button', { name: /Đồng bộ thông tin|Sync/i }).first().click({ timeout: 5000 });
    await page.waitForTimeout(6000);

    const s = await readOrderSummary(page);
    const net = toNumber(s.net);
    const paid = toNumber(s.paid) ?? 0;
    const payback = toNumber(s.payback) ?? 0;
    const due = toNumber(s.due);

    expect(net, `Không đọc được Net Amount (summary: ${JSON.stringify(s)})`).not.toBeNull();
    expect(due, `Không đọc được Total Amount Due (summary: ${JSON.stringify(s)})`).not.toBeNull();
    expect(due).toBe((net as number) - paid + payback);

    await page.getByRole('button', { name: /Cancel|Hủy|Huỷ/i }).first().click({ timeout: 4000 }).catch(() => {});
  });
});
