#!/usr/bin/env node
'use strict';

/*
 * PostToolUse hook (Write|Edit): mỗi khi agent GHI 1 testcase-status.json hoặc
 * test-cases/*.md, TỰ CHẠY output_gate lên đúng file đó. Vi phạm CHẶN → trả JSON
 * decision=block để feedback về agent tự sửa (RULE_GLOBAL). Đây là lớp harness
 * (bắt cả khi agent bỏ qua script convert/push); gate ở tầng script vẫn là chính.
 *
 * Đọc hook JSON trên stdin: { tool_input: { file_path } }. Không phải file liên quan → exit 0 im lặng.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function emit(obj) { process.stdout.write(JSON.stringify(obj)); process.exit(0); }

let raw = '';
try { raw = fs.readFileSync(0, 'utf8'); } catch (e) { /* no stdin */ }
let data = {};
try { data = JSON.parse(raw || '{}'); } catch (e) { process.exit(0); }

const fp = (data.tool_input && (data.tool_input.file_path || data.tool_input.path)) || '';
if (!fp) process.exit(0);
const norm = String(fp).replace(/\\/g, '/');

let args = null;
if (/testcase-status\.json$/i.test(norm)) args = ['--mode', 'test-execution', '--status', fp];
else if (/\/test-cases\/[^/]+\.md$/i.test(norm)) args = ['--mode', 'gen-testcase', '--file', fp];
if (!args) process.exit(0);           // không phải artifact cần gate
if (!fs.existsSync(fp)) process.exit(0);

const gate = path.resolve(__dirname, '..', 'output_gate.js');
try {
  execFileSync(process.execPath, [gate, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  process.exit(0); // gate PASS (gen-testcase: cảnh báo ";" KHÔNG làm exit≠0)
} catch (e) {
  const out = `${(e.stdout || '').toString()}${(e.stderr || '').toString()}`.trim();
  emit({
    decision: 'block',
    reason: `[output_gate] Vi phạm chất lượng ở ${path.basename(fp)} — SỬA cho đúng RULE_GLOBAL rồi tiếp tục (đừng push/convert kèm vi phạm):\n${out}`,
    suppressOutput: true,
  });
}
