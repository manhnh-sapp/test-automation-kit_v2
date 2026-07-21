#!/usr/bin/env node
'use strict';

/*
 * Performance check — biến mục 16 (Performance/SLA) thành ĐO THẬT, so ngưỡng catalog → verdict.
 * Tái dùng khuôn accessibility_check.js: runtime_config + login (env contract) + catalog + preSteps.
 * KHÔNG thêm dependency (Playwright đã có). Lighthouse/k6 là opt-in nặng, KHÔNG ở đây.
 *
 * QUAN TRỌNG (chống flaky): UAT nhiễu → mỗi metric đo N lần (mặc định 3), lấy MEDIAN. Verdict là
 * ADVISORY/threshold-gated: WARN/FAIL để điều tra, KHÔNG tự thành product bug cứng. Không có ngưỡng → N/A.
 *
 * Dùng:
 *   TASK_ENV=profiles/<TASK>/task.env node scripts/qa/perf_check.js --catalog <.../perf_catalog.json> [--runs 3] [--out <dir>]
 *   node scripts/qa/perf_check.js --url <http|file> --no-login   # smoke 1 trang, không login
 */

const fs = require('fs');
const path = require('path');
require(path.resolve(__dirname, '..', 'utils', 'runtime_config'));
const { chromium, request } = require('@playwright/test');

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && (process.argv[i + 1] === undefined || String(process.argv[i + 1]).startsWith('--'))) return true;
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const URL_ARG = arg('url');
const NO_LOGIN = arg('no-login', false) === true || !!URL_ARG;
const CATALOG = arg('catalog');
const RUNS = Math.max(1, parseInt(arg('runs', '3'), 10) || 3);

if (!URL_ARG && (!CATALOG || !fs.existsSync(CATALOG))) {
  console.error(`ERROR: cần --catalog <perf_catalog.json> hoặc --url <trang>. Catalog không tồn tại: ${CATALOG}`);
  process.exit(2);
}
const catalog = CATALOG && fs.existsSync(CATALOG) ? JSON.parse(fs.readFileSync(CATALOG, 'utf8')) : { screens: [] };
const perf = catalog.perf || catalog;
const OUT = path.resolve(arg('out', CATALOG ? path.join(path.dirname(CATALOG), '..', 'reports') : path.join(process.cwd(), 'reports')));
fs.mkdirSync(OUT, { recursive: true });

const median = (xs) => {
  const s = xs.filter((x) => x != null && !Number.isNaN(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

// Verdict advisory: PASS nếu <= ngưỡng, WARN nếu <= ngưỡng*1.2, FAIL nếu vượt hẳn. N/A nếu không có ngưỡng.
function verdict(value, threshold) {
  if (threshold == null) return { v: 'N/A', note: 'không có ngưỡng — không bịa số' };
  if (value == null) return { v: 'N/A', note: 'không đo được' };
  if (value <= threshold) return { v: 'PASS' };
  if (value <= threshold * 1.2) return { v: 'WARN', note: `vượt ngưỡng ≤20% (advisory, cần điều tra)` };
  return { v: 'FAIL', note: 'vượt ngưỡng >20% (advisory — không tự log product bug)' };
}

async function login(page, cfg) {
  if (!cfg) return;
  const base = (process.env[cfg.baseUrlEnv || 'OPS_BASE_URL'] || '').replace(/\/+$/, '');
  await page.goto(base + (cfg.loginPath || '/auth/login'), { waitUntil: 'networkidle', timeout: 45000 });
  await page.fill(cfg.userSelector || 'input[name=username]', process.env[cfg.userEnv || 'OPS_USERNAME']);
  await page.fill(cfg.passSelector || 'input[name=password]', process.env[cfg.passEnv || 'OPS_PASSWORD']);
  await page.click(cfg.submitSelector || 'button:has-text("Sign In")');
  await page.waitForTimeout(cfg.waitAfter || 4500);
}

async function runPreSteps(page, base, steps) {
  for (const s of steps || []) {
    if (s.action === 'goto') await page.goto(/^https?:/.test(s.value) ? s.value : base + s.value, { waitUntil: 'domcontentloaded', timeout: 40000 }).catch(() => {});
    else if (s.action === 'click') await page.locator(s.selector).first().click({ timeout: 8000 }).catch(() => {});
    else if (s.action === 'fill') await page.locator(s.selector).first().fill(s.value).catch(() => {});
    else if (s.action === 'wait') await page.waitForTimeout(Number(s.value) || 1000);
    await page.waitForTimeout(300);
  }
}

// Observers cho LCP/CLS phải cài TRƯỚC navigation.
const PERF_INIT = `window.__perf={lcp:0,cls:0};
try{new PerformanceObserver(l=>{for(const e of l.getEntries())window.__perf.lcp=e.startTime}).observe({type:'largest-contentful-paint',buffered:true});}catch(e){}
try{new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.__perf.cls+=e.value}).observe({type:'layout-shift',buffered:true});}catch(e){}`;

async function measureScreen(context, base, screen) {
  const samples = [];
  let resource = null;
  for (let i = 0; i < RUNS; i++) {
    const page = await context.newPage();
    await page.addInitScript(PERF_INIT);
    let bytes = 0, reqs = 0;
    page.on('response', async (r) => {
      reqs++;
      try { const b = await r.body(); bytes += b.length; } catch (e) {}
    });
    try {
      const url = screen.url ? (/^https?:/.test(screen.url) ? screen.url : base + screen.url) : base;
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      await runPreSteps(page, base, screen.preSteps);
      await page.waitForTimeout(1200); // để LCP/CLS settle (xấp xỉ — LCP chốt khi interaction)
      const m = await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0] || {};
        const fcp = (performance.getEntriesByType('paint').find((p) => p.name === 'first-contentful-paint') || {}).startTime;
        return {
          ttfb: nav.responseStart != null ? Math.round(nav.responseStart) : null,
          fcp: fcp != null ? Math.round(fcp) : null,
          lcp: Math.round(window.__perf.lcp) || null,
          dcl: nav.domContentLoadedEventEnd != null ? Math.round(nav.domContentLoadedEventEnd) : null,
          load: nav.loadEventEnd != null ? Math.round(nav.loadEventEnd) : null,
          cls: Math.round((window.__perf.cls || 0) * 1000) / 1000,
        };
      });
      samples.push(m);
      if (i === RUNS - 1) resource = { requests: reqs, kb: Math.round(bytes / 1024) };
    } catch (err) {
      samples.push({ error: err.message });
    } finally {
      await page.close();
    }
  }
  const keys = ['ttfb', 'fcp', 'lcp', 'dcl', 'load', 'cls'];
  const med = {};
  for (const k of keys) med[k] = median(samples.map((s) => s[k]));
  const th = screen.thresholds || {};
  const checks = keys.filter((k) => th[k] != null).map((k) => ({ metric: k, value: med[k], threshold: th[k], ...verdict(med[k], th[k]) }));
  return { name: screen.name || screen.url || '(screen)', runs: RUNS, median: med, resource, checks };
}

async function measureApi(apiCtx, base, ep) {
  const url = /^https?:/.test(ep.url) ? ep.url : base + ep.url;
  const times = [];
  for (let i = 0; i < RUNS; i++) {
    const t0 = Date.now();
    try { await apiCtx.fetch(url, { method: ep.method || 'GET' }); } catch (e) {}
    times.push(Date.now() - t0);
  }
  const med = median(times);
  return { name: ep.name || url, method: ep.method || 'GET', median_ms: med, threshold_ms: ep.threshold_ms, ...verdict(med, ep.threshold_ms) };
}

function mdReport(report) {
  const L = [];
  L.push('# Performance Report');
  L.push('');
  L.push(`> Nguồn: ${report.source} · ${report.generatedAt} · ${report.runs} lần/metric (median)`);
  L.push('> Verdict **ADVISORY** (UAT nhiễu): WARN/FAIL để điều tra, KHÔNG tự log product bug. Không ngưỡng → N/A.');
  L.push('');
  for (const s of report.screens) {
    L.push(`## ${s.name}`);
    if (s.resource) L.push(`- Resource: ${s.resource.requests} request · ${s.resource.kb} KB`);
    if (!s.checks.length) { L.push('- Không có ngưỡng cấu hình → N/A (đo được: ' + JSON.stringify(s.median) + ')'); L.push(''); continue; }
    L.push('');
    L.push('| Metric | Median | Ngưỡng | Verdict | Ghi chú |');
    L.push('|---|---|---|---|---|');
    for (const c of s.checks) L.push(`| ${c.metric.toUpperCase()} | ${c.value ?? '—'} | ${c.threshold} | ${c.v} | ${c.note || ''} |`);
    L.push('');
  }
  if (report.api.length) {
    L.push('## API response time (so SLA)');
    L.push('| Endpoint | Method | Median (ms) | Ngưỡng (ms) | Verdict | Ghi chú |');
    L.push('|---|---|---|---|---|---|');
    for (const a of report.api) L.push(`| ${a.name} | ${a.method} | ${a.median_ms ?? '—'} | ${a.threshold_ms ?? 'N/A'} | ${a.v} | ${a.note || ''} |`);
    L.push('');
  }
  return L.join('\n');
}

(async () => {
  const browser = await chromium.launch();
  const loginCfg = perf.login || catalog.login || { site: 'ops' };
  const base = (process.env[loginCfg.baseUrlEnv || 'OPS_BASE_URL'] || '').replace(/\/+$/, '');
  const report = { source: URL_ARG || CATALOG, generatedAt: new Date().toISOString().slice(0, 19).replace('T', ' '), runs: RUNS, screens: [], api: [] };

  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    if (!NO_LOGIN && !URL_ARG) await login(page, loginCfg);
    await page.close();

    const screens = URL_ARG ? [{ name: URL_ARG, url: URL_ARG }] : perf.screens || [];
    for (const screen of screens) report.screens.push(await measureScreen(context, base, screen));

    if (!URL_ARG && (perf.api || []).length) {
      const storage = await context.storageState();
      const apiCtx = await request.newContext({ storageState: storage });
      for (const ep of perf.api) report.api.push(await measureApi(apiCtx, base, ep));
      await apiCtx.dispose();
    }
  } finally {
    await browser.close();
  }

  fs.writeFileSync(path.join(OUT, 'perf-report.json'), JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(path.join(OUT, 'perf-report.md'), mdReport(report), 'utf8');
  const fails = [...report.screens.flatMap((s) => s.checks), ...report.api].filter((c) => c.v === 'FAIL').length;
  console.log(`[perf] Đã tạo: ${path.join(OUT, 'perf-report.md')}`);
  console.log(`[perf] ${report.screens.length} màn · ${report.api.length} API · ${fails} FAIL (advisory)`);
})();
