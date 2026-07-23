#!/usr/bin/env node
'use strict';

// Dashboard tổng hợp — đọc dữ liệu ĐÃ CÓ (knowledge/ + flaky-triage.md), KHÔNG thu thập lại,
// KHÔNG thêm dependency. Xuất 1 file HTML tĩnh reports/dashboard.html theo SAPP Academy Design System
// (gold #FFB700, warm ink #1A1916, Be Vietnam Pro, radius 16, logo docs/brand/logo-sapp.png).
// Nguồn: knowledge/historical_execution/ (coverage & pass/fail theo task/module),
//        knowledge/bugs/ (risk theo module), <PROJECT_OUTPUT_DIR>/tasks/*/reports/flaky-triage.md (flaky).

const fs = require('fs');
const path = require('path');
const {
  REPO_ROOT,
  getProjectOutputDir,
  resolveFromRepo,
} = require('../utils/runtime_config');

const KNOWLEDGE_DIR = path.join(REPO_ROOT, 'knowledge');
const OUT_DIR = path.join(REPO_ROOT, 'reports');
const OUT_FILE = path.join(OUT_DIR, 'dashboard.html');
const BRANDING_FILE = path.join(REPO_ROOT, '.agent', 'config', 'dashboard.branding.json');

// Default = SAPP Academy Design System. Override qua .agent/config/dashboard.branding.json (tùy chọn).
const DEFAULT_BRANDING = {
  brandName: 'SAPP Academy',
  eyebrow: 'SAPP Academy · QA Automation Kit',
  motto: 'Advance your career',
  logoPath: 'docs/brand/logo-sapp.png',
  fontFamily: "'Be Vietnam Pro', system-ui, 'Segoe UI', sans-serif",
  fontImport: 'https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=swap',
  colors: {
    gold: '#FFB700', gold600: '#E6A300', gold800: '#946800', goldWash: '#FFF9EC',
    ink: '#1A1916', wash: '#FAF8F3', card: '#FFFFFF',
    bSubtle: '#E6E0D5', bSoft: '#EFE9DD',
    t1: '#1A1916', t2: '#57534A', t3: '#79736A',
    passBg: '#E9F6EF', passFg: '#14613F', failBg: '#FBEAEA', failFg: '#9E2C2C',
  },
};

function loadBranding() {
  try {
    const override = JSON.parse(fs.readFileSync(BRANDING_FILE, 'utf8'));
    return {
      ...DEFAULT_BRANDING,
      ...override,
      colors: { ...DEFAULT_BRANDING.colors, ...(override.colors || {}) },
    };
  } catch (err) {
    return DEFAULT_BRANDING; // không có file override → giữ SAPP DS
  }
}

function readJsonDir(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      } catch (err) {
        console.warn(`[dashboard] Bỏ qua JSON lỗi: ${f} (${err.message})`);
        return null;
      }
    })
    .filter(Boolean);
}

function loadLogo(logoPath) {
  try {
    const abs = path.isAbsolute(logoPath) ? logoPath : path.join(REPO_ROOT, logoPath);
    const b64 = fs.readFileSync(abs).toString('base64');
    const ext = path.extname(abs).slice(1).toLowerCase() || 'png';
    const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    return `data:${mime};base64,${b64}`;
  } catch (err) {
    return null;
  }
}

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// --- Coverage & pass/fail theo task: lấy snapshot MỚI NHẤT mỗi task ---
function buildCoverage(historical) {
  const latestByTask = new Map();
  for (const snap of historical) {
    if (!snap || !snap.task_key) continue;
    const prev = latestByTask.get(snap.task_key);
    if (!prev || String(snap.date || '') >= String(prev.date || '')) {
      latestByTask.set(snap.task_key, snap);
    }
  }
  return [...latestByTask.values()].sort((a, b) =>
    String(b.date || '').localeCompare(String(a.date || '')),
  );
}

function sumModules(snap) {
  const acc = { total: 0, pass: 0, fail: 0, skip: 0 };
  for (const m of Object.values(snap.modules || {})) {
    acc.total += Number(m.total || 0);
    acc.pass += Number(m.pass || 0);
    acc.fail += Number(m.fail || 0);
    acc.skip += Number(m.skip || 0);
  }
  return acc;
}

// --- Risk theo module: số bug (knowledge/bugs) + tổng fail (snapshot mới nhất) ---
function buildModuleRisk(bugs, coverage) {
  const risk = new Map();
  const ensure = (module) => {
    const key = module || '(không rõ module)';
    if (!risk.has(key)) risk.set(key, { module: key, bugs: 0, fails: 0 });
    return risk.get(key);
  };
  for (const bug of bugs) ensure(bug.module).bugs += 1;
  for (const snap of coverage) {
    for (const [module, m] of Object.entries(snap.modules || {})) {
      ensure(module).fails += Number(m.fail || 0);
    }
  }
  return [...risk.values()].sort((a, b) => b.bugs - a.bugs || b.fails - a.fails);
}

// --- Flaky: best-effort quét <PROJECT_OUTPUT_DIR>/tasks/*/reports/flaky-triage.md ---
function findFlakyReports() {
  let projectOutputDir;
  try {
    projectOutputDir = resolveFromRepo(getProjectOutputDir());
  } catch (err) {
    return { available: false, reason: 'PROJECT_OUTPUT_DIR chưa cấu hình', items: [] };
  }
  const tasksDir = path.join(projectOutputDir, 'tasks');
  if (!fs.existsSync(tasksDir)) {
    return { available: false, reason: 'chưa có thư mục tasks/ trong PROJECT_OUTPUT_DIR', items: [] };
  }
  const items = [];
  for (const task of fs.readdirSync(tasksDir)) {
    const report = path.join(tasksDir, task, 'reports', 'flaky-triage.md');
    if (fs.existsSync(report)) items.push({ task, path: report });
  }
  return { available: true, reason: '', items };
}

// --- Non-functional: best-effort đọc perf-report.json + security-report.json per-task ---
function findNonFunctional() {
  let projectOutputDir;
  try {
    projectOutputDir = resolveFromRepo(getProjectOutputDir());
  } catch (err) {
    return { available: false, items: [] };
  }
  const tasksDir = path.join(projectOutputDir, 'tasks');
  if (!fs.existsSync(tasksDir)) return { available: false, items: [] };
  const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } };
  const items = [];
  for (const task of fs.readdirSync(tasksDir)) {
    const perf = readJson(path.join(tasksDir, task, 'reports', 'perf-report.json'));
    const sec = readJson(path.join(tasksDir, task, 'reports', 'security-report.json'));
    const load = readJson(path.join(tasksDir, task, 'reports', 'load-report.json'));
    if (!perf && !sec && !load) continue;
    const perfChecks = perf ? perf.screens.flatMap((s) => s.checks || []).concat(perf.api || []) : [];
    const secChecks = sec ? sec.checks || [] : [];
    items.push({
      task,
      perfFail: perfChecks.filter((c) => c.v === 'FAIL').length,
      perfWarn: perfChecks.filter((c) => c.v === 'WARN').length,
      secFail: secChecks.filter((c) => c.verdict === 'FAIL').length,
      secFindings: sec ? (sec.findings || []).length : 0,
      loadFail: load ? (load.thresholds || []).filter((t) => !t.ok).length : 0,
      hasPerf: !!perf,
      hasSec: !!sec,
      hasLoad: !!load,
    });
  }
  return { available: true, items };
}

// ---------- render (SAPP Academy Design System) ----------

function statusChip(kind, label) {
  return `<span class="chip chip-${kind}">${esc(label)}</span>`;
}

function dataTable(headers, rows, emptyMsg) {
  if (!rows.length) return `<p class="empty">${esc(emptyMsg)}</p>`;
  const head = headers
    .map((h) => `<th${h.num ? ' class="num"' : ''}>${esc(h.label || h)}</th>`)
    .join('');
  const body = rows
    .map((cells) => `<tr>${cells.map((c) => (typeof c === 'object' ? `<td class="num">${c.v}</td>` : `<td>${c}</td>`)).join('')}</tr>`)
    .join('');
  return `<div class="tablewrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function render({ coverage, moduleRisk, flaky, nonFunctional, metrics, generatedAt, logo, branding }) {
  const b = branding;
  const c = branding.colors;
  const totalBugs = moduleRisk.reduce((n, r) => n + r.bugs, 0);
  const totalFails = moduleRisk.reduce((n, r) => n + r.fails, 0);

  // KPI tiles
  const tiles = [
    { n: coverage.length, label: 'Task có snapshot' },
    { n: moduleRisk.length, label: 'Module' },
    { n: totalBugs, label: 'Bug đã confirm', accent: totalBugs ? 'danger' : null },
    { n: flaky.available ? flaky.items.length : '—', label: 'Task có flaky triage' },
  ];
  const tilesHtml = tiles
    .map(
      (t) =>
        `<div class="tile${t.accent ? ' tile-' + t.accent : ''}"><div class="tile-n">${esc(t.n)}</div><div class="tile-l">${esc(t.label)}</div></div>`,
    )
    .join('');

  // Coverage rows
  const coverageRows = coverage.map((snap) => {
    const s = sumModules(snap);
    const rate =
      snap.unassisted_pass_rate != null
        ? Math.round(Number(snap.unassisted_pass_rate) * 100)
        : s.total
          ? Math.round((s.pass / s.total) * 100)
          : null;
    const rateHtml =
      rate == null
        ? '—'
        : `<span class="rate"><span class="rate-bar"><i style="width:${rate}%"></i></span><b>${rate}%</b></span>`;
    return [
      `<b>${esc(snap.task_key)}</b>`,
      esc(snap.date || '—'),
      esc(snap.phase || '—'),
      { v: s.total },
      { v: statusChip('pass', s.pass) },
      { v: s.fail ? statusChip('fail', s.fail) : `<span class="muted">0</span>` },
      { v: s.skip || `<span class="muted">0</span>` },
      { v: rateHtml },
    ];
  });

  // Risk-by-module horizontal magnitude bars (single hue = gold; magnitude = bug count,
  // fallback fail count). Single series → no legend; status shown as labelled chips.
  const riskMetricIsBugs = totalBugs > 0;
  const maxMetric = Math.max(1, ...moduleRisk.map((r) => (riskMetricIsBugs ? r.bugs : r.fails)));
  const riskHtml = moduleRisk.length
    ? `<div class="bars">${moduleRisk
        .map((r) => {
          const metric = riskMetricIsBugs ? r.bugs : r.fails;
          const pct = Math.round((metric / maxMetric) * 100);
          return `<div class="barrow">
              <div class="bar-label">${esc(r.module)}</div>
              <div class="bar-track"><i style="width:${pct}%"></i></div>
              <div class="bar-meta">${r.bugs ? statusChip('fail', r.bugs + ' bug') : ''}${r.fails ? `<span class="muted">${r.fails} fail</span>` : ''}${!r.bugs && !r.fails ? '<span class="muted">sạch</span>' : ''}</div>
            </div>`;
        })
        .join('')}</div>`
    : `<p class="empty">Chưa có bug/fail nào trong knowledge/.</p>`;

  // Flaky
  const nfHtml = (nonFunctional && nonFunctional.available && nonFunctional.items.length)
    ? dataTable(
        ['Task', { label: 'Perf FAIL', num: true }, { label: 'Perf WARN', num: true }, { label: 'Security FAIL', num: true }, { label: 'Exposure finding', num: true }, { label: 'Load FAIL', num: true }],
        nonFunctional.items.map((it) => [
          `<b>${esc(it.task)}</b>`,
          { v: it.hasPerf ? (it.perfFail ? `<span class="bad">${it.perfFail}</span>` : '0') : '—' },
          { v: it.hasPerf ? it.perfWarn : '—' },
          { v: it.hasSec ? (it.secFail ? `<span class="bad">${it.secFail}</span>` : '0') : '—' },
          { v: it.hasSec ? it.secFindings : '—' },
          { v: it.hasLoad ? (it.loadFail ? `<span class="bad">${it.loadFail}</span>` : '0') : '—' },
        ]),
        'Chưa có perf/security report.',
      )
    : `<p class="empty">Chưa có perf/security report (chạy <code>npm run perf</code> / <code>npm run security</code> per-task).</p>`;

  const flakyHtml = flaky.available
    ? dataTable(
        ['Task', 'Flaky triage report'],
        flaky.items.map((it) => [`<b>${esc(it.task)}</b>`, `<code>${esc(it.path)}</code>`]),
        'Không tìm thấy flaky-triage.md nào.',
      )
    : `<p class="empty">Flaky trend chưa có: ${esc(flaky.reason)}.</p>`;

  const logoChip = logo ? `<span class="logo-chip"><img src="${logo}" alt="${esc(b.brandName)}"></span>` : '';

  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>QA Automation Dashboard — SAPP Academy</title>
<style>
@import url('${b.fontImport}');
:root{
  --gold:${c.gold}; --gold-600:${c.gold600}; --gold-800:${c.gold800}; --gold-wash:${c.goldWash};
  --ink:${c.ink}; --wash:${c.wash}; --card:${c.card};
  --b-subtle:${c.bSubtle}; --b-soft:${c.bSoft};
  --t1:${c.t1}; --t2:${c.t2}; --t3:${c.t3};
  --pass-bg:${c.passBg}; --pass-fg:${c.passFg};
  --fail-bg:${c.failBg}; --fail-fg:${c.failFg};
}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:${b.fontFamily};-webkit-font-smoothing:antialiased;
  background:var(--wash);color:var(--t1);padding:28px;line-height:1.4}
.page{max-width:1120px;margin:0 auto}

/* Header — dark ink band + gold corner glow (SAPP DS) */
.hero{position:relative;overflow:hidden;background:var(--ink);border-radius:24px;padding:30px 34px;color:#fff;
  box-shadow:0 16px 40px rgba(26,25,22,.16);margin-bottom:22px}
.hero::before{content:'';position:absolute;inset:0;
  background:radial-gradient(115% 85% at 100% 0%, rgba(255,183,0,.30), rgba(255,183,0,0) 55%)}
.hero::after{content:'';position:absolute;left:-40px;bottom:-70px;width:200px;height:200px;
  background:radial-gradient(circle, rgba(255,183,0,.12), rgba(255,183,0,0) 70%)}
.hero>*{position:relative;z-index:1}
.eyebrow{font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--gold)}
.hero h1{font-size:34px;font-weight:800;letter-spacing:-.02em;margin-top:10px}
.accent{display:block;width:46px;height:4px;background:var(--gold);border-radius:999px;margin-top:14px}
.hero .gen{margin-top:14px;color:#C9C2B5;font-size:13px;font-weight:500}
.logo-chip{position:absolute;top:28px;right:30px;z-index:2;background:#fff;border-radius:12px;padding:8px 12px;
  display:inline-flex;box-shadow:0 8px 22px rgba(0,0,0,.28)}
.logo-chip img{height:30px;display:block}

/* KPI tiles */
.tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:26px}
.tile{background:var(--card);border:1px solid var(--b-subtle);border-radius:16px;padding:20px 22px;
  box-shadow:0 2px 6px rgba(26,25,22,.06);border-top:3px solid var(--gold)}
.tile-danger{border-top-color:var(--fail-fg)}
.tile-n{font-size:34px;font-weight:800;letter-spacing:-.02em;color:var(--t1)}
.tile-l{font-size:12.5px;font-weight:600;color:var(--t3);margin-top:2px}

/* Sections */
section{background:var(--card);border:1px solid var(--b-subtle);border-radius:16px;padding:22px 24px;
  box-shadow:0 2px 6px rgba(26,25,22,.06);margin-bottom:20px}
.sec-eyebrow{font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--t3);
  margin-bottom:16px;display:flex;align-items:center;gap:9px}
.sec-eyebrow::before{content:'';width:16px;height:3px;border-radius:999px;background:var(--gold)}

/* Table */
.tablewrap{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:14px}
th,td{padding:10px 14px;text-align:left;border-bottom:1px solid var(--b-soft)}
th{font-size:11.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--t3);
  background:var(--wash)}
th:first-child{border-top-left-radius:10px}th:last-child{border-top-right-radius:10px}
tbody tr:last-child td{border-bottom:none}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
td b{font-weight:700;color:var(--t1)}
  .bad{color:var(--fail-fg);font-weight:700}
.muted{color:var(--t3)}

/* Status chips (reserved status palette + label, never color-alone) */
.chip{display:inline-block;font-size:12px;font-weight:800;padding:3px 10px;border-radius:999px;line-height:1.3}
.chip-pass{background:var(--pass-bg);color:var(--pass-fg)}
.chip-fail{background:var(--fail-bg);color:var(--fail-fg)}

/* Unassisted pass rate mini-meter */
.rate{display:inline-flex;align-items:center;gap:8px;justify-content:flex-end}
.rate-bar{width:64px;height:6px;border-radius:999px;background:var(--b-soft);overflow:hidden;display:inline-block}
.rate-bar i{display:block;height:100%;background:var(--gold);border-radius:999px}
.rate b{font-weight:700;font-variant-numeric:tabular-nums}

/* Risk-by-module bars (single hue = magnitude) */
.bars{display:flex;flex-direction:column;gap:12px}
.barrow{display:grid;grid-template-columns:180px 1fr 130px;align-items:center;gap:14px}
.bar-label{font-size:14px;font-weight:600;color:var(--t1)}
.bar-track{height:14px;border-radius:999px;background:var(--b-soft);overflow:hidden}
.bar-track i{display:block;height:100%;border-radius:999px;
  background:linear-gradient(90deg,var(--gold),var(--gold-600))}
.bar-meta{display:flex;align-items:center;gap:8px;justify-content:flex-end;font-size:12.5px;font-weight:600}

.empty{color:var(--t3);font-style:italic}
code{font-family:Consolas,monospace;font-size:12px;color:var(--t2);word-break:break-all}
.foot{color:var(--t3);font-size:12px;text-align:center;margin-top:8px}
@media (max-width:760px){.tiles{grid-template-columns:repeat(2,1fr)}.barrow{grid-template-columns:120px 1fr}.bar-meta{display:none}}
</style>
</head>
<body>
<div class="page">
  <header class="hero">
    ${logoChip}
    <div class="eyebrow">${esc(b.eyebrow)}</div>
    <h1>QA Automation Dashboard</h1>
    <span class="accent"></span>
    <div class="gen">Sinh từ dữ liệu có sẵn trong <code style="color:#EFE9DD">knowledge/</code> · ${esc(generatedAt)}</div>
  </header>

  <div class="tiles">${tilesHtml}</div>

  <section>
    <div class="sec-eyebrow">Coverage theo task (snapshot mới nhất)</div>
    ${dataTable(
      [
        'Task', 'Ngày', 'Phase',
        { label: 'Total', num: true }, { label: 'Pass', num: true }, { label: 'Fail', num: true },
        { label: 'Skip', num: true }, { label: 'Unassisted pass rate', num: true },
      ],
      coverageRows,
      'Chưa có dữ liệu — chạy task Phase 2 để tích luỹ knowledge/historical_execution/.',
    )}
  </section>

  <section>
    <div class="sec-eyebrow">Risk theo module ${riskMetricIsBugs ? '(thanh = số bug đã confirm)' : '(thanh = số fail)'}</div>
    ${riskHtml}
  </section>

  <section>
    <div class="sec-eyebrow">Flaky trend</div>
    ${flakyHtml}
  </section>

  <section>
    <div class="sec-eyebrow">Non-functional (Performance / Security — advisory)</div>
    ${nfHtml}
  </section>

  <section>
    <div class="sec-eyebrow">Reliability &amp; KPI (F10/F11 — đầy dần theo run)</div>
    ${(() => {
      if (!metrics || !metrics.runCount) return '<p class="empty">Chưa có dữ liệu run — chạy test rồi <code>npm run metrics:collect</code> + <code>npm run reliability</code> để tích luỹ (knowledge/metrics/).</p>';
      const r = metrics.latestRun || {};
      const rel = metrics.reliability || {};
      return `<p>Run gần nhất (${esc(r.label || '')}, ${esc(r.at || '')}): <b>${r.passed || 0}</b> pass · <b>${r.failed || 0}</b> fail · <b>${r.flaky || 0}</b> flaky · pass-rate <b>${r.passRate == null ? 'n/a' : r.passRate}</b> · ${r.durationSec || 0}s. Tổng <b>${metrics.runCount}</b> run ghi nhận.</p>`
        + (rel.total ? `<p>Reliability: <b>${rel.total}</b> test · <b>${rel.quarantine || 0}</b> quarantine${rel.rankDist ? ` · rank ${esc(rel.rankDist)}` : ''}.</p>` : '<p class="empty">Reliability index chưa có — cần ≥vài run để tính TRI (npm run reliability).</p>');
    })()}
  </section>

  <div class="foot">${esc(b.brandName)} — ${esc(b.motto)}</div>
</div>
</body>
</html>
`;
}

function readMetrics() {
  const dir = path.join(KNOWLEDGE_DIR, 'metrics');
  let latestRun = null; let runCount = 0; let reliability = null;
  try {
    const lines = fs.readFileSync(path.join(dir, 'runs.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean);
    runCount = lines.length;
    if (lines.length) latestRun = JSON.parse(lines[lines.length - 1]);
  } catch (e) { /* chưa có metrics */ }
  try {
    const rel = JSON.parse(fs.readFileSync(path.join(dir, 'reliability-index.json'), 'utf8'));
    const tests = rel.tests || [];
    const dist = {};
    tests.forEach((t) => { dist[t.rank] = (dist[t.rank] || 0) + 1; });
    reliability = { total: tests.length, quarantine: tests.filter((t) => t.quarantine).length, rankDist: Object.entries(dist).map(([k, v]) => `${k}:${v}`).join(' ') };
  } catch (e) { /* chưa có reliability index */ }
  return { latestRun, runCount, reliability };
}

function main() {
  const historical = readJsonDir(path.join(KNOWLEDGE_DIR, 'historical_execution'));
  const bugs = readJsonDir(path.join(KNOWLEDGE_DIR, 'bugs'));
  const coverage = buildCoverage(historical);
  const moduleRisk = buildModuleRisk(bugs, coverage);
  const flaky = findFlakyReports();
  const nonFunctional = findNonFunctional();
  const metrics = readMetrics();
  const branding = loadBranding();

  const html = render({
    coverage,
    moduleRisk,
    flaky,
    nonFunctional,
    metrics,
    branding,
    logo: loadLogo(branding.logoPath),
    generatedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
  });

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, html, 'utf8');

  console.log(`[dashboard] Đã tạo: ${OUT_FILE}`);
  console.log(
    `[dashboard] ${coverage.length} task snapshot · ${moduleRisk.length} module · ${bugs.length} bug` +
      (flaky.available ? ` · ${flaky.items.length} flaky triage` : ' · flaky: n/a'),
  );
  if (!coverage.length && !bugs.length) {
    console.log('[dashboard] Chưa có learning data — dashboard render trạng thái rỗng (không lỗi).');
  }
}

main();
