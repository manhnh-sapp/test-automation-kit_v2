#!/usr/bin/env node
'use strict';

/*
 * Risk Scorer — Risk-Based Testing CÓ THỰC THI (Suggest-only).
 * Đọc knowledge/{bugs,historical_execution} (+ requirements/git-impact.md nếu có) + .agent/config/risk_model.json
 * → chấm Risk = Likelihood × Impact per module → reports/risk-register.{md,json}.
 *
 * CHỐNG COLD-START (knowledge rỗng là MẶC ĐỊNH): Likelihood có prior = Impact và blend theo lượng data.
 *   L = confidence*observed + (1-confidence)*prior   (floor 1). confidence=0 (chưa data) → L=prior=Impact
 *   → band ở dự án mới do IMPACT dẫn (module tiền/bảo mật vẫn High), rồi sắc lại khi bug/historical tích luỹ.
 *
 * Suggest-only: chỉ sinh register, KHÔNG đổi scope, KHÔNG PASS/FAIL. QA review + override band (band_override
 * + override_reason trong risk-register.json). depthPolicy trong risk_model.json là nguồn duy nhất cho gate.
 *
 * Dùng: TASK_ENV=profiles/<TASK>/task.env node scripts/qa/risk_score.js [--out <dir>] [--task-output <dir>]
 */

const fs = require('fs');
const path = require('path');
const rc = require(path.resolve(__dirname, '..', 'utils', 'runtime_config'));

const DEFAULT_MODEL = JSON.parse(fs.readFileSync(path.join(rc.REPO_ROOT, '.agent', 'config', 'risk_model.example.json'), 'utf8'));

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

function loadModel() {
  try {
    const o = JSON.parse(fs.readFileSync(path.join(rc.REPO_ROOT, '.agent', 'config', 'risk_model.json'), 'utf8'));
    return { ...DEFAULT_MODEL, ...o,
      impact: { ...DEFAULT_MODEL.impact, ...(o.impact || {}) },
      likelihood: { ...DEFAULT_MODEL.likelihood, ...(o.likelihood || {}) },
      bands: { ...DEFAULT_MODEL.bands, ...(o.bands || {}) },
      depthPolicy: { ...DEFAULT_MODEL.depthPolicy, ...(o.depthPolicy || {}) },
    };
  } catch (e) { return DEFAULT_MODEL; }
}

function readJsonDir(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
    .map((f) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { return null; } })
    .filter(Boolean);
}

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

function taskOutputDir() {
  const explicit = arg('task-output');
  if (explicit) return explicit;
  try { return rc.getTaskOutputDir(); } catch (e) { return null; }
}

function main() {
  const model = loadModel();
  const KNOW = path.join(rc.REPO_ROOT, 'knowledge');
  const bugs = readJsonDir(path.join(KNOW, 'bugs'));
  const hist = readJsonDir(path.join(KNOW, 'historical_execution'));

  const tod = taskOutputDir();
  const OUT = path.resolve(arg('out', tod ? path.join(tod, 'reports') : path.join(process.cwd(), 'reports')));
  fs.mkdirSync(OUT, { recursive: true });

  // git-impact.md (optional): lấy tên module ở cột "Module" của bảng markdown.
  const impactModulesTouched = new Set();
  if (tod) {
    const gi = path.join(tod, 'requirements', 'git-impact.md');
    if (fs.existsSync(gi)) {
      for (const line of fs.readFileSync(gi, 'utf8').split(/\r?\n/)) {
        const m = line.split('|').map((s) => s.trim());
        if (m.length >= 4 && m[2] && !/^-+$/.test(m[2]) && m[2] !== 'Module') impactModulesTouched.add(m[2]);
      }
    }
  }

  // Gom tín hiệu per module.
  const modules = new Map();
  const ensure = (name) => { if (!modules.has(name)) modules.set(name, { module: name, bugCount: 0, fail: 0, total: 0, tags: new Set() }); return modules.get(name); };
  for (const m of Object.keys(model.impact.modules || {})) ensure(m);        // module đã khai (cold-start có giá trị)
  for (const b of bugs) { if (b.module) { const e = ensure(b.module); e.bugCount++; (b.tags || []).forEach((t) => e.tags.add(String(t).toLowerCase())); } }
  for (const h of hist) for (const [mod, v] of Object.entries(h.modules || {})) { const e = ensure(mod); e.fail += Number(v.fail || 0); e.total += Number(v.total || 0); }
  for (const m of impactModulesTouched) ensure(m);

  const impactOf = (e) => {
    if (model.impact.modules && model.impact.modules[e.module] != null) return { v: model.impact.modules[e.module], known: true, src: 'config.module' };
    let tw = 0; for (const t of e.tags) if (model.impact.tagWeights[t] != null) tw = Math.max(tw, model.impact.tagWeights[t]);
    if (tw > 0) return { v: tw, known: true, src: 'config.tag' };
    return { v: model.impact.default, known: false, src: 'default' };
  };

  const rows = [];
  for (const e of modules.values()) {
    const imp = impactOf(e);
    const I = imp.v;
    const failRate = e.total > 0 ? e.fail / e.total : 0;
    const observed = clamp(model.likelihood.bugWeight * Math.min(5, e.bugCount) + model.likelihood.failRateWeight * (failRate * 5), 0, 5);
    const signals = e.bugCount + e.total;
    const confidence = clamp(signals / (model.likelihood.confidenceFull || 5), 0, 1);
    const prior = model.likelihood.prior === 'impact' ? I : Number(model.likelihood.prior);
    const L = clamp(Math.round(confidence * observed + (1 - confidence) * prior), 1, 5);
    const risk = L * I;
    const coldStart = signals === 0;
    let band;
    if (!imp.known && coldStart) band = 'UNKNOWN';
    else band = risk >= model.bands.High ? 'High' : risk >= model.bands.Medium ? 'Medium' : 'Low';
    rows.push({
      module: e.module, impact: I, likelihood: L, risk, band,
      cold_start: coldStart,
      drivers: { bugCount: e.bugCount, failRate: Math.round(failRate * 100) / 100, impactSource: imp.src, confidence: Math.round(confidence * 100) / 100 },
      band_override: null, override_reason: null, gate_waiver: null,
    });
  }
  const order = { High: 0, UNKNOWN: 1, Medium: 2, Low: 3 };
  rows.sort((a, b) => (order[a.band] - order[b.band]) || (b.risk - a.risk));

  const register = {
    generatedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
    note: 'Suggest-only. QA review + override band (band_override + override_reason). Cold-start (confidence 0) → band từ Impact; UNKNOWN nếu chưa khai Impact & chưa có data.',
    depthPolicyRef: '.agent/config/risk_model.json (depthPolicy) — nguồn duy nhất cho density; risk_gate.js đọc chính nó.',
    executeOrder: rows.map((r) => r.module),
    modules: rows,
  };
  fs.writeFileSync(path.join(OUT, 'risk-register.json'), JSON.stringify(register, null, 2), 'utf8');

  const L = ['# Risk Register (Risk-Based Testing)', '',
    `> ${register.generatedAt} · Suggest-only — QA chốt/override band. depthPolicy: xem risk_model.json.`,
    '> Cold-start (chưa có bug/historical) → band do **Impact** dẫn; sắc lại khi learning data tích luỹ.',
    '> Thứ tự execute (High trước): ' + (register.executeOrder.join(' → ') || '(trống)'), '',
    '| Module | Impact | Likelihood | Risk | Band | Cold-start | Drivers (bug/failRate/src, conf) | QA override |',
    '|---|---|---|---|---|---|---|---|'];
  for (const r of rows) L.push(`| ${r.module} | ${r.impact} | ${r.likelihood} | ${r.risk} | ${r.band} | ${r.cold_start ? 'yes' : ''} | ${r.drivers.bugCount}/${r.drivers.failRate}/${r.drivers.impactSource}, c=${r.drivers.confidence} | |`);
  L.push('', '> QA: sửa `band_override` + `override_reason` trong `risk-register.json` nếu không đồng ý; `gate_waiver` để miễn gate cho module có lý do.');
  fs.writeFileSync(path.join(OUT, 'risk-register.md'), L.join('\n'), 'utf8');

  const high = rows.filter((r) => r.band === 'High').length;
  const unk = rows.filter((r) => r.band === 'UNKNOWN').length;
  console.log(`[risk] Đã tạo: ${path.join(OUT, 'risk-register.md')}`);
  console.log(`[risk] ${rows.length} module · ${high} High · ${unk} UNKNOWN (${bugs.length} bug, ${hist.length} snapshot làm dữ liệu)`);
  if (!bugs.length && !hist.length) console.log('[risk] Cold-start: chưa có learning data → band từ Impact/config. QA xác nhận band trước khi bật gate --enforce.');
}

main();
