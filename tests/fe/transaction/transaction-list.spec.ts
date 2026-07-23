import { test, expect } from '@playwright/test';
import { OPS_BASE, haveOpsCreds, loginOps } from '../support/opsLogin';

/*
 * F6 — suite FE THẬT (promote từ SAPP-26276 / Transaction Management, Impact 5 — tiền).
 * Smoke READ-ONLY: màn Transaction list load được, grid (Ant table) render đủ cột + có dòng
 * (hoặc empty-state hợp lệ), và KHÔNG có response 5xx (backend health). Non-destructive tuyệt đối
 * (chỉ xem list, không tạo/sửa/xoá). Bổ trợ ui_conformance (không thay — cái kia lo exact column/format).
 */

test.describe('@transaction @smoke Transaction list (SAPP-26276)', () => {
  test.skip(!haveOpsCreds, 'Thiếu OPS creds → skip (chạy ở CI/local có TASK_ENV profile hoặc OPS_* secrets).');

  test('Transaction list load được, grid render, không 5xx (read-only)', async ({ page }) => {
    const serverErrors: string[] = [];
    page.on('response', (r) => { if (r.status() >= 500) serverErrors.push(`${r.status()} ${r.url()}`); });

    await loginOps(page);
    await page.goto(`${OPS_BASE}/operations/sales/transactions`, { waitUntil: 'networkidle', timeout: 40000 });
    await page.waitForTimeout(2500);

    const table = page.locator('.ant-table').first();
    await expect(table, 'Grid Transaction (.ant-table) không render — màn list có thể lỗi/đổi').toBeVisible();

    const headerCount = await page.locator('.ant-table-thead th').count();
    expect(headerCount, `Grid chỉ ${headerCount} cột header (kỳ vọng ≥8) — có thể chưa load xong`).toBeGreaterThanOrEqual(8);

    // Grid functional: có ≥1 dòng, hoặc empty-state rõ ràng (không kẹt loading).
    const rowCount = await page.locator('.ant-table-tbody .ant-table-row').count();
    const emptyState = await page.locator('.ant-empty, .ant-table-placeholder').count();
    expect(rowCount + emptyState, 'Grid không có dòng lẫn empty-state (kẹt loading?)').toBeGreaterThan(0);

    expect(serverErrors, `Có response 5xx khi load Transaction list: ${serverErrors.join(' | ')}`).toEqual([]);
  });
});
