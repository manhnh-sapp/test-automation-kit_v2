'use strict';

/*
 * cleanup_manifest.js (P1 — Persistent Cleanup Manifest, giải quyết orphan test data).
 * cleanupRegistry (tests/support/setup) chỉ cleanup TRONG process → CI killed / worker crash / reboot =
 * data mồ côi. Manifest này GHI BỀN mọi entity test đã tạo theo RUN_ID vào .cleanup/<runId>.json →
 * lần chạy sau / job scheduled gọi reconcile() dọn RUN_ID mồ côi.
 *   record(runId, {type,id,endpoint}) → append.
 *   listOrphans({ttlMinutes}) → RUN chưa cleaned + quá tuổi.
 *   reconcile(runId, deleteFn) → gọi deleteFn(entity) LIFO (app-specific, chạm hệ thật) → markCleaned nếu OK.
 * .cleanup/ = dữ liệu run (không secret nhưng transient) → gitignore. Dependency-free.
 */

const fs = require('fs');
const path = require('path');
const rc = require(path.resolve(__dirname, '..', 'runtime_config'));

const CLEANUP_DIR = path.join(rc.REPO_ROOT, '.cleanup');
const safe = (k) => String(k || 'default').replace(/[^\w.-]+/g, '_');
const runFile = (runId) => path.join(CLEANUP_DIR, `${safe(runId)}.json`);

function writeAtomic(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}
function load(runId) { try { return JSON.parse(fs.readFileSync(runFile(runId), 'utf8')); } catch (e) { return null; } }

/** Ghi 1 entity đã tạo (để reconcile sau nếu process chết). entity = {type, id, endpoint?}. */
function record(runId, entity) {
  if (!runId) throw new Error('cleanup_manifest.record cần runId');
  const rec = load(runId) || { runId: String(runId), startedAt: Date.now(), cleaned: false, entities: [] };
  rec.entities.push({ ...entity, at: Date.now() });
  writeAtomic(runFile(runId), rec);
  return rec.entities.length;
}

/** RUN mồ côi = chưa cleaned + startedAt quá ttlMinutes. */
function listOrphans({ ttlMinutes = 60 } = {}) {
  const out = [];
  try {
    for (const f of fs.readdirSync(CLEANUP_DIR)) {
      if (!f.endsWith('.json')) continue;
      try {
        const rec = JSON.parse(fs.readFileSync(path.join(CLEANUP_DIR, f), 'utf8'));
        if (!rec.cleaned && rec.startedAt && (Date.now() - Number(rec.startedAt)) > ttlMinutes * 60000) out.push(rec);
      } catch (e) { /* skip */ }
    }
  } catch (e) { /* no dir */ }
  return out;
}

function markCleaned(runId) {
  const rec = load(runId);
  if (!rec) return false;
  rec.cleaned = true; rec.cleanedAt = Date.now();
  writeAtomic(runFile(runId), rec);
  return true;
}

/**
 * Dọn 1 RUN: gọi deleteFn(entity) LIFO (deleteFn app-specific — hit API/hệ thật). Best-effort;
 * markCleaned nếu KHÔNG lỗi. Trả {ok, count, errors}.
 */
async function reconcile(runId, deleteFn) {
  const rec = load(runId);
  if (!rec) return { ok: false, reason: 'no-record', count: 0, errors: [] };
  if (typeof deleteFn !== 'function') throw new Error('reconcile cần deleteFn(entity)');
  const errors = [];
  for (const e of [...rec.entities].reverse()) {
    try { await deleteFn(e); } catch (err) { errors.push(`${e.type || 'entity'}:${e.id} — ${err.message}`); }
  }
  if (!errors.length) markCleaned(runId);
  return { ok: errors.length === 0, count: rec.entities.length, errors };
}

/** Xoá file RUN đã cleaned & cũ (dọn rác manifest). */
function purge({ olderThanMinutes = 1440 } = {}) {
  let n = 0;
  try {
    for (const f of fs.readdirSync(CLEANUP_DIR)) {
      if (!f.endsWith('.json')) continue;
      try {
        const rec = JSON.parse(fs.readFileSync(path.join(CLEANUP_DIR, f), 'utf8'));
        if (rec.cleaned && rec.cleanedAt && (Date.now() - Number(rec.cleanedAt)) > olderThanMinutes * 60000) { fs.unlinkSync(path.join(CLEANUP_DIR, f)); n++; }
      } catch (e) { /* skip */ }
    }
  } catch (e) { /* no dir */ }
  return n;
}

module.exports = { CLEANUP_DIR, runFile, record, load, listOrphans, markCleaned, reconcile, purge };
