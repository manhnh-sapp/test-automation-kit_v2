'use strict';

/*
 * gate_engine.js (#2 architecture hardening) — INTERFACE gate CHUẨN + aggregator.
 *
 * Round-3 đẻ ra nhiều gate (preflight/design/output/risk/inventory...), mỗi cái tự console.log +
 * tự quyết exit → khó gộp "task fail vì gate nào?". GateEngine chuẩn hoá:
 *   GateResult = { gateId, status: PASS|WARN|FAIL|SKIP, severity: P0|P1|P2, findings:[{level,message}], counts }
 * và `aggregate()` gộp → 1 quyết định. Đa số gate đã trả {problems, warnings} → `toResult()` bọc lại;
 * KHÔNG cần sửa lõi gate (CI/hook/bug_reporter vẫn gọi hàm cũ). Engine là lớp GỘP thêm (self_review dùng).
 *
 * @typedef {'PASS'|'WARN'|'FAIL'|'SKIP'} GateStatus
 * @typedef {{ level: 'FAIL'|'WARN', message: string }} Finding
 * @typedef {{ gateId: string, status: GateStatus, severity: 'P0'|'P1'|'P2', findings: Finding[], note: string, counts: {fail:number, warn:number} }} GateResult
 */

const STATUS = { PASS: 'PASS', WARN: 'WARN', FAIL: 'FAIL', SKIP: 'SKIP' };
const SEVERITY = { P0: 'P0', P1: 'P1', P2: 'P2' };

/**
 * Bọc kết quả 1 gate (shape {problems, warnings}) → GateResult chuẩn.
 * @param {string} gateId
 * @param {{ problems?: string[], warnings?: string[], skipped?: boolean, severity?: string, note?: string }} o
 * @returns {GateResult}
 */
function toResult(gateId, { problems = [], warnings = [], skipped = false, severity = SEVERITY.P1, note = '' } = {}) {
  const findings = [
    ...problems.map((m) => ({ level: STATUS.FAIL, message: String(m) })),
    ...warnings.map((m) => ({ level: STATUS.WARN, message: String(m) })),
  ];
  const status = skipped ? STATUS.SKIP : (problems.length ? STATUS.FAIL : (warnings.length ? STATUS.WARN : STATUS.PASS));
  return { gateId, status, severity, findings, note, counts: { fail: problems.length, warn: warnings.length } };
}

/**
 * Gộp nhiều GateResult → quyết định tổng. overall = FAIL nếu có gate FAIL, else WARN nếu có WARN, else PASS.
 * @param {GateResult[]} results
 */
function aggregate(results) {
  const list = (results || []).filter(Boolean);
  const totalFail = list.reduce((s, r) => s + r.counts.fail, 0);
  const totalWarn = list.reduce((s, r) => s + r.counts.warn, 0);
  const status = list.some((r) => r.status === STATUS.FAIL) ? STATUS.FAIL
    : (list.some((r) => r.status === STATUS.WARN) ? STATUS.WARN : STATUS.PASS);
  const blockers = list.filter((r) => r.status === STATUS.FAIL).map((r) => r.gateId);
  return { status, totalFail, totalWarn, blockers, results: list };
}

const MARK = { PASS: '✓ OK', WARN: '⚠ warn', FAIL: '✗ CHẶN', SKIP: '○ n/a' };

/** Format 1 báo cáo checklist người-đọc từ aggregate(). */
function format(agg, { title = 'GATE ENGINE', failHead = 15, warnHead = 8 } = {}) {
  const L = [`\n=== ${title} ===`];
  for (const r of agg.results) {
    L.push(`\n${MARK[r.status] || r.status}  [${r.severity}] ${r.gateId}${r.note ? ` (${r.note})` : ''}`);
    const fails = r.findings.filter((f) => f.level === STATUS.FAIL);
    fails.slice(0, failHead).forEach((f) => L.push(`    - ${f.message}`));
    if (fails.length > failHead) L.push(`    … +${fails.length - failHead} CHẶN nữa`);
    const warns = r.findings.filter((f) => f.level === STATUS.WARN);
    warns.slice(0, warnHead).forEach((f) => L.push(`    ~ ${f.message}`));
    if (warns.length > warnHead) L.push(`    … +${warns.length - warnHead} cảnh báo nữa`);
  }
  L.push(`\n=== Tổng: ${agg.totalFail} CHẶN · ${agg.totalWarn} cảnh báo · overall ${agg.status}${agg.blockers.length ? ` (CHẶN ở: ${agg.blockers.join(', ')})` : ''} ===`);
  return L.join('\n');
}

module.exports = { STATUS, SEVERITY, toResult, aggregate, format };
