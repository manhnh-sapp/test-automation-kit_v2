#!/usr/bin/env node
'use strict';

/*
 * Risk Gate — ép Risk-Based Testing: đối chiếu testcase với depthPolicy theo band trong risk-register.
 * Đây là bản EXECUTABLE của "Risk depth (RBT)" trong tc_validator (1 model duy nhất, không phải gate thứ 2).
 *
 * Mặc định SUGGEST-ONLY (chỉ cảnh báo, exit 0). Chỉ CHẶN khi --enforce VÀ có CRITICAL ở band High.
 * BẢO THỦ: nhánh chặn (CRITICAL) chỉ dựa ĐẾM (đáng tin) — module High mà 0 case hoặc < 50% minCount.
 *   Thiếu requiredDimension (heuristic keyword) → WARN, KHÔNG tự chặn. QA có thể miễn qua gate_waiver.
 *
 * Dùng:
 *   TASK_ENV=profiles/<TASK>/task.env node scripts/qa/risk_gate.js            # cảnh báo
 *   TASK_ENV=profiles/<TASK>/task.env node scripts/qa/risk_gate.js --enforce  # chặn (exit≠0) khi CRITICAL High
 */

const fs = require('fs');
const path = require('path');
const rc = require(path.resolve(__dirname, '..', 'utils', 'runtime_config'));
const DEFAULT_MODEL = JSON.parse(fs.readFileSync(path.join(rc.REPO_ROOT, '.agent', 'config', 'risk_model.example.json'), 'utf8'));

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && (process.argv[i + 1] === undefined || String(process.argv[i + 1]).startsWith('--'))) return true;
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const ENFORCE = arg('enforce', false) === true;

function loadModel() {
  try {
    const o = JSON.parse(fs.readFileSync(path.join(rc.REPO_ROOT, '.agent', 'config', 'risk_model.json'), 'utf8'));
    return { ...DEFAULT_MODEL, ...o, depthPolicy: { ...DEFAULT_MODEL.depthPolicy, ...(o.depthPolicy || {}) }, dimensionKeywords: { ...DEFAULT_MODEL.dimensionKeywords, ...(o.dimensionKeywords || {}) } };
  } catch (e) { return DEFAULT_MODEL; }
}

function tod() {
  const e = arg('task-output');
  if (e) return e;
  try { return rc.getTaskOutputDir(); } catch (err) { return null; }
}

const norm = (s) => String(s || '').toLowerCase().replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();

// Đọc testcase markdown → đếm TC per group (phần trước "/" ở cột Module) + dimension keyword.
function parseTestcases(dir, dimKw) {
  const groups = new Map();
  if (!fs.existsSync(dir)) return groups;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md'))) {
    const lines = fs.readFileSync(path.join(dir, f), 'utf8').split(/\r?\n/);
    let modIdx = -1;
    for (const line of lines) {
      if (!line.trim().startsWith('|')) { if (modIdx !== -1 && !line.trim()) modIdx = -1; continue; }
      const cells = line.split('|').slice(1, -1).map((c) => c.trim());
      if (modIdx === -1) {
        const idx = cells.findIndex((c) => /(^|\b)module\b/i.test(c) || c === 'Module');
        const hasTc = cells.some((c) => /tc\s*id/i.test(c));
        if (idx >= 0 && hasTc) modIdx = idx; // header row
        continue;
      }
      if (cells.every((c) => /^-+:?$/.test(c) || c === '')) continue; // separator
      const modCell = cells[modIdx] || '';
      if (!modCell || /tc\s*id/i.test(modCell)) continue;
      const group = modCell.split('/')[0].trim();
      if (!group) continue;
      const g = groups.get(group) || { group, count: 0, dims: new Set() };
      g.count++;
      const rowText = line.toLowerCase();
      for (const [dim, kws] of Object.entries(dimKw)) if (kws.some((k) => rowText.includes(String(k).toLowerCase()))) g.dims.add(dim);
      groups.set(group, g);
    }
  }
  return groups;
}

function main() {
  const model = loadModel();
  const t = tod();
  const regPath = arg('register', t ? path.join(t, 'reports', 'risk-register.json') : null);
  if (!regPath || !fs.existsSync(regPath)) {
    console.error(`[risk-gate] PARSE_FAILURE: không thấy risk-register.json (${regPath}). Chạy \`npm run risk\` trước.`);
    process.exit(2);
  }
  let register;
  try { register = JSON.parse(fs.readFileSync(regPath, 'utf8')); }
  catch (e) { console.error(`[risk-gate] PARSE_FAILURE: risk-register.json hỏng (${e.message}). Sinh lại bằng \`npm run risk\`.`); process.exit(2); }
  const tcDir = arg('testcases', t ? path.join(t, 'test-cases') : null);
  const groups = parseTestcases(tcDir, model.dimensionKeywords);

  const findings = [];
  for (const m of register.modules || []) {
    const band = m.band_override || m.band;
    const policy = model.depthPolicy[band] || model.depthPolicy.UNKNOWN;
    // match register module ↔ testcase group (normalized includes 2 chiều)
    let count = 0; const dims = new Set();
    for (const g of groups.values()) {
      if (norm(g.group).includes(norm(m.module)) || norm(m.module).includes(norm(g.group))) {
        count += g.count; g.dims.forEach((d) => dims.add(d));
      }
    }
    const missingDims = (policy.requiredDimensions || []).filter((d) => !dims.has(d));
    const waived = !!m.gate_waiver;
    let verdict = 'PASS'; const reasons = [];
    // Nhánh CHẶN (bảo thủ, đếm): chỉ High + thiếu nghiêm trọng.
    const criticalShort = count === 0 || count < Math.ceil(policy.minCount * 0.5);
    if (band === 'High' && criticalShort && !waived) { verdict = 'CRITICAL'; reasons.push(`High-risk nhưng chỉ ${count} TC (min ${policy.minCount}) — thiếu nghiêm trọng`); }
    else if (count < policy.minCount) { verdict = 'WARN'; reasons.push(`${count} TC < min ${policy.minCount} theo band ${band}`); }
    if (missingDims.length) { if (verdict === 'PASS') verdict = 'WARN'; reasons.push(`thiếu dimension (heuristic): ${missingDims.join(', ')}`); }
    if (waived && verdict === 'CRITICAL') { verdict = 'WARN'; reasons.push(`(gate_waiver: ${m.gate_waiver})`); }
    findings.push({ module: m.module, band, count, minCount: policy.minCount, dims: [...dims], missingDims, verdict, reasons });
  }

  const L = ['# Risk Gate', '', `> ${new Date().toISOString().slice(0, 19).replace('T', ' ')} · ${ENFORCE ? 'ENFORCE (chặn CRITICAL High)' : 'suggest-only (cảnh báo)'}`,
    '> Bản executable của tc_validator "Risk depth". CRITICAL chỉ dựa đếm (bảo thủ); thiếu dimension = WARN heuristic.', '',
    '| Module | Band | TC | Min | Dimensions | Verdict | Lý do |', '|---|---|---|---|---|---|---|'];
  for (const f of findings) L.push(`| ${f.module} | ${f.band} | ${f.count} | ${f.minCount} | ${f.dims.join(', ') || '—'} | ${f.verdict} | ${f.reasons.join('; ') || ''} |`);
  const OUT = path.resolve(arg('out', t ? path.join(t, 'reports') : process.cwd()));
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'risk-gate.md'), L.join('\n'), 'utf8');

  const critical = findings.filter((f) => f.verdict === 'CRITICAL');
  const warn = findings.filter((f) => f.verdict === 'WARN');
  console.log(`[risk-gate] ${findings.length} module · ${critical.length} CRITICAL · ${warn.length} WARN → ${path.join(OUT, 'risk-gate.md')}`);
  for (const c of critical) console.log(`  CRITICAL: ${c.module} — ${c.reasons.join('; ')}`);
  // Không có testcase để đối chiếu (vd task data không có trong checkout CI) → KHÔNG phán được depth,
  // nên KHÔNG chặn kể cả --enforce (không-phán-được ≠ FAIL). Tránh false-block ở CI.
  if (ENFORCE && critical.length && groups.size === 0) {
    console.log('[risk-gate] NO_TESTCASE_SOURCE: không có testcase để đối chiếu (test-cases/ rỗng — data task không trong checkout) → BỎ QUA enforce (không-phán-được-depth ≠ FAIL). Khác PARSE_FAILURE (register hỏng → chặn).');
    return;
  }
  if (ENFORCE && critical.length) { console.error(`[risk-gate] ENFORCE: chặn (${critical.length} CRITICAL ở band High). Bổ sung TC hoặc đặt gate_waiver + lý do trong risk-register.json.`); process.exit(1); }
  if (!ENFORCE && critical.length) console.log('[risk-gate] (suggest-only — không chặn; chạy --enforce để chặn CI)');
}

main();
