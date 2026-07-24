#!/usr/bin/env node
'use strict';

/*
 * quality_decision.js (P2 — Quality Decision Engine, capstone). Gộp tín hiệu chất lượng → 1 quyết định
 * phát hành: GO / GO_WITH_RISK / NEEDS_REVIEW / NO_GO / BLOCKED.
 *   Signals: gateStatus (GateEngine.aggregate) · coveragePct · riskHighGaps · quarantine (reliability) ·
 *            openBugs (defect) · securityHigh · blocked (capability).
 * decide() thuần (offline-test). fromTask() đọc artifact task best-effort → signals → decide.
 * Ngưỡng mặc định QA chỉnh được. OFFLINE. CLI: --task <KEY>.
 */

const fs = require('fs');
const path = require('path');
const rc = require(path.resolve(__dirname, '..', 'utils', 'runtime_config'));

const DECISION = { GO: 'GO', GO_WITH_RISK: 'GO_WITH_RISK', NEEDS_REVIEW: 'NEEDS_REVIEW', NO_GO: 'NO_GO', BLOCKED: 'BLOCKED' };
const DEFAULT_THRESHOLDS = { coverageNoGo: 80, coverageReview: 95 };

/**
 * Quyết định thuần từ signals. Ưu tiên nặng→nhẹ: BLOCKED > NO_GO > GO_WITH_RISK > NEEDS_REVIEW > GO.
 * @param {{gateStatus?:'PASS'|'WARN'|'FAIL', coveragePct?:number|null, riskHighGaps?:number, quarantine?:number, openBugs?:number, securityHigh?:number, blocked?:boolean}} s
 * @param {{coverageNoGo?:number, coverageReview?:number}} [th]
 */
function decide(s = {}, th = {}) {
  const T = { ...DEFAULT_THRESHOLDS, ...th };
  const reasons = [];
  if (s.blocked) return { decision: DECISION.BLOCKED, reasons: ['Còn capability/setup blocker chưa gỡ (BLOCKED_SETUP)'] };

  let noGo = false; let risk = false; let review = false;
  if (s.gateStatus === 'FAIL') { noGo = true; reasons.push('Gate CHẶN chưa sạch (preflight/design/output)'); }
  if ((s.securityHigh || 0) > 0) { noGo = true; reasons.push(`${s.securityHigh} lỗ hổng security high/critical`); }
  if ((s.riskHighGaps || 0) > 0) { noGo = true; reasons.push(`${s.riskHighGaps} High/Critical risk gap còn mở`); }
  if (s.coveragePct != null && s.coveragePct < T.coverageNoGo) { noGo = true; reasons.push(`Coverage ${s.coveragePct}% < ${T.coverageNoGo}%`); }
  else if (s.coveragePct != null && s.coveragePct < T.coverageReview) { review = true; reasons.push(`Coverage ${s.coveragePct}% (${T.coverageNoGo}–${T.coverageReview}%)`); }
  if ((s.openBugs || 0) > 0) { risk = true; reasons.push(`${s.openBugs} product bug còn mở`); }
  if ((s.quarantine || 0) > 0) { risk = true; reasons.push(`${s.quarantine} test quarantine (flaky/kém tin cậy)`); }
  if (s.gateStatus === 'WARN') { review = true; reasons.push('Gate còn cảnh báo (tautology/attestation/self-review)'); }

  const decision = noGo ? DECISION.NO_GO : (risk ? DECISION.GO_WITH_RISK : (review ? DECISION.NEEDS_REVIEW : DECISION.GO));
  if (!reasons.length) reasons.push('Mọi tín hiệu đạt ngưỡng.');
  return { decision, reasons };
}

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };

/** Đọc artifact task → signals (best-effort; signal thiếu = bỏ qua/null). */
function fromTask(taskDir, extra = {}) {
  const signals = { ...extra };
  const missing = [];

  // reliability → quarantine
  const rel = readJson(path.join(taskDir, 'knowledge', 'metrics', 'reliability-index.json')) || readJson(path.join(rc.REPO_ROOT, 'knowledge', 'metrics', 'reliability-index.json'));
  if (rel && Array.isArray(rel.tests)) signals.quarantine = rel.tests.filter((t) => t.quarantine).length;
  else if (signals.quarantine == null) missing.push('reliability-index (quarantine)');

  // risk-register → High/Critical gap (best-effort: đếm module band High/Critical có cờ gap/verdict CRITICAL)
  const risk = readJson(path.join(taskDir, 'reports', 'risk-register.json'));
  if (risk && Array.isArray(risk.modules)) {
    signals.riskHighGaps = risk.modules.filter((m) => /high|critical/i.test(String(m.band || '')) && (m.gap === true || /critical/i.test(String(m.verdict || '')) || m.gapOpen === true)).length;
  } else if (signals.riskHighGaps == null) missing.push('risk-register (highGaps)');

  // defect → bug-candidates.md (đếm Jira key)
  try {
    const bugMd = fs.readFileSync(path.join(taskDir, 'reports', 'bug-candidates.md'), 'utf8');
    const keys = new Set((bugMd.match(/\b[A-Z][A-Z0-9]+-\d+\b/g) || []));
    if (signals.openBugs == null) signals.openBugs = keys.size;
  } catch (e) { if (signals.openBugs == null) missing.push('bug-candidates (openBugs)'); }

  if (signals.coveragePct == null) missing.push('coverage% (truyền --coverage hoặc parse phase1-summary)');
  if (signals.gateStatus == null) missing.push('gateStatus (chạy self_review/GateEngine, truyền --gate)');

  return { signals, missing };
}

function main() {
  const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };
  const task = arg('task', process.env.TASK_KEY || '');
  const pod = process.env.PROJECT_OUTPUT_DIR || '';
  if (!task || !pod) { console.error('[quality] cần --task <KEY> + PROJECT_OUTPUT_DIR.'); process.exit(2); }
  const taskDir = path.resolve(rc.REPO_ROOT, pod, 'tasks', task);
  const extra = {};
  if (arg('coverage')) extra.coveragePct = Number(arg('coverage'));
  if (arg('gate')) extra.gateStatus = arg('gate');
  const { signals, missing } = fromTask(taskDir, extra);
  const { decision, reasons } = decide(signals);

  console.log(`\n=== QUALITY DECISION — ${task} ===`);
  console.log(`Signals: ${JSON.stringify(signals)}`);
  if (missing.length) console.log(`⚠ Thiếu tín hiệu (bỏ qua): ${missing.join(' · ')}`);
  console.log(`\n➤ DECISION: ${decision}`);
  reasons.forEach((r) => console.log(`  - ${r}`));
  console.log('\n(Ngưỡng QA chỉnh được; tín hiệu thiếu KHÔNG tự đẩy NO_GO — quyết định trên tín hiệu có thật.)');
}

module.exports = { decide, fromTask, DECISION, DEFAULT_THRESHOLDS };

if (require.main === module) main();
