'use strict';

/*
 * ensure_expanded.js — mở panel/accordion ỔN ĐỊNH trên DOM "nhiều icon giống nhau".
 *
 * VÌ SAO CẦN: cách thường làm là "đoán đúng cái chevron" rồi click —
 *   (a) walk-up rồi lấy `icons[icons.length-1]` + `mouse.click(x,y)`  → toạ độ lệch khi scroll/animation,
 *       và icon cuối cùng có thể thuộc CARD BÊN CẠNH (Add-on Course / Promotion Code) → click nhầm;
 *   (b) `row.querySelector('button')` (button ĐẦU TIÊN trong hàng) → hàng có nhiều button, trúng bừa.
 * Cả hai đều KHÔNG kiểm chứng panel có mở thật không → click nhầm âm thầm, bước sau mới chết.
 *
 * CÁCH Ở ĐÂY — đảo ngược vấn đề: KHÔNG cố nhận diện chevron, mà **thử ứng viên rồi nghiệm thu bằng KẾT QUẢ**:
 *   1. Idempotent: sentinel đã hiện → coi như mở rồi, không click gì (chạy lại an toàn).
 *   2. Khoanh vùng cứng: chỉ xét clickable BÊN TRONG header của ĐÚNG panel — ancestor được chọn là
 *      ancestor lớn nhất mà KHÔNG "nuốt" panel hàng xóm (truyền `siblingTitles`). Đây là thứ chặn
 *      trúng nhầm Add-on Course/Promotion Code ngay từ đầu.
 *   3. Thử ứng viên theo thứ tự an toàn: chính header → button/[role=button] → icon (svg/.anticon) mép phải.
 *   4. Sau mỗi click: chờ NGẮN sentinel. Nếu panel không mở mà lại BẬT modal/dropdown (tức trúng nhầm)
 *      → tự Escape đóng lại, loại ứng viên đó, thử tiếp. Tự phục hồi thay vì hỏng cả script.
 *   5. Click qua element handle (đánh dấu data-attr), KHÔNG dùng toạ độ chuột.
 *
 * Dùng (CJS — chạy được cả trong spec Playwright lẫn script node task-scoped):
 *   const { ensureExpanded } = require('<repo>/scripts/utils/ui/ensure_expanded');
 *   await ensureExpanded(page, {
 *     title: 'Product',
 *     sentinelText: 'Add Product',                                  // chỉ xuất hiện khi panel MỞ
 *     siblingTitles: ['Add-on Course', 'Combo Product', 'Promotion Code', 'Payment Info'],
 *   });
 */

const MARK = 'data-xp-toggle';

/** Tắt animation/transition — chống stale coordinate + rút ngắn chờ. An toàn, chỉ ảnh hưởng phiên test. */
async function killAnimations(page) {
  await page.addStyleTag({
    content: '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important}',
  }).catch(() => {});
}

/** Đếm overlay đang mở (modal/dropdown) — dùng để phát hiện "click trúng nhầm". */
function overlayCount(page) {
  return page.evaluate(() => {
    // CẢNH BÁO: KHÔNG dùng `offsetParent !== null` để kiểm hiển thị ở đây — modal/dropdown (antd, bootstrap)
    // là `position: fixed` nên offsetParent LUÔN null → overlay mở mà bị coi là ẩn → không phát hiện được
    // "click trúng nhầm" → mất khả năng tự Escape. (Đã dính bug này lúc test, giữ nguyên chú thích.)
    const vis = (e) => {
      if (!e) return false;
      const r = e.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return false;
      const cs = getComputedStyle(e);
      return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
    };
    const sel = '.ant-modal-wrap:not([style*="display: none"]), .ant-modal, [role=dialog], .modal.show, .ant-drawer-open, .ant-select-dropdown:not(.ant-select-dropdown-hidden), .ant-picker-dropdown:not(.ant-picker-dropdown-hidden)';
    return [...document.querySelectorAll(sel)].filter(vis).length;
  }).catch(() => 0);
}

/**
 * Đánh dấu ứng viên toggle thứ `index` của panel `title` bằng data-attr, trả về tổng số ứng viên.
 * Chạy hoàn toàn trong page context để không phải chuyển handle qua lại.
 */
function markCandidate(page, title, siblingTitles, index) {
  return page.evaluate(([t, sibs, idx, mark]) => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const ownText = (e) => norm([...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(''));
    const visible = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };

    document.querySelectorAll(`[${mark}]`).forEach((e) => e.removeAttribute(mark));

    // 1) Header = element có OWN TEXT đúng bằng title (tránh cha chứa cả trang).
    const headers = [...document.querySelectorAll('*')].filter((e) => ownText(e) === t && visible(e));
    if (!headers.length) return { total: 0, reason: `không thấy header có text đúng "${t}"` };
    const header = headers[0];

    // 2) Khoanh vùng: leo lên tối đa 5 cấp, DỪNG trước ancestor đã "nuốt" panel hàng xóm.
    let scope = header;
    for (let k = 0; k < 5; k += 1) {
      const parent = scope.parentElement;
      if (!parent) break;
      const txt = norm(parent.innerText || '');
      const swallowsSibling = (sibs || []).some((s) => txt.includes(s));
      if (swallowsSibling) break;          // vượt quá phạm vi panel → dừng ở scope hiện tại
      scope = parent;
    }

    // 3) Ứng viên theo thứ tự an toàn (header trước, icon sau).
    const cands = [];
    const push = (el) => { if (el && visible(el) && !cands.includes(el)) cands.push(el); };
    push(header);                                                     // nhiều accordion toggle khi click header
    scope.querySelectorAll('button,[role=button],a[href="#"],[class*=toggle],[class*=collapse]').forEach(push);
    [...scope.querySelectorAll('svg,i,.anticon,[class*=icon],[class*=arrow],[class*=chevron],[class*=caret]')].reverse().forEach(push); // chevron thường ở mép phải → duyệt ngược
    push(scope);

    if (idx >= cands.length) return { total: cands.length, reason: 'hết ứng viên' };
    const el = cands[idx];
    el.setAttribute(mark, '1');
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    return {
      total: cands.length,
      picked: { tag: el.tagName.toLowerCase(), cls: String(el.className || '').slice(0, 60), text: norm(el.textContent).slice(0, 30), x: Math.round(r.x), y: Math.round(r.y) },
      scopeText: norm(scope.innerText || '').slice(0, 80),
    };
  }, [title, siblingTitles || [], index, MARK]).catch((e) => ({ total: 0, reason: e.message }));
}

/** Sentinel đang hiện? (scope trong panel nếu tìm được, để không ăn nhầm 'Add Product' của card khác) */
function sentinelVisible(page, title, siblingTitles, sentinelText) {
  return page.evaluate(([t, sibs, sent]) => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const ownText = (e) => norm([...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(''));
    const visible = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const header = [...document.querySelectorAll('*')].find((e) => ownText(e) === t && visible(e));
    let scope = header || document.body;
    if (header) {
      for (let k = 0; k < 5; k += 1) {
        const parent = scope.parentElement; if (!parent) break;
        const txt = norm(parent.innerText || '');
        if ((sibs || []).some((s) => txt.includes(s))) break;
        scope = parent;
      }
    }
    return [...scope.querySelectorAll('*')].some((e) => ownText(e) === sent && visible(e));
  }, [title, siblingTitles || [], sentinelText]).catch(() => false);
}

/**
 * Mở panel cho tới khi sentinel xuất hiện.
 * @returns {Promise<{ok:boolean, how:string, tried:number, picked?:object}>}
 */
async function ensureExpanded(page, opts) {
  const { title, sentinelText, siblingTitles = [], settleMs = 900, log = true } = opts || {};
  if (!title || !sentinelText) throw new Error('ensureExpanded: cần { title, sentinelText }');
  await killAnimations(page);

  if (await sentinelVisible(page, title, siblingTitles, sentinelText)) {
    if (log) console.log(`[expand] "${title}": đã mở sẵn (idempotent, không click).`);
    return { ok: true, how: 'already-open', tried: 0 };
  }

  const before = await overlayCount(page);
  let total = Infinity;
  for (let i = 0; i < 12 && i < total; i += 1) {
    const m = await markCandidate(page, title, siblingTitles, i);
    total = m.total || 0;
    if (!total) { if (log) console.log(`[expand] "${title}": ${m.reason || 'không có ứng viên'}`); break; }
    if (!m.picked) break;

    await page.locator(`[${MARK}="1"]`).first().click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(settleMs);

    if (await sentinelVisible(page, title, siblingTitles, sentinelText)) {
      await page.evaluate((mk) => document.querySelectorAll(`[${mk}]`).forEach((e) => e.removeAttribute(mk)), MARK).catch(() => {});
      if (log) console.log(`[expand] "${title}": MỞ được ở ứng viên #${i} (${m.picked.tag}.${String(m.picked.cls).slice(0, 24)}) — tổng ${total} ứng viên.`);
      return { ok: true, how: `candidate#${i}`, tried: i + 1, picked: m.picked };
    }

    // Click TRÚNG NHẦM (modal/dropdown bật lên) → tự đóng rồi thử ứng viên kế.
    if ((await overlayCount(page)) > before) {
      if (log) console.log(`[expand] "${title}": ứng viên #${i} mở nhầm overlay → Escape, thử tiếp.`);
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(250);
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(350);
    }
  }

  await page.evaluate((mk) => document.querySelectorAll(`[${mk}]`).forEach((e) => e.removeAttribute(mk)), MARK).catch(() => {});
  if (log) console.log(`[expand] "${title}": THẤT BẠI sau ${Number.isFinite(total) ? total : 0} ứng viên — sentinel "${sentinelText}" không xuất hiện.`);
  return { ok: false, how: 'exhausted', tried: Number.isFinite(total) ? total : 0 };
}

module.exports = { ensureExpanded, killAnimations, sentinelVisible };
