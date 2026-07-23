#!/usr/bin/env node
'use strict';

/*
 * test_inventory_gate.js — Chống "CI false green" (F1).
 *
 * Vấn đề: `playwright test --pass-with-no-tests` khiến 0 test vẫn báo PASSED → CI xanh giả.
 * Gate này chạy TRƯỚC test run: `playwright test --list` để ĐẾM số test, phân 3 trạng thái
 * pre-run tách bạch (kết hợp với kết quả run sau đó cho đủ 5 trạng thái HD1):
 *   - HAS_TESTS(n)   : có ≥1 test  → cho phép run THẬT (KHÔNG dùng --pass-with-no-tests).
 *   - NO_TESTS       : 0 test      → KHÔNG được coi là PASSED. Chỉ qua khi ALLOW_EMPTY=1
 *                                     (suite rỗng hợp lệ, vd chưa promote spec) + report ghi NO_TESTS_EXECUTED.
 *   - INFRA_FAILURE  : --list lỗi (config/playwright hỏng) → exit 2, KHÔNG nhầm thành NO_TESTS.
 * (PASSED/FAILED do chính test run quyết; BLOCKED do setup — không thuộc gate này.)
 *
 * Dùng (đặt PROJECT_OUTPUT_DIR + TASK_KEY như CI):
 *   node scripts/qa/test_inventory_gate.js [-- <playwright filter args>]
 *   ALLOW_EMPTY=1 node scripts/qa/test_inventory_gate.js   # cho phép suite rỗng (ghi NO_TESTS)
 *   --out <file.json>   ghi trạng thái ra JSON cho report/dashboard.
 *
 * Exit: 0 = HAS_TESTS hoặc (NO_TESTS + ALLOW_EMPTY); 1 = NO_TESTS (không cho rỗng); 2 = INFRA_FAILURE.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const ddash = argv.indexOf('--');
const passthrough = ddash >= 0 ? argv.slice(ddash + 1) : [];
const outIdx = argv.indexOf('--out');
const outFile = outIdx >= 0 && argv[outIdx + 1] ? argv[outIdx + 1] : '';
const ALLOW_EMPTY = process.env.ALLOW_EMPTY === '1' || argv.includes('--allow-empty');

function emit(state, count, detail) {
  const rec = { gate: 'test_inventory', state, testCount: count, allowEmpty: ALLOW_EMPTY, detail: detail || '' };
  console.log(`[inventory] ${state}${count != null ? ` · ${count} test` : ''}${detail ? ` · ${detail}` : ''}`);
  if (outFile) { try { fs.mkdirSync(path.dirname(outFile), { recursive: true }); fs.writeFileSync(outFile, JSON.stringify(rec, null, 2)); } catch (e) { /* ignore */ } }
  return rec;
}

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const res = spawnSync(npx, ['playwright', 'test', '--list', ...passthrough], { encoding: 'utf8', shell: process.platform === 'win32' });
const out = `${res.stdout || ''}${res.stderr || ''}`;

// Không chạy được npx/playwright (spawn lỗi) → INFRA.
if (res.error) { emit('INFRA_FAILURE', null, `spawn lỗi: ${res.error.message}`); process.exit(2); }

const noTests = /no tests found/i.test(out);
const totalMatch = out.match(/Total:\s*(\d+)\s*test/i);

if (totalMatch) {
  const n = Number(totalMatch[1]);
  if (n > 0) { emit('HAS_TESTS', n); process.exit(0); }
  // Total: 0 → rỗng
  emit(ALLOW_EMPTY ? 'NO_TESTS' : 'NO_TESTS', 0, ALLOW_EMPTY ? 'ALLOW_EMPTY=1 → cho qua (NO_TESTS_EXECUTED)' : 'chặn (đặt ALLOW_EMPTY=1 nếu rỗng là hợp lệ)');
  process.exit(ALLOW_EMPTY ? 0 : 1);
}

if (noTests) {
  emit('NO_TESTS', 0, ALLOW_EMPTY ? 'ALLOW_EMPTY=1 → cho qua (NO_TESTS_EXECUTED)' : 'chặn (đặt ALLOW_EMPTY=1 nếu rỗng là hợp lệ)');
  process.exit(ALLOW_EMPTY ? 0 : 1);
}

// Exit khác 0 mà không phải "no tests" → hỏng config/playwright.
if (res.status !== 0) { emit('INFRA_FAILURE', null, `playwright --list exit ${res.status}: ${out.trim().split(/\r?\n/).slice(-3).join(' | ').slice(0, 200)}`); process.exit(2); }

// Exit 0 nhưng không parse được "Total:" → coi như bất thường (INFRA) để không nhầm thành pass.
emit('INFRA_FAILURE', null, 'không đọc được số test từ --list (output lạ)');
process.exit(2);
