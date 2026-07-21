import { test, expect } from '@playwright/test';

/**
 * Template spec mobile-web — chạy dưới project `iphone-13` / `pixel-7` (playwright.config.js),
 * nên `page` đã có sẵn hasTouch/isMobile/userAgent thật (không chỉ viewport hẹp như desktop).
 *
 * `test.skip` để không fail khi chưa có URL/env thật. Bỏ skip + điền target khi viết case thật.
 * Chỉ đặt spec ở đây khi hành vi mobile KHÁC desktop (hamburger, bottom sheet, swipe, touch).
 */
test.describe('Mobile-web behavior (template)', () => {
  test.skip('touch target đủ lớn + tap mở hamburger', async ({ page, isMobile }) => {
    expect(isMobile).toBeTruthy(); // xác nhận đang chạy device emulation
    await page.goto(process.env.LMS_BASE_URL || 'about:blank');

    // Touch target >= 44px (Apple HIG; Google Material 48dp) — bắc cầu accessibility_check.js
    const menuBtn = page.getByRole('button', { name: /menu/i });
    const box = await menuBtn.boundingBox();
    expect(box && Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);

    await menuBtn.tap(); // tap (touch), không phải click
    await expect(page.getByRole('navigation')).toBeVisible();
  });

  test.skip('offline giữa chừng → báo lỗi, không crash', async ({ page, context }) => {
    await page.goto(process.env.LMS_BASE_URL || 'about:blank');
    await context.setOffline(true); // slow-3G/throttling: dùng CDP Network.emulateNetworkConditions (chromium)
    // ... thao tác cần mạng → kỳ vọng thông báo lỗi, không tạo bản ghi mồ côi (bắc cầu mục 8 Resilience)
    await context.setOffline(false);
  });
});
