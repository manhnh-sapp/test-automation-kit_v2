#!/usr/bin/env node
'use strict';

/*
 * Load check — wrapper MỎNG cho k6 (Loại B: load/stress/soak nhiều VU). Loại A (single-user) dùng perf_check.js.
 *
 * k6 KHÔNG phải npm dependency — là binary ngoài (cài choco/brew/apt/Docker). Script này chỉ orchestrate:
 * chạy k6 → parse summary JSON → reports/load-report.{md,json} → dashboard. Giữ Node-thuần: thiếu k6 → SKIP sạch.
 *
 * AN TOÀN (load test tạo TẢI THẬT — có thể làm nghẽn/sập chính UAT):
 *   - never-auto: PHẢI có --confirm-nonprod (hoặc LOAD_CHECK_CONFIRM=1). Không có → từ chối.
 *   - CHẶN prod: target trông giống prod → từ chối (không có cờ nào mở prod).
 *   - Cap khiêm tốn mặc định (--vus 5 --duration 30s); tăng có chủ đích. Đừng chạy tải lớn trên UAT dùng chung.
 *
 * Dùng:
 *   TASK_ENV=profiles/<TASK>/task.env node scripts/qa/load_check.js --script tests/load/example.load.js --confirm-nonprod
 *   [--base <url>] [--vus 5] [--duration 30s] [--docker] [--enforce] [--out <dir>]
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const rc = require(path.resolve(__dirname, '..', 'utils', 'runtime_config'));

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && (process.argv[i + 1] === undefined || String(process.argv[i + 1]).startsWith('--'))) return true;
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const SCRIPT = arg('script');
const CONFIRM = arg('confirm-nonprod', false) === true || process.env.LOAD_CHECK_CONFIRM === '1';
const USE_DOCKER = arg('docker', false) === true;
const ENFORCE = arg('enforce', false) === true;
const VUS = String(arg('vus', '5'));
const DURATION = String(arg('duration', '30s'));
const BASE = arg('base', process.env.LOAD_BASE_URL || process.env.OPS_BASE_URL || process.env.LMS_BASE_URL || '');

function tod() { try { return rc.getTaskOutputDir(); } catch (e) { return null; } }
const OUT = path.resolve(arg('out', tod() ? path.join(tod(), 'reports') : path.join(process.cwd(), 'reports')));

// --- Guards ---
if (!SCRIPT || !fs.existsSync(SCRIPT)) {
  console.error(`ERROR: cần --script <k6.js>. Không tồn tại: ${SCRIPT}\n(Template: tests/load/example.load.js)`);
  process.exit(2);
}
if (!CONFIRM) {
  console.error(
    '[load] TỪ CHỐI chạy: load test tạo TẢI THẬT, có thể làm nghẽn/sập môi trường.\n' +
      'Xác nhận target NON-PROD + được phép + không đụng ai đang dùng UAT chung, rồi chạy lại với\n' +
      '--confirm-nonprod (hoặc LOAD_CHECK_CONFIRM=1). TUYỆT ĐỐI không chạy trên production.',
  );
  process.exit(3);
}
if (/prod/i.test(BASE) && !/(uat|dev|stag|test|local)/i.test(BASE)) {
  console.error(`[load] TỪ CHỐI: target trông giống PRODUCTION (${BASE}). Load test chỉ chạy trên non-prod.`);
  process.exit(3);
}

// --- Detect k6 (binary ngoài) → thiếu thì SKIP sạch, KHÔNG fail ---
function hasK6() {
  try { const r = spawnSync('k6', ['version'], { encoding: 'utf8' }); return r.status === 0; } catch (e) { return false; }
}
function hasDocker() {
  try { const r = spawnSync('docker', ['version'], { encoding: 'utf8' }); return r.status === 0; } catch (e) { return false; }
}

const summaryPath = path.join(OUT, 'k6-summary.json');
fs.mkdirSync(OUT, { recursive: true });

let runner = null;
if (!USE_DOCKER && hasK6()) runner = 'k6';
else if (USE_DOCKER || hasDocker()) runner = 'docker';

if (!runner) {
  console.warn(
    '[load] k6 CHƯA cài (và không có Docker) → BỎ QUA (không phải FAIL).\n' +
      'Cài k6: choco install k6 | brew install k6 | apt (xk6) — hoặc chạy với --docker (grafana/k6).\n' +
      'Loại B (load nhiều VU) là opt-in tool ngoài; Loại A single-user vẫn chạy được qua `npm run perf`.',
  );
  process.exit(0);
}

// --- Chạy k6 ---
const k6Args = ['run', '--summary-export', summaryPath, '--vus', VUS, '--duration', DURATION, '-e', `BASE_URL=${BASE}`, SCRIPT];
console.log(`[load] runner=${runner} · vus=${VUS} duration=${DURATION} · target=${BASE || '(script tự định)'}`);
let res;
if (runner === 'k6') {
  res = spawnSync('k6', k6Args, { stdio: 'inherit', encoding: 'utf8' });
} else {
  // Docker: mount cwd, chạy grafana/k6. summary path phải trong volume mount.
  const dArgs = ['run', '--rm', '-i', '-v', `${process.cwd()}:/work`, '-w', '/work', 'grafana/k6',
    'run', '--summary-export', path.relative(process.cwd(), summaryPath).replace(/\\/g, '/'),
    '--vus', VUS, '--duration', DURATION, '-e', `BASE_URL=${BASE}`, path.relative(process.cwd(), SCRIPT).replace(/\\/g, '/')];
  res = spawnSync('docker', dArgs, { stdio: 'inherit', encoding: 'utf8' });
}

// --- Parse summary → report ---
let report = { source: SCRIPT, base: BASE, generatedAt: new Date().toISOString().slice(0, 19).replace('T', ' '), vus: VUS, duration: DURATION, runner, metrics: {}, thresholds: [], k6ExitStatus: res.status };
try {
  const s = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  const m = s.metrics || {};
  const pick = (name, keys) => { const o = m[name] || {}; const out = {}; for (const k of keys) if (o[k] != null) out[k] = Math.round(o[k] * 100) / 100; return out; };
  report.metrics = {
    http_req_duration: pick('http_req_duration', ['avg', 'p(95)', 'p(99)', 'max']),
    http_reqs: pick('http_reqs', ['count', 'rate']),
    http_req_failed: pick('http_req_failed', ['rate', 'value']),
    iterations: pick('iterations', ['count', 'rate']),
    vus_max: pick('vus_max', ['value', 'max']),
  };
  for (const [name, obj] of Object.entries(m)) {
    if (obj && obj.thresholds) for (const [th, v] of Object.entries(obj.thresholds)) report.thresholds.push({ metric: name, threshold: th, ok: v.ok !== false });
  }
} catch (e) {
  report.parseError = e.message;
}

fs.writeFileSync(path.join(OUT, 'load-report.json'), JSON.stringify(report, null, 2), 'utf8');
const failed = report.thresholds.filter((t) => !t.ok);
const L = ['# Load Report (k6)', '',
  `> ${report.generatedAt} · runner ${runner} · VU ${VUS} · ${DURATION} · target ${BASE || '(script)'}`,
  '> Loại B (load/stress). Ngưỡng từ NFR khai trong k6 `thresholds`. Non-prod, never-auto.', '',
  '## Metrics', '```json', JSON.stringify(report.metrics, null, 2), '```', '',
  '## Thresholds (từ NFR)'];
if (!report.thresholds.length) L.push('- (script chưa khai threshold — thêm block `thresholds` theo NFR để ra verdict)');
else { L.push('| Metric | Threshold | Verdict |', '|---|---|---|'); for (const t of report.thresholds) L.push(`| ${t.metric} | ${t.threshold} | ${t.ok ? 'PASS' : 'FAIL'} |`); }
if (report.parseError) L.push('', `> Lưu ý: không parse được summary (${report.parseError}).`);
fs.writeFileSync(path.join(OUT, 'load-report.md'), L.join('\n'), 'utf8');

console.log(`[load] Đã tạo: ${path.join(OUT, 'load-report.md')} · ${report.thresholds.length} threshold, ${failed.length} FAIL`);
if (ENFORCE && failed.length) { console.error(`[load] ENFORCE: threshold breach (${failed.length}).`); process.exit(1); }
process.exit(0);
