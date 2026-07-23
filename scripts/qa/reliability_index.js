#!/usr/bin/env node
'use strict';

/*
 * reliability_index.js (F10) — Test Reliability Index (TRI) per-testcase + flaky quarantine.
 * Đọc knowledge/metrics/tc-history.jsonl (do metrics_collect tích luỹ mỗi run) → gộp per-TC:
 *   TRI       = pass sạch (passed, không retry) / tổng lần chạy
 *   flakyRate = số lần flaky (retry rồi mới pass) / tổng
 *   Rank      = S(≥0.99) · A(≥0.97) · B(≥0.90) · C(≥0.75) · D(<0.75)  (cần ≥minRuns mới xếp; ít hơn = NEW)
 *   Quarantine = rank D HOẶC flakyRate > flakyThreshold → tách khỏi gate chính, gắn owner theo dõi.
 * Ra: knowledge/metrics/reliability-index.{md,json} (+ quarantine list). Nguồn cho dashboard.
 *
 * Dùng: node scripts/qa/reliability_index.js [--in <tc-history.jsonl>] [--min-runs 3] [--flaky-threshold 0.1]
 */

const fs = require('fs');
const path = require('path');
const rc = require(path.resolve(__dirname, '..', 'utils', 'runtime_config'));

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };
const IN = path.resolve(arg('in', path.join(rc.REPO_ROOT, 'knowledge', 'metrics', 'tc-history.jsonl')));
const OUT = path.resolve(arg('out', path.join(rc.REPO_ROOT, 'knowledge', 'metrics')));
const MIN_RUNS = parseInt(arg('min-runs', '3'), 10);
const FLAKY_TH = parseFloat(arg('flaky-threshold', '0.1'));

function rankOf(tri) {
  if (tri >= 0.99) return 'S';
  if (tri >= 0.97) return 'A';
  if (tri >= 0.90) return 'B';
  if (tri >= 0.75) return 'C';
  return 'D';
}

if (!fs.existsSync(IN)) {
  console.log(`[reliability] Chưa có ${path.relative(rc.REPO_ROOT, IN)} — chạy test + metrics_collect để tích luỹ trước. (0 TC)`);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'reliability-index.json'), JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 19).replace('T', ' '), note: 'Chưa có dữ liệu tc-history.', tests: [] }, null, 2), 'utf8');
  process.exit(0);
}

const recs = fs.readFileSync(IN, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
const byKey = new Map();
for (const r of recs) {
  const g = byKey.get(r.key) || { key: r.key, file: r.file, title: r.title, total: 0, cleanPass: 0, flaky: 0, fail: 0, lastAt: '' };
  g.total++;
  const st = String(r.status || '');
  if (r.flaky) g.flaky++;
  else if (st === 'passed') g.cleanPass++;
  if (st === 'failed' || st === 'timedOut' || st === 'interrupted') g.fail++;
  if (r.at > g.lastAt) g.lastAt = r.at;
  g.file = r.file || g.file; g.title = r.title || g.title;
  byKey.set(r.key, g);
}

const tests = [...byKey.values()].map((g) => {
  const tri = g.total ? Math.round((g.cleanPass / g.total) * 1000) / 1000 : 0;
  const flakyRate = g.total ? Math.round((g.flaky / g.total) * 1000) / 1000 : 0;
  const enough = g.total >= MIN_RUNS;
  const rank = enough ? rankOf(tri) : 'NEW';
  const quarantine = enough && (rank === 'D' || flakyRate > FLAKY_TH);
  return { key: g.key, file: g.file, title: g.title, runs: g.total, tri, flakyRate, rank, quarantine, lastAt: g.lastAt };
}).sort((a, b) => (a.quarantine === b.quarantine ? a.tri - b.tri : (a.quarantine ? -1 : 1)));

const generatedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
const quarantined = tests.filter((t) => t.quarantine);
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'reliability-index.json'), JSON.stringify({ generatedAt, minRuns: MIN_RUNS, flakyThreshold: FLAKY_TH, tests }, null, 2), 'utf8');
fs.writeFileSync(path.join(OUT, 'quarantine.json'), JSON.stringify({ generatedAt, tests: quarantined.map((t) => ({ key: t.key, tri: t.tri, flakyRate: t.flakyRate, rank: t.rank, owner: null })) }, null, 2), 'utf8');

const L = ['# Test Reliability Index (TRI) — F10', '',
  `> ${generatedAt} · ${tests.length} test · quarantine ${quarantined.length} · minRuns=${MIN_RUNS} flakyTh=${FLAKY_TH}`,
  '> TRI = pass sạch / tổng run · Rank S≥0.99 A≥0.97 B≥0.90 C≥0.75 D<0.75 (NEW = chưa đủ run).', '',
  '| Test | Runs | TRI | Flaky | Rank | Quarantine |', '|---|---|---|---|---|---|'];
for (const t of tests) L.push(`| ${t.title || t.key} | ${t.runs} | ${t.tri} | ${t.flakyRate} | ${t.rank} | ${t.quarantine ? '⚠️ YES' : ''} |`);
if (quarantined.length) { L.push('', '## Quarantine (tách khỏi gate chính — gắn owner)'); for (const t of quarantined) L.push(`- ${t.title || t.key} — TRI ${t.tri}, flaky ${t.flakyRate}, rank ${t.rank}`); }
fs.writeFileSync(path.join(OUT, 'reliability-index.md'), L.join('\n'), 'utf8');

console.log(`[reliability] ${tests.length} test · ${quarantined.length} quarantine · từ ${recs.length} record → knowledge/metrics/reliability-index.md`);
if (quarantined.length) for (const t of quarantined) console.log(`  QUARANTINE: ${t.title || t.key} (TRI ${t.tri}, flaky ${t.flakyRate})`);
