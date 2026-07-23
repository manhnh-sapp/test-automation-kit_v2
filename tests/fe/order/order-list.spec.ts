import { test, expect } from '@playwright/test';
import { OPS_BASE, haveOpsCreds, loginOps } from '../support/opsLogin';

/*
 * F6 — suite FE THẬT (module Order, Impact 5 — tiền; context SAPP-26523).
 * Smoke READ-ONLY màn Orders list: màn load đúng (nút "New Order" hiện), grid (Ant table) render
 * đủ cột + có dòng (hoặc empty-state hợp lệ), và KHÔNG có response 5xx (BE health).
 * Non-destructive tuyệt đối (chỉ xem list, KHÔNG bấm New Order/tạo/sửa/xoá). Bổ trợ order-amount
 * (cái kia lo form Create Order + bất biến tiền; cái này lo sức khoẻ màn list).
 */

test.describe('@order @smoke Orders list (SAPP-26523)', () => {
  test.skip(!haveOpsCreds, 'Thiếu OPS creds → skip (chạy ở CI/local có TASK_ENV profile hoặc OPS_* secrets).');

  test('Orders list load được, grid render, không 5xx (read-only)', async ({ page }) => {
    const serverErrors: string[] = [];
    page.on('response', (r) => { if (r.status() >= 500) serverErrors.push(`${r.status()} ${r.url()}`); });

    await loginOps(page);
    await page.goto(`${OPS_BASE}/operations/sales/orders`, { waitUntil: 'networkidle', timeout: 40000 });
    await page.waitForTimeout(2500);

    // Màn list đúng: nút "New Order" tồn tại (đã biết từ order-amount) — không bấm.
    await expect(
      page.getByRole('button', { name: /New Order/i }).first(),
      'Không thấy nút "New Order" — có thể sai route hoặc màn Orders list đã đổi',
    ).toBeVisible();

    const table = page.locator('.ant-table').first();
    await expect(table, 'Grid Orders (.ant-table) không render — màn list có thể lỗi/đổi').toBeVisible();

    const headerCount = await page.locator('.ant-table-thead th').count();
    expect(headerCount, `Grid chỉ ${headerCount} cột header (kỳ vọng ≥5) — có thể chưa load xong`).toBeGreaterThanOrEqual(5);

    // Grid functional: có ≥1 dòng, hoặc empty-state rõ ràng (không kẹt loading).
    const rowCount = await page.locator('.ant-table-tbody .ant-table-row').count();
    const emptyState = await page.locator('.ant-empty, .ant-table-placeholder').count();
    expect(rowCount + emptyState, 'Grid không có dòng lẫn empty-state (kẹt loading?)').toBeGreaterThan(0);

    expect(serverErrors, `Có response 5xx khi load Orders list: ${serverErrors.join(' | ')}`).toEqual([]);
  });
});
