import { test, expect } from '@playwright/test';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ensureExpanded } = require('../../../scripts/utils/ui/ensure_expanded');

/*
 * @infra — regression cho helper mở panel/accordion (KHÔNG cần UAT, chạy trên fixture local nên nhanh + tất định).
 * Fixture `expand-trap.html` tái hiện đúng cái bẫy gặp thật ở form Service Fee Order (SAPP-24395):
 *   - header "Product" có NHIỀU icon giống nhau; toggle THẬT nằm GIỮA (không phải icon cuối, không phải button)
 *   - icon CUỐI mở dropdown Add-on Course · button ĐẦU mở modal Promotion Code
 * → 2 chiến thuật cũ đều click nhầm (đã đo). Helper phải: né được, tự Escape, mở đúng, và idempotent.
 */
const FIXTURE = `file://${path.resolve(__dirname, '..', 'fixtures', 'expand-trap.html').replace(/\\/g, '/')}`;
const OPTS = { title: 'Product', sentinelText: 'Add Product', siblingTitles: ['Add-on Course', 'Promotion Code'], log: false };

const state = (p: import('@playwright/test').Page) => p.evaluate(() => ({
  productOpen: getComputedStyle(document.getElementById('prod-body') as Element).display === 'block',
  wrongDropdown: !(document.getElementById('dd') as Element).classList.contains('hidden'),
  wrongModal: !(document.getElementById('md') as Element).classList.contains('hidden'),
}));

test.describe('@infra ensureExpanded — panel nhiều icon giống nhau', () => {
  test('mở đúng panel, không để lại overlay trúng-nhầm, và idempotent', async ({ page }) => {
    await page.goto(FIXTURE);

    const r1 = await ensureExpanded(page, OPTS);
    expect(r1.ok, 'phải mở được panel Product').toBeTruthy();

    const s = await state(page);
    expect(s.productOpen, 'panel Product mở').toBeTruthy();
    expect(s.wrongDropdown, 'KHÔNG để sót dropdown Add-on Course mở nhầm').toBeFalsy();
    expect(s.wrongModal, 'KHÔNG để sót modal Promotion Code mở nhầm').toBeFalsy();

    // Gọi lần 2: không được click gì nữa (tránh toggle đóng lại panel đang mở).
    const r2 = await ensureExpanded(page, OPTS);
    expect(r2.how, 'lần 2 phải nhận ra đã mở sẵn').toBe('already-open');
    expect((await state(page)).productOpen, 'panel vẫn mở sau lần gọi thứ 2').toBeTruthy();
  });

  test('chiến thuật CŨ thật sự click nhầm (chứng minh bẫy đúng thực tế)', async ({ page }) => {
    await page.goto(FIXTURE);
    // Cách cũ: walk-up lấy icon CUỐI rồi click toạ độ (convert_products.js)
    const box = await page.evaluate(() => {
      const lab = [...document.querySelectorAll('*')].find((e) => e.children.length <= 1 && (e.textContent || '').trim() === 'Product');
      if (!lab) return null;
      let h = lab.parentElement;
      for (let k = 0; k < 6 && h; k += 1) {
        const ic = h.querySelectorAll('svg, .anticon');
        if (ic.length) { const r = ic[ic.length - 1].getBoundingClientRect(); if (r.width > 0) return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }
        h = h.parentElement;
      }
      return null;
    });
    if (box) await page.mouse.click(box.x, box.y);
    await page.waitForTimeout(300);
    const s = await state(page);
    expect(s.productOpen, 'cách cũ KHÔNG mở được panel').toBeFalsy();
    expect(s.wrongDropdown, 'cách cũ trúng nhầm dropdown hàng xóm').toBeTruthy();
  });
});
