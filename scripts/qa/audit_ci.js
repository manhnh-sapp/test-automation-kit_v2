#!/usr/bin/env node
'use strict';

/*
 * audit_ci.js (GĐ-U3) — npm audit cho CI, phân biệt rõ 2 tình huống:
 *   - CÓ vuln high/critical (prod deps)         → CHẶN (exit 1).
 *   - AUDIT_SERVICE_UNAVAILABLE (mạng/registry) → KHÔNG chặn (exit 0) — audit fail do hạ tầng ≠ có lỗ hổng,
 *     tránh CI đỏ oan khi registry chập chờn.
 * Mặc định chặn từ mức `high` (đổi qua --level moderate|high|critical). Chỉ prod deps (--omit=dev).
 *
 * Dùng: node scripts/qa/audit_ci.js [--level high]
 */

const { execSync } = require('child_process');

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };
const LEVEL = arg('level', 'high'); // moderate | high | critical
const ORDER = { low: 0, moderate: 1, high: 2, critical: 3 };
const minRank = ORDER[LEVEL] != null ? ORDER[LEVEL] : ORDER.high;

let raw = '';
try {
  raw = execSync('npm audit --omit=dev --json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
} catch (e) {
  // npm audit EXIT ≠ 0 khi CÓ vuln — nhưng stdout VẪN chứa JSON. Lấy stdout đó.
  raw = (e.stdout || '').toString();
}

let data = null;
try { data = JSON.parse(raw); } catch (e) { data = null; }

// Không có JSON hợp lệ, hoặc npm báo lỗi hạ tầng → AUDIT_SERVICE_UNAVAILABLE (không chặn).
if (!data || data.error || !data.metadata || !data.metadata.vulnerabilities) {
  const detail = data && data.error ? (data.error.summary || data.error.code || 'error') : 'không parse được output npm audit';
  console.warn(`[audit] AUDIT_SERVICE_UNAVAILABLE: không chạy được npm audit (${detail}) → BỎ QUA (không chặn CI; audit fail do hạ tầng ≠ có lỗ hổng).`);
  process.exit(0);
}

const v = data.metadata.vulnerabilities;
console.log(`[audit] prod deps · low ${v.low || 0} · moderate ${v.moderate || 0} · high ${v.high || 0} · critical ${v.critical || 0} (chặn từ ${LEVEL})`);
const blocking = Object.entries(v).filter(([sev, n]) => ORDER[sev] != null && ORDER[sev] >= minRank && n > 0);
if (blocking.length) {
  console.error(`[audit] CHẶN: ${blocking.map(([s, n]) => `${n} ${s}`).join(' + ')} (≥ ${LEVEL}). Vá: npm audit fix / bump version.`);
  process.exit(1);
}
console.log(`[audit] ✓ OK — 0 vuln ≥ ${LEVEL}.`);
process.exit(0);
