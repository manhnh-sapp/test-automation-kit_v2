#!/usr/bin/env node
'use strict';

/*
 * Lighthouse check — điểm Performance / Accessibility / SEO / Best-practices thật, chạy qua CDP.
 * Dùng `playwright-lighthouse` (playAudit): launch Chromium với --remote-debugging-port, Lighthouse audit trang.
 *
 * OPT-IN NẶNG (như k6 ở load_check): `playwright-lighthouse` + `lighthouse` KHÔNG phải core dep —
 *   thiếu → BỎ QUA sạch (exit 0), KHÔNG fail. Cài: `npm i -D playwright-lighthouse lighthouse`.
 * Verdict **ADVISORY** (UAT nhiễu, nhất là Performance): dùng đúng dải điểm chuẩn của Lighthouse
 *   (>=90 xanh=PASS · 50–89 cam=WARN · <50 đỏ=FAIL) làm khuyến cáo — KHÔNG tự thành product bug.
 *   Có thể override ngưỡng/nhóm qua catalog. Không bịa SLA.
 * AN TOÀN: read-only (chỉ navigate + audit) nhưng audit hơi nặng → never-auto, cần --confirm-nonprod
 *   (hoặc LH_CHECK_CONFIRM=1); CHẶN target giống prod.
 * AUTH: login qua env-contract (giống perf_check) đặt cookie/localStorage vào context trước khi audit.
 *   LƯU Ý: app xác thực bằng localStorage token (vd OPS) — Lighthouse điều hướng lại có thể mất localStorage;
 *   trang cần login mà rớt auth → điểm phản ánh trang /login. Trang public thì không vướng.
 * Evidence (kit chỉ nhận ảnh/video): lưu report Lighthouse (html/json) + chụp PNG bảng điểm 4 nhóm.
 *
 * Dùng:
 *   TASK_ENV=profiles/<TASK>/task.env node scripts/qa/lighthouse_check.js --catalog <.../lighthouse_catalog.json> --confirm-nonprod
 *   node scripts/qa/lighthouse_check.js --url https://example.com --no-login --confirm-nonprod
 *   [--port 9222] [--form-factor desktop|mobile] [--out <dir>] [--enforce]
 */

const fs = require('fs');
const path = require('path');
const rc = require(path.resolve(__dirname, '..', 'utils', 'runtime_config'));
const { chromium } = require('@playwright/test');

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && (process.argv[i + 1] === undefined || String(process.argv[i + 1]).startsWith('--'))) return true;
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const URL_ARG = arg('url');
const NO_LOGIN = arg('no-login', false) === true || !!URL_ARG;
const CATALOG = arg('catalog');
const PORT = parseInt(arg('port', '9222'), 10) || 9222;
const FORM_FACTOR = String(arg('form-factor', '') || '');
const CONFIRM = arg('confirm-nonprod', false) === true || process.env.LH_CHECK_CONFIRM === '1';
const ENFORCE = arg('enforce', false) === true;
const CATEGORIES = ['performance', 'accessibility', 'seo', 'best-practices'];

// --- Opt-in dep: thiếu → skip sạch (không fail), giống k6 ở load_check ---
let playAudit = null;
try { ({ playAudit } = require('playwright-lighthouse')); require.resolve('lighthouse'); } catch (e) { playAudit = null; }
if (!playAudit) {
  console.warn(
    '[lighthouse] `playwright-lighthouse`/`lighthouse` CHƯA cài → BỎ QUA (không phải FAIL).\n' +
      'Cài opt-in: npm i -D playwright-lighthouse lighthouse\n' +
      '(Điểm Lighthouse là tool nặng opt-in; Web Vitals thô vẫn chạy qua `npm run perf`.)',
  );
  process.exit(0);
}

if (!URL_ARG && (!CATALOG || !fs.existsSync(CATALOG))) {
  console.error(`ERROR: cần --catalog <lighthouse_catalog.json> hoặc --url <trang>. Catalog không tồn tại: ${CATALOG}`);
  process.exit(2);
}
const catalog = CATALOG && fs.existsSync(CATALOG) ? JSON.parse(fs.readFileSync(CATALOG, 'utf8')) : {};
const lh = catalog.lighthouse || catalog;
const loginCfg = lh.login || catalog.login || { site: 'ops' };
const base = (process.env[loginCfg.baseUrlEnv || 'OPS_BASE_URL'] || '').replace(/\/+$/, '');

function tod() { try { return rc.getTaskOutputDir(); } catch (e) { return null; } }
const OUT = path.resolve(arg('out', CATALOG ? path.join(path.dirname(CATALOG), '..', 'reports') : (tod() ? path.join(tod(), 'reports') : path.join(process.cwd(), 'reports'))));
fs.mkdirSync(OUT, { recursive: true });

// --- Guards (never-auto + chặn prod) ---
if (!CONFIRM) {
  console.error(
    '[lighthouse] TỪ CHỐI chạy: audit hơi nặng trên môi trường chung.\n' +
      'Xác nhận target NON-PROD + được phép, rồi chạy lại với --confirm-nonprod (hoặc LH_CHECK_CONFIRM=1).',
  );
  process.exit(3);
}
const targetForProdCheck = URL_ARG || base;
if (/prod/i.test(targetForProdCheck) && !/(uat|dev|stag|test|local)/i.test(targetForProdCheck)) {
  console.error(`[lighthouse] TỪ CHỐI: target trông giống PRODUCTION (${targetForProdCheck}). Chỉ chạy non-prod.`);
  process.exit(3);
}

// Verdict ADVISORY theo dải điểm chuẩn Lighthouse; catalog có thể override ngưỡng PASS per nhóm.
function verdict(score, passAt) {
  if (score == null) return { v: 'N/A', note: 'không đo được' };
  const pass = passAt != null ? passAt : 90;
  if (score >= pass) return { v: 'PASS' };
  if (score >= 50) return { v: 'WARN', note: 'dải cam 50–89 (advisory, nên cải thiện)' };
  return { v: 'FAIL', note: 'dải đỏ <50 (advisory — KHÔNG tự log product bug)' };
}

async function login(page, cfg) {
  if (!cfg) return;
  const b = (process.env[cfg.baseUrlEnv || 'OPS_BASE_URL'] || '').replace(/\/+$/, '');
  await page.goto(b + (cfg.loginPath || '/auth/login'), { waitUntil: 'networkidle', timeout: 45000 });
  await page.fill(cfg.userSelector || 'input[name=username]', process.env[cfg.userEnv || 'OPS_USERNAME'] || '');
  await page.fill(cfg.passSelector || 'input[name=password]', process.env[cfg.passEnv || 'OPS_PASSWORD'] || '');
  await page.click(cfg.submitSelector || 'button:has-text("Sign In")').catch(() => page.keyboard.press('Enter'));
  await page.waitForTimeout(cfg.waitAfter || 4500);
}

// Bóc điểm 4 nhóm từ kết quả playAudit (đa version) hoặc từ file json report vừa ghi.
function scoresFrom(res, jsonReportPath) {
  let lhr = (res && (res.lhr || (res.comparison && res.comparison.lhr))) || null;
  if ((!lhr || !lhr.categories) && jsonReportPath && fs.existsSync(jsonReportPath)) {
    try { lhr = JSON.parse(fs.readFileSync(jsonReportPath, 'utf8')); } catch (e) { /* ignore */ }
  }
  const cats = (lhr && lhr.categories) || {};
  const out = {};
  for (const c of CATEGORIES) out[c] = cats[c] && cats[c].score != null ? Math.round(cats[c].score * 100) : null;
  return out;
}

async function auditScreen(browser, screen) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const safe = (screen.name || screen.url || 'screen').replace(/[^\w-]+/g, '_').slice(0, 40); // bỏ dấu chấm: playwright-lighthouse cắt tên ở '.'
  const jsonName = `lighthouse-${safe}`;
  try {
    if (!NO_LOGIN && loginCfg) await login(page, loginCfg);
    const url = screen.url ? (/^https?:/.test(screen.url) ? screen.url : base + screen.url) : (URL_ARG || base);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1000);
    const opts = { onlyCategories: CATEGORIES };
    const ff = FORM_FACTOR || screen.formFactor || lh.formFactor || 'desktop';
    if (ff === 'desktop') { opts.formFactor = 'desktop'; opts.screenEmulation = { disabled: true }; }
    const res = await playAudit({
      page, port: PORT, thresholds: { performance: 0, accessibility: 0, seo: 0, 'best-practices': 0 },
      ignoreError: true, opts, reports: { formats: { html: true, json: true }, name: jsonName, directory: OUT },
    }).catch((e) => ({ error: e.message }));
    const scores = scoresFrom(res, path.join(OUT, `${jsonName}.json`));
    const passAt = (screen.thresholds || lh.thresholds || {});
    const checks = CATEGORIES.map((c) => ({ category: c, score: scores[c], passAt: passAt[c] != null ? passAt[c] : 90, ...verdict(scores[c], passAt[c]) }));
    return { name: screen.name || url, url, formFactor: ff, scores, checks, report: `${jsonName}.html`, error: res && res.error };
  } finally {
    await context.close();
  }
}

// Evidence PNG: render bảng điểm 4 nhóm gọn rồi screenshot (kit chỉ nhận ảnh/video).
async function scoreEvidence(browser, report) {
  const color = (s) => (s == null ? '#9ca3af' : s >= 90 ? '#16a34a' : s >= 50 ? '#d97706' : '#dc2626');
  const rows = report.screens.map((s) => `
    <div class="scr"><div class="nm">${(s.name || '').replace(/</g, '&lt;').slice(0, 70)}</div><div class="gg">
      ${CATEGORIES.map((c) => `<div class="g"><div class="c" style="border-color:${color(s.scores[c])};color:${color(s.scores[c])}">${s.scores[c] == null ? '—' : s.scores[c]}</div><div class="l">${c}</div></div>`).join('')}
    </div></div>`).join('');
  const html = `<!doctype html><meta charset="utf-8"><style>
    body{font:14px system-ui,Segoe UI,Roboto,Arial;margin:24px;color:#111}
    h1{font-size:18px;margin:0 0 4px} .sub{color:#666;font-size:12px;margin:0 0 18px}
    .scr{margin:0 0 20px} .nm{font-weight:600;margin:0 0 8px}
    .gg{display:flex;gap:22px} .g{text-align:center;width:120px}
    .c{width:72px;height:72px;line-height:68px;margin:0 auto;border:4px solid;border-radius:50%;font-size:24px;font-weight:700}
    .l{margin-top:6px;text-transform:capitalize;color:#444;font-size:12px}</style>
    <h1>Lighthouse scores</h1><p class="sub">${report.generatedAt} · form-factor ${report.screens[0] ? report.screens[0].formFactor : ''} · advisory (dải điểm chuẩn Lighthouse: ≥90 xanh / 50–89 cam / &lt;50 đỏ)</p>${rows}`;
  const page = await browser.newPage();
  const pngPath = path.join(OUT, 'lighthouse-scores.png');
  try {
    await page.setContent(html, { waitUntil: 'load' });
    await page.setViewportSize({ width: 700, height: Math.min(1600, 160 + report.screens.length * 150) });
    await page.screenshot({ path: pngPath, fullPage: true });
  } finally { await page.close(); }
  return pngPath;
}

function mdReport(report, pngPath) {
  const L = ['# Lighthouse Report', '',
    `> Nguồn: ${report.source} · ${report.generatedAt} · qua CDP (playwright-lighthouse)`,
    '> Verdict **ADVISORY** theo dải điểm chuẩn Lighthouse (≥90 PASS · 50–89 WARN · <50 FAIL) — KHÔNG tự log product bug.',
    `> Evidence: ${path.basename(pngPath)} (bảng điểm) + report Lighthouse html/json cùng thư mục.`, ''];
  for (const s of report.screens) {
    L.push(`## ${s.name}`);
    if (s.error) L.push(`- Lưu ý: audit lỗi/không đầy đủ (${s.error}).`);
    L.push(`- Report chi tiết: ${s.report}`, '');
    L.push('| Nhóm | Điểm | Ngưỡng PASS | Verdict | Ghi chú |', '|---|---|---|---|---|');
    for (const c of s.checks) L.push(`| ${c.category} | ${c.score ?? '—'} | ${c.passAt} | ${c.v} | ${c.note || ''} |`);
    L.push('');
  }
  return L.join('\n');
}

(async () => {
  const browser = await chromium.launch({ args: [`--remote-debugging-port=${PORT}`] });
  const report = { source: URL_ARG || CATALOG, generatedAt: new Date().toISOString().slice(0, 19).replace('T', ' '), screens: [] };
  try {
    const screens = URL_ARG ? [{ name: URL_ARG, url: URL_ARG }] : (lh.screens || []);
    if (!screens.length) { console.error('ERROR: catalog không có `lighthouse.screens` và không có --url.'); process.exit(2); }
    for (const screen of screens) report.screens.push(await auditScreen(browser, screen));
    const pngPath = await scoreEvidence(browser, report);
    fs.writeFileSync(path.join(OUT, 'lighthouse-report.json'), JSON.stringify(report, null, 2), 'utf8');
    fs.writeFileSync(path.join(OUT, 'lighthouse-report.md'), mdReport(report, pngPath), 'utf8');
    const fails = report.screens.flatMap((s) => s.checks).filter((c) => c.v === 'FAIL').length;
    console.log(`[lighthouse] Đã tạo: ${path.join(OUT, 'lighthouse-report.md')} + lighthouse-scores.png`);
    console.log(`[lighthouse] ${report.screens.length} màn · ${fails} nhóm FAIL (advisory)`);
    if (ENFORCE && fails) { console.error(`[lighthouse] ENFORCE: ${fails} nhóm dưới ngưỡng.`); process.exit(1); }
  } finally {
    await browser.close();
  }
  process.exit(0);
})().catch((e) => { console.error('[lighthouse] ERROR:', e.message); process.exit(1); });
