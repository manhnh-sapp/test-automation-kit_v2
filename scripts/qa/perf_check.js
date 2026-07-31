#!/usr/bin/env node
'use strict';

/*
 * Performance check — biến mục 16 (Performance/SLA) thành ĐO THẬT, so ngưỡng catalog → verdict.
 * Tái dùng khuôn accessibility_check.js: runtime_config + login (env contract) + catalog + preSteps.
 * KHÔNG thêm dependency (Playwright đã có: CDPSession + page.coverage là built-in).
 * Điểm Lighthouse → scripts/qa/lighthouse_check.js (opt-in); load nhiều VU → load_check.js (k6).
 *
 * QUAN TRỌNG (chống flaky): UAT nhiễu → mỗi metric đo N lần (mặc định 3), lấy MEDIAN. Verdict là
 * ADVISORY/threshold-gated: WARN/FAIL để điều tra, KHÔNG tự thành product bug cứng. Không có ngưỡng → N/A.
 *
 * --deep (CDP thô, tín hiệu sâu — chạy RUN RIÊNG sau các run đo thời gian vì coverage/profiler làm
 * LỆCH timing, không được trộn vào median):
 *   - Coverage động JS/CSS (`page.coverage`): bytes đã chạy / tổng → **% thừa** (dead code tải về không dùng)
 *     và **% code FE test chạm tới**. Có top file thừa nhiều nhất để biết chỗ cần code-split.
 *   - `Performance.getMetrics` (CDP): ScriptDuration/LayoutDuration/RecalcStyleDuration/TaskDuration,
 *     LayoutCount/RecalcStyleCount, JSHeapUsedSize, Nodes, JSEventListeners → nhận diện long-task/layout-thrash.
 *   - `Memory.getDOMCounters` + heap usage; `--heap-snapshot` ghi file .heapsnapshot (NẶNG, chỉ khi cần điều tra leak).
 *   - Emulation: `--cpu-throttle <rate>` (Emulation.setCPUThrottlingRate) và `--net-throttle slow3g|fast3g|offline`
 *     (Network.emulateNetworkConditions) — áp cho CẢ run đo thời gian (là điều kiện đo, phải ghi vào report).
 *
 * Dùng:
 *   TASK_ENV=profiles/<TASK>/task.env node scripts/qa/perf_check.js --catalog <.../perf_catalog.json> [--runs 3] [--out <dir>]
 *   node scripts/qa/perf_check.js --url <http|file> --no-login   # smoke 1 trang, không login
 *   node scripts/qa/perf_check.js --url <...> --no-login --deep [--cpu-throttle 4] [--net-throttle slow3g] [--heap-snapshot]
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
const DEEP = arg('deep', false) === true;
const HEAP_SNAPSHOT = arg('heap-snapshot', false) === true;
const CPU_THROTTLE = Math.max(1, parseFloat(arg('cpu-throttle', '1')) || 1);
const NET_THROTTLE = String(arg('net-throttle', '') || '');

// Profile mạng (giá trị chuẩn DevTools). offline để test resilience (mục 8), không phải đo perf.
const NET_PROFILES = {
  slow3g: { offline: false, latency: 400, downloadThroughput: (400 * 1024) / 8, uploadThroughput: (400 * 1024) / 8 },
  fast3g: { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 },
  offline: { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 },
};
if (NET_THROTTLE && !NET_PROFILES[NET_THROTTLE]) {
  console.error(`ERROR: --net-throttle không hợp lệ: ${NET_THROTTLE} (dùng: ${Object.keys(NET_PROFILES).join('|')})`);
  process.exit(2);
}

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

// --- CDP thô: throttling + tín hiệu sâu (chỉ chromium) ---

/** Áp CPU/network throttling qua CDP. Là ĐIỀU KIỆN ĐO → ghi vào report. Trả CDPSession (hoặc null). */
async function applyThrottle(context, page) {
  if (CPU_THROTTLE === 1 && !NET_THROTTLE) return null;
  try {
    const cdp = await context.newCDPSession(page);
    if (CPU_THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });
    if (NET_THROTTLE) { await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', NET_PROFILES[NET_THROTTLE]); }
    return cdp;
  } catch (e) { return null; } // non-chromium hoặc CDP không khả dụng → bỏ qua, không fail
}

/** Gộp khoảng [start,end) chồng lấn rồi tính tổng độ dài (V8 range lồng nhau → không cộng thẳng được). */
function mergedLength(ranges) {
  if (!ranges.length) return 0;
  const s = ranges.slice().sort((a, b) => a[0] - b[0]);
  let total = 0, [cs, ce] = s[0];
  for (let i = 1; i < s.length; i++) {
    const [a, b] = s[i];
    if (a <= ce) ce = Math.max(ce, b);
    else { total += ce - cs; cs = a; ce = b; }
  }
  return total + (ce - cs);
}

/** Tổng hợp coverage JS/CSS → bytes tổng/đã dùng/thừa + top file thừa nhiều nhất. */
function summarizeCoverage(jsCov, cssCov) {
  const files = [];
  let total = 0, used = 0;
  for (const e of jsCov || []) {
    const size = (e.source || '').length;
    if (!size) continue;
    // V8 trả range BỌC cả script với count>0 → cộng range count>0 sẽ ra "0% thừa" (sai).
    // Đúng: gom range count===0 (block KHÔNG chạy, carve-out khỏi hàm cha) → unused; used = size - unused.
    const dead = [];
    for (const f of e.functions || []) for (const r of f.ranges || []) if (r.count === 0) dead.push([r.startOffset, r.endOffset]);
    const u = Math.max(0, size - Math.min(size, mergedLength(dead)));
    total += size; used += u;
    files.push({ type: 'js', url: e.url, kb: Math.round(size / 1024), unusedKb: Math.round((size - u) / 1024), unusedPct: Math.round(((size - u) / size) * 100) });
  }
  for (const e of cssCov || []) {
    const size = (e.text || '').length;
    if (!size) continue;
    const u = Math.min(size, mergedLength((e.ranges || []).map((r) => [r.start, r.end])));
    total += size; used += u;
    files.push({ type: 'css', url: e.url, kb: Math.round(size / 1024), unusedKb: Math.round((size - u) / 1024), unusedPct: Math.round(((size - u) / size) * 100) });
  }
  if (!total) return null;
  files.sort((a, b) => b.unusedKb - a.unusedKb);
  return {
    totalKb: Math.round(total / 1024),
    usedKb: Math.round(used / 1024),
    unusedKb: Math.round((total - used) / 1024),
    usedPct: Math.round((used / total) * 100),      // = % code FE mà luồng test CHẠM tới
    unusedPct: Math.round(((total - used) / total) * 100), // = % tải về nhưng không chạy (dead weight)
    topUnused: files.slice(0, 8),
  };
}

/**
 * Deep probe — RUN RIÊNG (không tính vào median timing vì coverage/profiler gây overhead).
 * Coverage động + Performance.getMetrics + DOM counters + heap (+ heap snapshot nếu bật).
 */
async function deepProbe(context, base, screen, outDir) {
  const page = await context.newPage();
  const out = { note: 'run riêng — không ảnh hưởng median timing ở trên' };
  let cdp;
  try {
    cdp = await applyThrottle(context, page);
    if (!cdp) { try { cdp = await context.newCDPSession(page); } catch (e) { cdp = null; } }
    // Performance.enable PHẢI trước navigation — counter chỉ tích luỹ từ lúc enable (enable sau load → toàn 0).
    if (cdp) await cdp.send('Performance.enable').catch(() => {});
    await page.coverage.startJSCoverage({ resetOnNavigation: false }).catch(() => {});
    await page.coverage.startCSSCoverage({ resetOnNavigation: false }).catch(() => {});

    const url = screen.url ? (/^https?:/.test(screen.url) ? screen.url : base + screen.url) : base;
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await runPreSteps(page, base, screen.preSteps);
    await page.waitForTimeout(1200);

    const jsCov = await page.coverage.stopJSCoverage().catch(() => []);
    const cssCov = await page.coverage.stopCSSCoverage().catch(() => []);
    out.coverage = summarizeCoverage(jsCov, cssCov);

    if (cdp) {
      try {
        const { metrics } = await cdp.send('Performance.getMetrics'); // đã enable trước navigation
        const m = Object.fromEntries((metrics || []).map((x) => [x.name, x.value]));
        const ms = (v) => (v == null ? null : Math.round(v * 1000)); // CDP trả giây → ms
        out.cdpMetrics = {
          scriptDuration_ms: ms(m.ScriptDuration), layoutDuration_ms: ms(m.LayoutDuration),
          recalcStyleDuration_ms: ms(m.RecalcStyleDuration), taskDuration_ms: ms(m.TaskDuration),
          layoutCount: m.LayoutCount ?? null, recalcStyleCount: m.RecalcStyleCount ?? null,
          jsHeapUsedMb: m.JSHeapUsedSize != null ? Math.round(m.JSHeapUsedSize / 1048576) : null,
          jsHeapTotalMb: m.JSHeapTotalSize != null ? Math.round(m.JSHeapTotalSize / 1048576) : null,
          nodes: m.Nodes ?? null, documents: m.Documents ?? null, jsEventListeners: m.JSEventListeners ?? null,
        };
      } catch (e) { out.cdpMetricsError = e.message; }
      try { out.domCounters = await cdp.send('Memory.getDOMCounters'); } catch (e) { /* optional */ }
      if (HEAP_SNAPSHOT) {
        try {
          const safe = (screen.name || screen.url || 'screen').replace(/[^\w-]+/g, '_').slice(0, 40);
          const file = path.join(outDir, `heap-${safe}.heapsnapshot`);
          const chunks = [];
          const onChunk = (p) => chunks.push(p.chunk);
          cdp.on('HeapProfiler.addHeapSnapshotChunk', onChunk);
          await cdp.send('HeapProfiler.enable');
          await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
          cdp.off('HeapProfiler.addHeapSnapshotChunk', onChunk);
          fs.writeFileSync(file, chunks.join(''), 'utf8');
          out.heapSnapshot = path.basename(file); // mở bằng Chrome DevTools → Memory → Load
        } catch (e) { out.heapSnapshotError = e.message; }
      }
    }
  } catch (e) {
    out.error = e.message;
  } finally {
    await page.close().catch(() => {});
  }
  return out;
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
    await applyThrottle(context, page); // điều kiện đo (CPU/network) — áp trước navigation
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

/** Render section --deep (coverage động + CDP metrics + heap). Advisory, không có ngưỡng cứng. */
function deepSection(d) {
  const L = ['### Tín hiệu sâu (CDP · run riêng, không tính vào median)'];
  if (d.error) L.push(`- Lỗi deep probe: ${d.error}`);
  const cv = d.coverage;
  if (cv) {
    L.push(`- **Coverage động**: tải ${cv.totalKb} KB · **chạy thật ${cv.usedKb} KB (${cv.usedPct}%)** · **thừa ${cv.unusedKb} KB (${cv.unusedPct}%)**`);
    L.push(`  - \`usedPct\` = % code FE luồng test CHẠM tới; \`unusedPct\` = dead weight tải về không chạy (ứng viên code-split/lazy-load).`);
    if (cv.topUnused && cv.topUnused.length) {
      L.push('', '| File (top thừa) | Loại | Tải (KB) | Thừa (KB) | Thừa (%) |', '|---|---|---|---|---|');
      for (const f of cv.topUnused) L.push(`| ${String(f.url || '').split('?')[0].slice(-60)} | ${f.type} | ${f.kb} | ${f.unusedKb} | ${f.unusedPct}% |`);
    }
  } else L.push('- Coverage: không thu được (non-chromium hoặc trang không tải JS/CSS).');
  const m = d.cdpMetrics;
  if (m) {
    L.push('', '| CDP metric | Giá trị | Ý nghĩa |', '|---|---|---|',
      `| ScriptDuration | ${m.scriptDuration_ms ?? '—'} ms | tổng thời gian chạy JS (cao → main-thread nghẽn) |`,
      `| LayoutDuration | ${m.layoutDuration_ms ?? '—'} ms | thời gian layout (cao + LayoutCount lớn → layout thrash) |`,
      `| RecalcStyleDuration | ${m.recalcStyleDuration_ms ?? '—'} ms | tính lại style |`,
      `| TaskDuration | ${m.taskDuration_ms ?? '—'} ms | tổng task main-thread |`,
      `| LayoutCount / RecalcStyleCount | ${m.layoutCount ?? '—'} / ${m.recalcStyleCount ?? '—'} | số lần layout/recalc |`,
      `| JS heap used / total | ${m.jsHeapUsedMb ?? '—'} / ${m.jsHeapTotalMb ?? '—'} MB | bộ nhớ JS (theo dõi leak qua nhiều lần) |`,
      `| Nodes / Listeners | ${m.nodes ?? '—'} / ${m.jsEventListeners ?? '—'} | DOM phình / listener rò |`);
  } else if (d.cdpMetricsError) L.push(`- CDP metrics lỗi: ${d.cdpMetricsError}`);
  if (d.heapSnapshot) L.push('', `- Heap snapshot: \`${d.heapSnapshot}\` (mở Chrome DevTools → Memory → Load).`);
  if (d.heapSnapshotError) L.push(`- Heap snapshot lỗi: ${d.heapSnapshotError}`);
  L.push('');
  return L;
}

function mdReport(report) {
  const L = [];
  L.push('# Performance Report');
  L.push('');
  L.push(`> Nguồn: ${report.source} · ${report.generatedAt} · ${report.runs} lần/metric (median)`);
  const c = report.conditions || {};
  L.push(`> Điều kiện đo: CPU throttle ×${c.cpuThrottle || 1} · network ${c.netThrottle || 'none'}${c.deep ? ' · deep CDP: ON' : ''}`);
  L.push('> Verdict **ADVISORY** (UAT nhiễu): WARN/FAIL để điều tra, KHÔNG tự log product bug. Không ngưỡng → N/A.');
  L.push('');
  for (const s of report.screens) {
    L.push(`## ${s.name}`);
    if (s.resource) L.push(`- Resource: ${s.resource.requests} request · ${s.resource.kb} KB`);
    if (!s.checks.length) L.push('- Không có ngưỡng cấu hình → N/A (đo được: ' + JSON.stringify(s.median) + ')');
    else {
      L.push('');
      L.push('| Metric | Median | Ngưỡng | Verdict | Ghi chú |');
      L.push('|---|---|---|---|---|');
      for (const c of s.checks) L.push(`| ${c.metric.toUpperCase()} | ${c.value ?? '—'} | ${c.threshold} | ${c.v} | ${c.note || ''} |`);
    }
    L.push('');
    if (s.deep) L.push(...deepSection(s.deep));
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
  const report = {
    source: URL_ARG || CATALOG, generatedAt: new Date().toISOString().slice(0, 19).replace('T', ' '), runs: RUNS,
    conditions: { cpuThrottle: CPU_THROTTLE, netThrottle: NET_THROTTLE || 'none', deep: DEEP },
    screens: [], api: [],
  };

  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    if (!NO_LOGIN && !URL_ARG) await login(page, loginCfg);
    await page.close();

    const screens = URL_ARG ? [{ name: URL_ARG, url: URL_ARG }] : perf.screens || [];
    for (const screen of screens) {
      const s = await measureScreen(context, base, screen);
      if (DEEP) s.deep = await deepProbe(context, base, screen, OUT); // run riêng, sau khi đã đo timing
      report.screens.push(s);
    }

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
