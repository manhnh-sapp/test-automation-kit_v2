#!/usr/bin/env node
'use strict';

/*
 * select_tests.js (F9) — Intelligent Test Selection từ git diff.
 * Từ thay đổi giữa <base>..HEAD → chọn tập test cần chạy (scope run manual/nightly/local nhanh hơn).
 *
 * Phân loại (bảo thủ — thà chạy thừa còn hơn sót):
 *   - Đổi support/fixture/playwright.config → ẢNH HƯỞNG DIỆN RỘNG → chạy TẤT CẢ (in: tests).
 *   - Đổi spec test cụ thể → chạy ĐÚNG các spec đó (targeted).
 *   - Chỉ đổi kit/scripts/docs (không đụng tests/) → chạy @smoke (an toàn tối thiểu, nhanh).
 *   - Không đổi gì liên quan → @smoke.
 * Ưu tiên High: nếu risk-register có (khi chạy trong task) — hiện in gợi ý, chưa auto-lọc.
 *
 * LƯU Ý wiring: PR KHÔNG chạy UAT test (rule bảo mật — không secret trên PR/fork). F9 dùng để
 * scope run manual/nightly/local, KHÔNG phải PR-gate chạy UAT.
 *
 * Dùng: node scripts/qa/select_tests.js [--base origin/main]
 *   In log + dòng cuối `PLAYWRIGHT_ARGS: <args>` để CI/script bắt: ARGS=$(... | sed -n 's/^PLAYWRIGHT_ARGS: //p')
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const rc = require(path.resolve(__dirname, '..', 'utils', 'runtime_config'));

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };
const BASE = arg('base', process.env.SELECT_BASE || 'origin/main');

function changedFiles() {
  const tryCmds = [`git diff --name-only ${BASE}...HEAD`, `git diff --name-only ${BASE}`, 'git diff --name-only HEAD~1'];
  for (const cmd of tryCmds) {
    try {
      const out = execSync(cmd, { cwd: rc.REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const files = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      if (files.length) return { files, cmd };
    } catch (e) { /* thử cmd kế */ }
  }
  return { files: [], cmd: '(không diff được)' };
}

const { files, cmd } = changedFiles();
const norm = files.map((f) => f.replace(/\\/g, '/'));

const isSpec = (f) => /^tests\/.*\.spec\.[jt]s$/.test(f);
const isBroad = (f) => /^tests\/(.*\/)?(support|fixtures)\//.test(f) || /(^|\/)playwright\.config\.[cm]?js$/.test(f);

const specChanged = norm.filter((f) => isSpec(f) && fs.existsSync(path.join(rc.REPO_ROOT, f)));
const broadChanged = norm.some(isBroad);
const anyTestsTouched = norm.some((f) => f.startsWith('tests/'));

let args; let reason;
if (broadChanged) { args = 'tests'; reason = 'đổi support/fixture/config → ảnh hưởng rộng → chạy TẤT CẢ'; }
else if (specChanged.length) { args = specChanged.join(' '); reason = `đổi ${specChanged.length} spec → chạy đúng các spec đó`; }
else if (!anyTestsTouched) { args = '--grep @smoke'; reason = 'chỉ đổi kit/scripts/docs (không đụng tests/) → chạy @smoke'; }
else { args = '--grep @smoke'; reason = 'đổi tests/ nhưng không phải spec cụ thể → @smoke'; }

console.log(`[select] base=${BASE} · diff: ${cmd}`);
console.log(`[select] ${norm.length} file đổi · spec đổi: ${specChanged.length} · broad: ${broadChanged}`);
console.log(`[select] → ${reason}`);
console.log(`PLAYWRIGHT_ARGS: ${args}`);
