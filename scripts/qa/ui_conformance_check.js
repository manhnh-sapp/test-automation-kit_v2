#!/usr/bin/env node
/**
 * UI Conformance Checker (shared, dùng chung mọi task) — "visual oracle" tự động.
 *
 * Mục tiêu: bắt các lỗi hiển thị mà text-step automation hay miss — sai tên cột,
 * thiếu/thừa/sai thứ tự cột, sai format dữ liệu, sai empty-state/label, lệch token design.
 * Nguyên tắc: expected LẤY TỪ CATALOG (trích từ FS/Figma), so khớp CHÍNH XÁC (equality/regex/
 * đếm+thứ tự), KHÔNG "contains/tồn tại". Không so giá trị từ build với chính build (tautological).
 *
 * Cách chạy:
 *   TASK_ENV=profiles/<TASK>/task.env \
 *   node scripts/qa/ui_conformance_check.js --catalog <path/ui_catalog.json> [--out <dir>]
 *
 * Catalog JSON schema (rút gọn) — xem scripts/qa/README.md:
 * {
 *   "login": { "site": "ops"|"lms", "loginPath": "/auth/login",
 *              "userEnv": "OPS_USERNAME", "passEnv": "OPS_PASSWORD", "baseUrlEnv": "OPS_BASE_URL" },
 *   "screens": [{
 *     "name": "Attendance Resync Log Detail",
 *     "url": "/list-request/attendance/resync-log?...",        // tương đối base, hoặc absolute
 *     "preSteps": [{ "action":"click|fill|waitFor|goto|wait", "selector":"..", "value":".." }],
 *     "table": {
 *       "headerSelector": "table thead th",
 *       "rowSelector": "table tbody tr:not(.ant-table-measure-row)",
 *       "expectedColumns": ["#","User Name",...,"Check-in","Check-out",...],   // exact + thứ tự
 *       "formats": { "Check-in": "^\\d{2}:\\d{2}$", "Lesson date": "^\\d{2}/\\d{2}/\\d{4} .." }
 *     },
 *     "texts":  [{ "name":"empty-state", "selector":".ant-empty-description", "expected":"No data" }],
 *     "tokens": [{ "name":"Cancel btn", "selector":"button:has-text(\"Cancel\")",
 *                  "expected": { "color":"#99A1B7", "border-radius":"6px" }, "tol": { "colorPerChannel":8, "px":2 } }]
 *   }]
 * }
 */
const fs = require('fs');
const path = require('path');
require(path.resolve(__dirname, '..', 'utils', 'runtime_config'));
const { chromium } = require('@playwright/test');

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const CATALOG = arg('catalog');
if (!CATALOG || !fs.existsSync(CATALOG)) { console.error(`ERROR: --catalog không tồn tại: ${CATALOG}`); process.exit(2); }
const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
const OUT = path.resolve(arg('out', path.join(path.dirname(CATALOG), '..', 'test-results', 'conformance')));
fs.mkdirSync(OUT, { recursive: true });

const norm = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const hexToRgb = h => { const m = String(h).replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i); return m ? [1, 2, 3].map(i => parseInt(m[i], 16)) : null; };
const cssToRgb = c => { const m = String(c).match(/rgba?\(([^)]+)\)/); if (m) return m[1].split(',').slice(0, 3).map(x => parseInt(x.trim(), 10)); return hexToRgb(c); };
const num = v => { const m = String(v).match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : NaN; };

async function login(page, cfg) {
  if (!cfg) return;
  const base = (process.env[cfg.baseUrlEnv || 'OPS_BASE_URL'] || '').replace(/\/+$/, '');
  const user = process.env[cfg.userEnv || 'OPS_USERNAME'];
  const pass = process.env[cfg.passEnv || 'OPS_PASSWORD'];
  await page.goto(base + (cfg.loginPath || '/auth/login'), { waitUntil: 'networkidle', timeout: 45000 });
  await page.fill(cfg.userSelector || 'input[name=username]', user);
  await page.fill(cfg.passSelector || 'input[name=password]', pass);
  await page.click(cfg.submitSelector || 'button:has-text("Sign In")');
  await page.waitForTimeout(cfg.waitAfter || 4500);
}

async function runPreSteps(page, base, steps) {
  for (const s of steps || []) {
    if (s.action === 'goto') await page.goto((/^https?:/.test(s.value) ? s.value : base + s.value), { waitUntil: 'domcontentloaded', timeout: 40000 }).catch(() => {});
    else if (s.action === 'click') await page.locator(s.selector).first().click({ timeout: 8000 }).catch(() => {});
    else if (s.action === 'fill') await page.locator(s.selector).first().fill(s.value).catch(() => {});
    else if (s.action === 'selectOption') await page.locator(s.selector).first().selectOption(s.value).catch(() => {});
    else if (s.action === 'waitFor') await page.locator(s.selector).first().waitFor({ timeout: 8000 }).catch(() => {});
    else if (s.action === 'wait') await page.waitForTimeout(Number(s.value) || 1000);
    await page.waitForTimeout(400);
  }
}

async function checkScreen(page, base, screen) {
  const dev = []; // deviations
  const scope = screen.scopeSelector ? page.locator(screen.scopeSelector).last() : page;
  // 1) TABLE: cột exact + thứ tự + số lượng
  if (screen.table) {
    const t = screen.table;
    const heads = (await (screen.scopeSelector ? scope.locator(t.headerSelector || 'thead th') : page.locator(t.headerSelector || 'table thead th')).allInnerTexts().catch(() => [])).map(norm).filter(x => x !== '');
    const exp = (t.expectedColumns || []).map(norm);
    if (exp.length) {
      if (heads.length !== exp.length) dev.push({ type: 'columns.count', expected: exp.length, actual: heads.length, detail: `build: [${heads.join(' | ')}]` });
      const maxi = Math.max(exp.length, heads.length);
      for (let i = 0; i < maxi; i++) {
        if (norm(exp[i]) !== norm(heads[i])) dev.push({ type: 'columns.title/order', pos: i + 1, expected: exp[i] || '(thiếu)', actual: heads[i] || '(thiếu)' });
      }
    }
    // 2) FORMAT theo cột
    if (t.formats) {
      const rowSel = t.rowSelector || 'table tbody tr:not(.ant-table-measure-row)';
      for (const [col, re] of Object.entries(t.formats)) {
        const idx = heads.findIndex(h => norm(h) === norm(col));
        if (idx < 0) { dev.push({ type: 'format.col-missing', column: col }); continue; }
        const cells = await (screen.scopeSelector ? scope : page).locator(`${rowSel} td:nth-child(${idx + 1})`).allInnerTexts().catch(() => []);
        const vals = cells.map(norm).filter(x => x && x !== '-');
        const rx = new RegExp(re);
        const bad = vals.find(v => !rx.test(v));
        if (vals.length && bad !== undefined) dev.push({ type: 'format.mismatch', column: col, expectedFormat: re, sampleBad: bad });
        else if (!vals.length) dev.push({ type: 'format.no-sample', column: col, note: 'không có dòng dữ liệu để kiểm format' });
      }
    }
  }
  // 3) TEXTS: empty-state/label/placeholder exact
  for (const tx of screen.texts || []) {
    const el = (screen.scopeSelector ? scope : page).locator(tx.selector).first();
    const actual = (await el.count()) ? norm(await el.innerText().catch(() => '')) : '(không thấy element)';
    if (norm(tx.expected) !== actual) dev.push({ type: 'text.mismatch', name: tx.name, expected: tx.expected, actual });
  }
  // 4) TOKENS: computed-style so token (color/radius/size...) với dung sai
  for (const tk of screen.tokens || []) {
    const el = (screen.scopeSelector ? scope : page).locator(tk.selector).first();
    if (!(await el.count())) { dev.push({ type: 'token.no-element', name: tk.name, selector: tk.selector }); continue; }
    const props = Object.keys(tk.expected || {});
    const got = await el.evaluate((node, ps) => { const s = getComputedStyle(node); const o = {}; ps.forEach(p => o[p] = s.getPropertyValue(p)); return o; }, props).catch(() => ({}));
    for (const p of props) {
      const expV = tk.expected[p], gotV = got[p];
      if (/color/.test(p)) {
        const e = hexToRgb(expV) || cssToRgb(expV), g = cssToRgb(gotV);
        const tol = (tk.tol && tk.tol.colorPerChannel) || 8;
        const ok = e && g && e.every((c, i) => Math.abs(c - g[i]) <= tol);
        if (!ok) dev.push({ type: 'token.color', name: tk.name, prop: p, expected: expV, actual: gotV });
      } else {
        const e = num(expV), g = num(gotV), tol = (tk.tol && tk.tol.px) || 2;
        if (!(Number.isFinite(e) && Number.isFinite(g) && Math.abs(e - g) <= tol)) dev.push({ type: 'token.size', name: tk.name, prop: p, expected: expV, actual: gotV });
      }
    }
  }
  return dev;
}

(async () => {
  const loginCfg = catalog.login || { site: 'ops' };
  const base = (process.env[(loginCfg.baseUrlEnv) || 'OPS_BASE_URL'] || '').replace(/\/+$/, '');
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 950 } })).newPage();
  page.setDefaultTimeout(10000);
  const report = { catalog: CATALOG, screens: [], totalDeviations: 0 };
  try {
    await login(page, loginCfg);
    for (const screen of catalog.screens || []) {
      if (screen.url) await page.goto(/^https?:/.test(screen.url) ? screen.url : base + screen.url, { waitUntil: 'networkidle', timeout: 40000 }).catch(() => {});
      await runPreSteps(page, base, screen.preSteps);
      await page.waitForTimeout(screen.settle || 3000);
      const shot = path.join(OUT, `${screen.name.replace(/[^A-Za-z0-9]+/g, '_')}.png`);
      await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
      const dev = await checkScreen(page, base, screen);
      report.screens.push({ name: screen.name, screenshot: path.relative(OUT, shot), deviations: dev });
      report.totalDeviations += dev.length;
      console.log(`\n=== ${screen.name} === ${dev.length ? dev.length + ' DEVIATION' : 'OK'}`);
      dev.forEach(d => console.log('   -', JSON.stringify(d)));
    }
  } catch (e) { console.error('FATAL', e.message.slice(0, 200)); }
  finally { await browser.close(); }

  // ghi report md + json
  fs.writeFileSync(path.join(OUT, 'conformance_report.json'), JSON.stringify(report, null, 2), 'utf8');
  const md = ['# UI Conformance Report', '', `Catalog: \`${CATALOG}\` — Tổng deviation: **${report.totalDeviations}**`, ''];
  for (const s of report.screens) {
    md.push(`## ${s.name} — ${s.deviations.length ? '❌ ' + s.deviations.length + ' deviation' : '✅ khớp'}`);
    md.push(`Ảnh: \`${s.screenshot}\``, '');
    if (s.deviations.length) { md.push('| Loại | Chi tiết |', '|---|---|'); s.deviations.forEach(d => { const { type, ...rest } = d; md.push(`| ${type} | ${JSON.stringify(rest)} |`); }); md.push(''); }
  }
  fs.writeFileSync(path.join(OUT, 'conformance_report.md'), md.join('\n'), 'utf8');
  console.log(`\nReport: ${path.join(OUT, 'conformance_report.md')} | Tổng deviation: ${report.totalDeviations}`);
  process.exit(report.totalDeviations > 0 ? 1 : 0);
})();
