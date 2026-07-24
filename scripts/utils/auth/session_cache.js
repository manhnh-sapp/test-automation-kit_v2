'use strict';

/*
 * session_cache.js (P1 Auth Strategy — reuse session né throttle/lockout).
 * Lưu Playwright storageState (cookies + origins[].localStorage gồm actToken/refreshToken) vào
 * .auth/<key>.json kèm savedAt → lần sau nếu còn TƯƠI (< TTL, mặc định 25' < token TTL 30') thì SEED lại,
 * KHÔNG login UI lặp (tránh lockout/throttle UAT — xem uat-auth-phase2-constraints).
 *
 * ⚠️ .auth/ = SECRET (token/cookie) → gitignore, không commit. Dependency-free (chỉ fs/path + REPO_ROOT).
 */

const fs = require('fs');
const path = require('path');
const rc = require(path.resolve(__dirname, '..', 'runtime_config'));

const AUTH_DIR = path.join(rc.REPO_ROOT, '.auth');
const safeKey = (k) => String(k || 'default').replace(/[^\w.-]+/g, '_');
function sessionPath(key) { return path.join(AUTH_DIR, `${safeKey(key)}.json`); }

/** Lưu storageState (Playwright) → .auth/<key>.json (atomic tương đối). Trả path. */
function save(key, storageState) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const file = sessionPath(key);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ savedAt: Date.now(), storageState: storageState || { cookies: [], origins: [] } }, null, 2), 'utf8');
  fs.renameSync(tmp, file);
  return file;
}

/** Đọc record {savedAt, storageState} hoặc null. */
function load(key) {
  try { return JSON.parse(fs.readFileSync(sessionPath(key), 'utf8')); } catch (e) { return null; }
}

/** Session còn tươi (< ttlMinutes)? */
function isFresh(key, ttlMinutes = 25) {
  const r = load(key);
  if (!r || !r.savedAt) return false;
  return (Date.now() - Number(r.savedAt)) < ttlMinutes * 60 * 1000;
}

/** Tuổi session (phút) hoặc null. */
function ageMinutes(key) {
  const r = load(key);
  if (!r || !r.savedAt) return null;
  return Math.round((Date.now() - Number(r.savedAt)) / 60000);
}

/** Xoá session (khi login fail / muốn ép login lại). */
function clear(key) { try { fs.unlinkSync(sessionPath(key)); return true; } catch (e) { return false; } }

module.exports = { AUTH_DIR, sessionPath, save, load, isFresh, ageMinutes, clear };
