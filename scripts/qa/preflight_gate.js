#!/usr/bin/env node
'use strict';

/*
 * preflight_gate.js (G1 — round-3) — CHẶN "miss đọc file / input hỏng" TRƯỚC khi workflow chạy.
 *
 * Vì sao: agent có thể lướt/quên đọc input bắt buộc (project_context, catalog, testcase, config),
 * hoặc config bị malformed → cả phase chạy trên nền sai. Gate này biến "đọc đủ input" thành check
 * THỰC THI, gọi bởi entrypoint/CI (KHÔNG để agent tự nhớ):
 *   - require : file BẮT BUỘC tồn tại — thiếu = CHẶN (miss file).
 *   - parse   : file JSON — tồn tại mà malformed = CHẶN (PARSE_FAILURE).
 *   - recommend: nên có — thiếu = CẢNH BÁO (không chặn).
 *   - phase2 + task: testcase canonical LOCAL phải có trước execute (nếu không = CHẶN).
 *
 * Dùng CLI:
 *   node scripts/qa/preflight_gate.js --mode generic          # CI/static: config integrity
 *   node scripts/qa/preflight_gate.js --mode phase2 --task SAPP-123
 *   thêm --require a,b (bắt buộc thêm) · --allow-missing x,y (hạ xuống cảnh báo) · --qa-approved (bỏ qua có log)
 * Dùng module: const { runPreflight } = require('./preflight_gate'); const { problems, warnings } = runPreflight({ mode, task });
 * Exit: 0 = đạt (hoặc --qa-approved) · 1 = có CHẶN · 2 = lỗi dùng sai.
 */

const fs = require('fs');
const path = require('path');
const rc = require(path.resolve(__dirname, '..', 'utils', 'runtime_config'));

// Manifest input bắt buộc theo mode. Chỉ liệt file TRACKED (CI thấy) để không false-block.
const MANIFEST = {
  generic: {
    require: ['knowledge/index.json', '.agent/config/project_context.md'],
    parse: ['knowledge/index.json', '.agent/config/risk_model.example.json', '.agent/config/dashboard.branding.example.json'],
    recommend: ['.agent/config/risk_model.json'],
  },
  phase1: {
    require: ['.agent/config/project_context.md', 'knowledge/index.json'],
    parse: ['knowledge/index.json', '.agent/config/risk_model.example.json'],
    recommend: ['.agent/config/risk_model.json'],
  },
  phase2: {
    require: ['.agent/config/project_context.md', 'knowledge/index.json'],
    parse: ['knowledge/index.json'],
    recommend: ['.agent/config/risk_model.json'],
    taskTestcase: true,
  },
  publish: {
    require: ['knowledge/index.json'],
    parse: ['knowledge/index.json'],
  },
};

const abs = (p) => path.resolve(rc.REPO_ROOT, p);
const rel = (p) => path.relative(rc.REPO_ROOT, p).replace(/\\/g, '/');

/**
 * Chạy preflight thuần (không exit) → { problems, warnings, mode, task }.
 * @param {object} o { mode, task, extraRequire:[], allowMissing:[], projectOutputDir }
 */
function runPreflight({ mode = 'generic', task = '', extraRequire = [], allowMissing = [], projectOutputDir = process.env.PROJECT_OUTPUT_DIR || '' } = {}) {
  const cfg = MANIFEST[mode];
  if (!cfg) return { error: `mode "${mode}" không hỗ trợ (generic|phase1|phase2|publish)`, problems: [], warnings: [] };
  const problems = [];
  const warnings = [];
  const allow = new Set(allowMissing);

  // 1) require exist
  for (const p of [...(cfg.require || []), ...extraRequire]) {
    if (!fs.existsSync(abs(p))) {
      if (allow.has(p)) warnings.push(`(allow-missing) không thấy: ${p}`);
      else problems.push(`THIẾU input bắt buộc: ${p}`);
    }
  }
  // 2) parse JSON (tồn tại mà malformed = CHẶN)
  for (const p of cfg.parse || []) {
    const a = abs(p);
    if (!fs.existsSync(a)) continue;
    try { JSON.parse(fs.readFileSync(a, 'utf8')); } catch (e) { problems.push(`PARSE_FAILURE: ${p} không phải JSON hợp lệ (${e.message})`); }
  }
  // 3) recommend (thiếu = cảnh báo)
  for (const p of cfg.recommend || []) {
    if (!fs.existsSync(abs(p))) warnings.push(`nên có (không chặn): ${p}`);
  }
  // 4) phase2 + task: testcase canonical LOCAL phải có trước execute.
  if (cfg.taskTestcase && task) {
    if (!projectOutputDir) {
      warnings.push('phase2: chưa set PROJECT_OUTPUT_DIR → không kiểm được testcase canonical local (bỏ qua check này)');
    } else {
      const tcDir = abs(path.join(projectOutputDir, 'tasks', task, 'test-cases'));
      let found = 0;
      for (const d of [path.join(tcDir, 'from-xray'), tcDir]) {
        try { found += fs.readdirSync(d).filter((f) => /\.xlsx$/i.test(f)).length; } catch (e) { /* dir chưa có */ }
      }
      if (!found) problems.push(`phase2: KHÔNG thấy testcase canonical local ở ${rel(tcDir)}(/from-xray) — Phase 2 phải kéo Xray hoặc có Excel TRƯỚC execute`);
    }
  }
  return { problems, warnings, mode, task };
}

function main() {
  const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };
  const has = (n) => process.argv.includes(`--${n}`);
  const csv = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

  const mode = arg('mode', 'generic');
  const task = arg('task', process.env.TASK_KEY || '');
  const QA_APPROVED = has('qa-approved');

  const res = runPreflight({ mode, task, extraRequire: csv(arg('require', '')), allowMissing: csv(arg('allow-missing', '')) });
  if (res.error) { console.error(`[preflight] ${res.error}`); process.exit(2); }
  const { problems, warnings } = res;

  console.log(`[preflight] mode=${mode}${task ? ` · task=${task}` : ''} · ${problems.length} CHẶN · ${warnings.length} cảnh báo.`);
  if (warnings.length) { console.log('\n[preflight] ⚠ Cảnh báo:'); warnings.forEach((w) => console.log(`  ~ ${w}`)); }
  if (!problems.length) { console.log('\n[preflight] ✓ ĐẠT — input bắt buộc đủ & config parse được.'); process.exit(0); }

  console.log('\n[preflight] ✗ VI PHẠM (input bắt buộc thiếu/hỏng — ĐỌC/SỬA rồi chạy lại, đừng bắt đầu workflow):');
  problems.forEach((p) => console.log(`  - ${p}`));
  if (QA_APPROVED) { console.log('\n[preflight] [--qa-approved] cố ý bỏ qua → exit 0 (đã log vi phạm).'); process.exit(0); }
  console.log('\n[preflight] BLOCK.');
  process.exit(1);
}

module.exports = { runPreflight, MANIFEST };

if (require.main === module) main();
