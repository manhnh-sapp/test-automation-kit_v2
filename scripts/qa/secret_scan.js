#!/usr/bin/env node
'use strict';

/*
 * secret_scan.js (F7) — quet secret bi commit nham tren cac file DA TRACK trong git.
 * Self-contained (khong can gitleaks/binary ngoai). Pattern high-signal, it false-positive;
 * bo qua file .example/placeholder + binary. CHAN (exit 1) neu thay secret that.
 *
 * Dung: node scripts/qa/secret_scan.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const rc = require(path.resolve(__dirname, '..', 'utils', 'runtime_config'));

const PATTERNS = [
  { name: 'private-key', re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP |DSA )?PRIVATE KEY-----/ },
  { name: 'aws-access-key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'github-token', re: /\bgh[pousr]_[0-9A-Za-z]{36,}\b/ },
  { name: 'slack-token', re: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/ },
  { name: 'google-service-account-key', re: /"private_key"\s*:\s*"-----BEGIN/ },
  { name: 'generic-secret-assign', re: /(?:password|passwd|secret|api[_-]?key|access[_-]?token|client[_-]?secret)\s*[:=]\s*['"][^'"\s]{12,}['"]/i },
];
const SKIP = /(\.example($|\.)|example\.env|\.md$|\.png$|\.jpg$|\.jpeg$|\.webp$|\.gif$|\.pdf$|\.zip$|\.xlsx$|\.ico$|package-lock\.json$)/i;
const PLACEHOLDER = /your[-_]?|<[^>]+>|xxx+|placeholder|example|changeme|process\.env|\$\{?[A-Z_]/i;
const BINARY = /\x00/;

function trackedFiles() {
  try { return execSync('git ls-files', { cwd: rc.REPO_ROOT, encoding: 'utf8' }).split(/\r?\n/).filter(Boolean); }
  catch (e) { console.error('[secret-scan] khong chay duoc git ls-files:', e.message); process.exit(2); }
}

const findings = [];
for (const rel of trackedFiles()) {
  if (SKIP.test(rel)) continue;
  const abs = path.join(rc.REPO_ROOT, rel);
  let content;
  try {
    const st = fs.statSync(abs);
    if (st.size > 2 * 1024 * 1024) continue;
    content = fs.readFileSync(abs, 'utf8');
  } catch (e) { continue; }
  if (BINARY.test(content)) continue;
  content.split(/\r?\n/).forEach((line, i) => {
    for (const p of PATTERNS) {
      const m = p.re.exec(line);
      if (!m) continue;
      if (p.name === 'generic-secret-assign' && PLACEHOLDER.test(line)) continue;
      findings.push({ file: rel, line: i + 1, pattern: p.name, snippet: m[0].slice(0, 6) + '***' });
    }
  });
}

if (!findings.length) { console.log('[secret-scan] OK — khong thay secret bi commit tren file da track.'); process.exit(0); }
console.error('[secret-scan] Nghi co secret bi commit (' + findings.length + '):');
for (const f of findings) console.error('  - ' + f.file + ':' + f.line + ' [' + f.pattern + '] ' + f.snippet);
console.error('  -> Go secret khoi file + rotate key, dua vao .env (da gitignore). KHONG commit secret.');
process.exit(1);
