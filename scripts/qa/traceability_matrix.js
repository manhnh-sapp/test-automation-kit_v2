#!/usr/bin/env node
'use strict';

/*
 * traceability_matrix.js (F8) — sinh ma trận REQ → TC → AUTO → EXEC → BUG dạng artifact.
 * Join các artifact có sẵn của task (không gọi Jira/Xray): dựng bức tranh coverage đầu-cuối,
 * đánh dấu lỗ hổng (TC chưa publish / chưa execute / fail / có bug).
 *
 * Nguồn (trong <TASK_OUTPUT_DIR>):
 *   REQ  = task/story key (context)                     · nhóm theo cột Module của TC
 *   TC   = test-cases/*.md (cột "TC ID" + "Module")
 *   Xray = reports/jira-testcase-publish.json (tcId→issueKey)
 *   AUTO/EXEC = test-results[/runs/<RUN_ID>]/testcase-status.json (tcId→status)  (có status = đã tự động drive)
 *   BUG  = reports/bug-candidates.md (Jira key SAPP-xxxx + TC ref, best-effort)
 *
 * Dùng: TASK_ENV=profiles/<TASK>/task.env node scripts/qa/traceability_matrix.js
 *       hoặc --task-output <dir> | --project-output <dir> --task <KEY>
 * Out: <task>/reports/traceability-matrix.{md,csv}
 */

const fs = require('fs');
const path = require('path');
const rc = require(path.resolve(__dirname, '..', 'utils', 'runtime_config'));

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };
const normId = (s) => String(s || '').trim().toUpperCase();

function taskDir() {
  const explicit = arg('task-output');
  if (explicit) return path.resolve(explicit);
  try { return rc.getTaskOutputDir({ projectOutputDir: arg('project-output'), taskKey: arg('task') }); }
  catch (e) { console.error('[trace] Thiếu task context. Đặt TASK_ENV hoặc --task-output <dir> (hoặc --project-output + --task).'); process.exit(2); }
}

function readJson(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } }

// Parse bảng testcase 9 cột → [{tcId, module}].
function parseTestcases(dir) {
  const rows = [];
  if (!fs.existsSync(dir)) return rows;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md'))) {
    const lines = fs.readFileSync(path.join(dir, f), 'utf8').split(/\r?\n/);
    const hi = lines.findIndex((l) => l.includes('|') && /TC ID/i.test(l) && /Module/i.test(l));
    if (hi < 0) continue;
    const cols = lines[hi].split('|').map((c) => c.trim());
    const tcI = cols.findIndex((c) => /^TC ID$/i.test(c));
    const modI = cols.findIndex((c) => /^Module$/i.test(c));
    for (let i = hi + 1; i < lines.length; i++) {
      const l = lines[i];
      if (!/^\s*\|/.test(l)) { if (l.trim() === '') continue; break; }
      if (/^\s*\|[\s|:-]+\|?\s*$/.test(l)) continue;
      const cells = l.split('|').map((c) => c.trim());
      const tcId = cells[tcI];
      if (!tcId || /^TC ID$/i.test(tcId)) continue;
      rows.push({ tcId: normId(tcId), module: (cells[modI] || '').split('/')[0].trim() || '(none)', file: f });
    }
  }
  return rows;
}

function main() {
  const T = taskDir();
  const taskKey = arg('task') || process.env.TASK_KEY || path.basename(T);
  const RUN_ID = process.env.RUN_ID || arg('run-id') || '';
  const trDir = RUN_ID ? path.join(T, 'test-results', 'runs', RUN_ID) : path.join(T, 'test-results');

  const tcs = parseTestcases(path.join(T, 'test-cases'));
  const pub = readJson(path.join(T, 'reports', 'jira-testcase-publish.json'));
  const xrayByTc = new Map();
  for (const r of (pub && pub.results) || []) if (r.tcId && r.issueKey) xrayByTc.set(normId(r.tcId), r.issueKey);

  const statusDoc = readJson(path.join(trDir, 'testcase-status.json')) || readJson(path.join(T, 'test-results', 'testcase-status.json'));
  const execByTc = new Map();
  for (const t of (statusDoc && (statusDoc.tests || statusDoc.testcases)) || []) if (t.tcId) execByTc.set(normId(t.tcId), String(t.status || '').toUpperCase());

  // BUG best-effort: gom Jira key + TC ref từ bug-candidates.md.
  const bugMd = (() => { try { return fs.readFileSync(path.join(T, 'reports', 'bug-candidates.md'), 'utf8'); } catch (e) { return ''; } })();
  const bugByTc = new Map();
  const bugKeysAll = [...new Set((bugMd.match(/\bSAPP-\d+\b/g) || []))];
  for (const line of bugMd.split(/\r?\n/)) {
    const keys = line.match(/\bSAPP-\d+\b/g) || [];
    const tcRefs = line.match(/\bTC[_-]?\d+\b/gi) || [];
    for (const ref of tcRefs) { const k = normId(ref).replace(/[_-]/g, '_'); for (const bk of keys) (bugByTc.get(k) || bugByTc.set(k, []).get(k)).push(bk); }
  }
  const tcHasBug = (tcId) => {
    for (const [ref, keys] of bugByTc) if (tcId.endsWith(ref) || tcId.includes(ref)) return keys.join(' ');
    return '';
  };

  const rows = tcs.map((tc) => {
    const xray = xrayByTc.get(tc.tcId) || '';
    const exec = execByTc.get(tc.tcId) || '';
    const bug = tcHasBug(tc.tcId);
    const flags = [];
    if (!xray) flags.push('chưa-publish');
    if (!exec) flags.push('chưa-execute');
    if (/FAIL/.test(exec)) flags.push('FAIL');
    return { req: taskKey, module: tc.module, tcId: tc.tcId, xray, auto: exec ? 'yes' : 'no', exec: exec || '—', bug: bug || '—', flags: flags.join(', ') };
  });

  // Ghi CSV + MD.
  fs.mkdirSync(path.join(T, 'reports'), { recursive: true });
  const csv = ['REQ,Module,TC,Xray,AUTO,EXEC,BUG,Flags',
    ...rows.map((r) => [r.req, r.module, r.tcId, r.xray, r.auto, r.exec, (r.bug || '').replace(/,/g, ' '), r.flags].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
  fs.writeFileSync(path.join(T, 'reports', 'traceability-matrix.csv'), csv, 'utf8');

  const published = rows.filter((r) => r.xray).length;
  const executed = rows.filter((r) => r.exec !== '—').length;
  const failed = rows.filter((r) => /FAIL/.test(r.exec)).length;
  const withBug = rows.filter((r) => r.bug !== '—').length;
  const L = ['# Traceability Matrix — ' + taskKey, '',
    `> ${new Date().toISOString().slice(0, 19).replace('T', ' ')} · join REQ→TC→AUTO→EXEC→BUG từ artifact task (không gọi Jira/Xray).`,
    `> TC: ${rows.length} · publish Xray: ${published} · execute: ${executed} · FAIL: ${failed} · có bug: ${withBug} · bug keys: ${bugKeysAll.join(', ') || '—'}`,
    `> Lỗ hổng: ${rows.length - published} TC chưa publish · ${rows.length - executed} TC chưa execute.`, '',
    '| REQ | Module | TC | Xray | AUTO | EXEC | BUG | Flags |', '|---|---|---|---|---|---|---|---|'];
  for (const r of rows) L.push(`| ${r.req} | ${r.module} | ${r.tcId} | ${r.xray || '—'} | ${r.auto} | ${r.exec} | ${r.bug} | ${r.flags} |`);
  fs.writeFileSync(path.join(T, 'reports', 'traceability-matrix.md'), L.join('\n'), 'utf8');

  console.log(`[trace] ${taskKey}: ${rows.length} TC · publish ${published} · execute ${executed} · FAIL ${failed} · bug ${withBug}`);
  console.log(`[trace] → ${path.join(T, 'reports', 'traceability-matrix.md')} (+ .csv)`);
  if (rows.length === 0) console.log('[trace] (0 TC — kiểm test-cases/*.md có bảng 9 cột không).');
}

main();
