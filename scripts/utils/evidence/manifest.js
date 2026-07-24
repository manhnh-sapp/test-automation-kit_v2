'use strict';

/*
 * manifest.js (#3 EvidenceManager — concern Manifest) — INDEX evidence + kiểm file TỒN TẠI.
 * Từ testcase-status.json (hoặc shard testcase-status/<TC>.json do #0 ghi) → liệt kê mọi evidence
 * (case + step) kèm cờ exists. Bịt gap "gate không check evidence tồn tại": gate/QA đọc manifest.missing
 * để bắt case khai evidence nhưng file không có. Ghi evidence-manifest.json cạnh testcase-status.json.
 */

const fs = require('fs');
const path = require('path');
const rc = require(path.resolve(__dirname, '..', 'runtime_config'));

function ts() { try { return new Date().toISOString(); } catch (e) { return ''; } }
const evList = (v) => (Array.isArray(v) ? v : (v ? [v] : [])).map(String).filter(Boolean);

/** Gom tests[] từ testcase-status.json (ưu tiên) hoặc shard testcase-status/<TC>.json. */
function collectTests(testResultsDir) {
  try { const d = JSON.parse(fs.readFileSync(path.join(testResultsDir, 'testcase-status.json'), 'utf8')); if (d.tests && d.tests.length) return d.tests; } catch (e) { /* fallback shard */ }
  const tests = [];
  try {
    for (const f of fs.readdirSync(path.join(testResultsDir, 'testcase-status'))) {
      if (!f.endsWith('.json')) continue;
      try { const s = JSON.parse(fs.readFileSync(path.join(testResultsDir, 'testcase-status', f), 'utf8')); if (s && s.test) tests.push(s.test); } catch (e) { /* skip */ }
    }
  } catch (e) { /* no shard dir */ }
  return tests;
}

/**
 * Dựng evidence manifest + kiểm tồn tại.
 * @param {string} testResultsDir  thư mục chứa testcase-status.json
 * @param {{ repoRoot?: string, write?: boolean }} opts
 * @returns {{ generatedAt, count, missingCount, missing:string[], entries:[] }}
 */
function buildManifest(testResultsDir, { repoRoot = rc.REPO_ROOT, write = true } = {}) {
  const tests = collectTests(testResultsDir);
  const entries = []; const missing = [];
  const check = (files, label) => files.map((f) => {
    const abs = path.isAbsolute(f) ? f : path.join(repoRoot, f);
    const exists = fs.existsSync(abs);
    if (!exists) missing.push(`${label}: ${f}`);
    return { file: f, exists };
  });
  for (const t of tests) {
    const caseEvidence = check(evList(t.evidence), `${t.tcId} (case)`);
    const steps = (Array.isArray(t.steps) ? t.steps : []).map((s, i) => ({
      n: i + 1, status: s.status || '', evidence: check(evList(s.evidence).concat(evList(s.evidences)), `${t.tcId} step${i + 1}`),
    }));
    entries.push({ tcId: t.tcId, status: t.status || '', caseEvidence, steps });
  }
  const manifest = {
    generatedAt: ts(),
    testResultsDir: path.relative(repoRoot, testResultsDir).split(path.sep).join('/'),
    count: entries.length, missingCount: missing.length, missing, entries,
  };
  if (write) { try { fs.writeFileSync(path.join(testResultsDir, 'evidence-manifest.json'), JSON.stringify(manifest, null, 2), 'utf8'); } catch (e) { /* best-effort */ } }
  return manifest;
}

function readManifest(testResultsDir) {
  try { return JSON.parse(fs.readFileSync(path.join(testResultsDir, 'evidence-manifest.json'), 'utf8')); } catch (e) { return null; }
}

module.exports = { buildManifest, readManifest, collectTests };
