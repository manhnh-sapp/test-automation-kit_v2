#!/usr/bin/env node
'use strict';

/*
 * Accessibility check — tái dùng hạ tầng của ui_conformance_check.js (login/pre-steps/catalog schema
 * + env contract OPS_BASE_URL/USERNAME/PASSWORD), inject axe-core chạy trên trang đã login.
 * KHÔNG thay ui_conformance_check.js (mục tiêu khác: display/design). Never-auto — chạy khi user yêu cầu.
 *
 * Dùng:
 *   node scripts/qa/accessibility_check.js --catalog <path/ui_catalog.json> [--out <dir>]
 *   node scripts/qa/accessibility_check.js --url <file-or-http> --no-login   # smoke 1 trang, không login
 *
 * Kiểm: missing label, color contrast, keyboard navigation, ARIA role (ruleset mặc định axe-core).
 * Output: <out>/accessibility-report.md + accessibility-report.json (mặc định cạnh reports/).
 */

const fs = require('fs');
const path = require('path');
require(path.resolve(__dirname, '..', 'utils', 'runtime_config'));
const { chromium } = require('@playwright/test');
const AXE_PATH = require.resolve('axe-core'); // UMD build → set window.axe khi addScriptTag

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && (process.argv[i + 1] === undefined || String(process.argv[i + 1]).startsWith('--'))) return true; // flag
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const URL_ARG = arg('url');
const NO_LOGIN = arg('no-login', false) === true || !!URL_ARG;
const CATALOG = arg('catalog');

if (!URL_ARG && (!CATALOG || !fs.existsSync(CATALOG))) {
  console.error(`ERROR: cần --catalog <ui_catalog.json> hoặc --url <trang>. Catalog không tồn tại: ${CATALOG}`);
  process.exit(2);
}
const catalog = CATALOG && fs.existsSync(CATALOG) ? JSON.parse(fs.readFileSync(CATALOG, 'utf8')) : { screens: [] };
const OUT = path.resolve(
  arg('out', CATALOG ? path.join(path.dirname(CATALOG), '..', 'reports') : path.join(process.cwd(), 'reports')),
);
fs.mkdirSync(OUT, { recursive: true });

// --- login: cùng contract với ui_conformance_check.js (không sửa file đó) ---
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
    if (s.action === 'goto') await page.goto(/^https?:/.test(s.value) ? s.value : base + s.value, { waitUntil: 'domcontentloaded', timeout: 40000 }).catch(() => {});
    else if (s.action === 'click') await page.locator(s.selector).first().click({ timeout: 8000 }).catch(() => {});
    else if (s.action === 'fill') await page.locator(s.selector).first().fill(s.value).catch(() => {});
    else if (s.action === 'selectOption') await page.locator(s.selector).first().selectOption(s.value).catch(() => {});
    else if (s.action === 'waitFor') await page.locator(s.selector).first().waitFor({ timeout: 8000 }).catch(() => {});
    else if (s.action === 'wait') await page.waitForTimeout(Number(s.value) || 1000);
    await page.waitForTimeout(400);
  }
}

async function runAxe(page, scopeSelector) {
  await page.addScriptTag({ path: AXE_PATH });
  return page.evaluate(async (sel) => {
    const ctx = sel ? { include: [sel] } : document;
    // eslint-disable-next-line no-undef
    const res = await axe.run(ctx, { resultTypes: ['violations'] });
    return res.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      helpUrl: v.helpUrl,
      nodes: v.nodes.length,
      sample: v.nodes.slice(0, 3).map((n) => (n.target || []).join(' ')),
    }));
  }, scopeSelector);
}

const IMPACT_ORDER = { critical: 0, serious: 1, moderate: 2, minor: 3, null: 4 };

function mdReport(report) {
  const lines = [];
  lines.push('# Accessibility Report (axe-core)');
  lines.push('');
  lines.push(`> Nguồn: ${report.source} · Ngày: ${report.generatedAt}`);
  lines.push('> Never-auto — chạy theo yêu cầu. Kết quả là **finding a11y để review**, không phải verdict PASS/FAIL tự động.');
  lines.push('');
  lines.push(`**Tổng violation:** ${report.totalViolations} trên ${report.screens.length} trang.`);
  lines.push('');
  for (const sc of report.screens) {
    lines.push(`## ${sc.name}`);
    if (sc.error) { lines.push(`- ⚠️ Lỗi khi scan: ${sc.error}`); lines.push(''); continue; }
    if (!sc.violations.length) { lines.push('- ✅ Không có violation (theo ruleset mặc định axe-core).'); lines.push(''); continue; }
    lines.push('');
    lines.push('| Impact | Rule | Mô tả | Số node | Ví dụ selector |');
    lines.push('|---|---|---|---|---|');
    for (const v of sc.violations) {
      lines.push(`| ${v.impact || '-'} | \`${v.id}\` | ${v.help} | ${v.nodes} | \`${(v.sample[0] || '').slice(0, 60)}\` |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const report = { source: URL_ARG || CATALOG, generatedAt: new Date().toISOString().slice(0, 19).replace('T', ' '), screens: [], totalViolations: 0 };

  try {
    if (URL_ARG) {
      // Smoke 1 trang (không login) — dùng verify axe hoạt động, hoặc scan trang tĩnh.
      const target = /^https?:|^file:/.test(URL_ARG) ? URL_ARG : 'file:///' + path.resolve(URL_ARG).replace(/\\/g, '/');
      await page.goto(target, { waitUntil: 'networkidle', timeout: 45000 });
      const violations = (await runAxe(page)).sort((a, b) => IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact]);
      report.screens.push({ name: URL_ARG, violations });
      report.totalViolations += violations.length;
    } else {
      const loginCfg = catalog.login || { site: 'ops' };
      const base = (process.env[loginCfg.baseUrlEnv || 'OPS_BASE_URL'] || '').replace(/\/+$/, '');
      if (!NO_LOGIN) await login(page, loginCfg);
      for (const screen of catalog.screens || []) {
        try {
          await runPreSteps(page, base, screen.preSteps || screen.steps);
          const violations = (await runAxe(page, screen.scopeSelector)).sort((a, b) => IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact]);
          report.screens.push({ name: screen.name || screen.url || '(screen)', violations });
          report.totalViolations += violations.length;
        } catch (err) {
          report.screens.push({ name: screen.name || '(screen)', violations: [], error: err.message });
        }
      }
    }
  } finally {
    await browser.close();
  }

  fs.writeFileSync(path.join(OUT, 'accessibility-report.json'), JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(path.join(OUT, 'accessibility-report.md'), mdReport(report), 'utf8');
  console.log(`[a11y] Đã tạo: ${path.join(OUT, 'accessibility-report.md')}`);
  console.log(`[a11y] ${report.screens.length} trang · ${report.totalViolations} violation`);
})();
