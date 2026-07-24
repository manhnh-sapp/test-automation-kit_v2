'use strict';

/*
 * test_context.js (#4 architecture hardening) — THIN glue: gom các mảnh đã có thành 1 execution context
 * cho automation standalone (JS) — thay vì mỗi script tự wire runtime + evidence + cleanup + metadata.
 *
 * CỐ Ý MỎNG (bundle, KHÔNG phải framework OOP bắt buộc): trả plain object; spec/agent dùng hay không tuỳ ý,
 * không ép rigidity. api/factories vẫn per-spec (Playwright request-bound, tầng TS tests/support/setup) —
 * context này lo phần JS-resolvable (runtime paths, evidence recorder, cleanup callbacks, metadata trace).
 *
 * Dùng:
 *   const { createTestContext } = require('<repo>/scripts/utils/test_context');
 *   const ctx = createTestContext({ taskKey:'SAPP-XXXX', tcId:'OPS_ORD_TC_021' }); // đọc env nếu thiếu opts
 *   const rec = ctx.evidence();                    // EvidenceRecorder (lazy, đúng task/run)
 *   ctx.onCleanup(async () => api.delete(id), 'order:'+id);
 *   ...
 *   await ctx.runCleanup();                         // chạy cleanup LIFO, trả list lỗi (best-effort)
 */

const rc = require('./runtime_config');
const { EvidenceRecorder } = require('./evidence_recorder');

/**
 * @param {{ taskKey?, task?, projectOutputDir?, runId?, tcId?, requirementId?, xrayKey? }} [opts]
 * @returns execution context (plain object)
 */
function createTestContext(opts = {}) {
  const taskKey = rc.getTaskKey(opts);                          // opts.task/taskKey hoặc env; throw nếu thiếu
  const projectOutputDir = rc.getProjectOutputDir(opts.projectOutputDir);
  const runId = rc.getRunId(opts.runId);                        // '' nếu không có
  const taskOutputDir = rc.getTaskOutputDir({ projectOutputDir, taskKey });

  const cleanups = [];
  let evidence = null;

  return {
    taskKey,
    runId,
    projectOutputDir,
    taskOutputDir,
    repoRoot: rc.REPO_ROOT,
    metadata: {
      tcId: opts.tcId || '',
      requirementId: opts.requirementId || '',
      xrayKey: opts.xrayKey || '',
    },

    /** EvidenceRecorder lazy (đúng task/run) — mọi case/step evidence + status/manifest qua đây. */
    evidence() {
      if (!evidence) evidence = new EvidenceRecorder({ taskKey, projectOutputDir, runId, repoRoot: rc.REPO_ROOT });
      return evidence;
    },

    /** Đăng ký cleanup (cho automation standalone JS). label giúp truy vết khi lỗi. */
    onCleanup(fn, label = '') {
      if (typeof fn === 'function') cleanups.push({ fn, label });
    },

    /** Chạy cleanup LIFO, best-effort (không ném) → trả list lỗi. */
    async runCleanup() {
      const errs = [];
      for (const c of cleanups.reverse()) {
        try { await c.fn(); } catch (e) { errs.push(`${c.label || 'cleanup'}: ${e.message}`); }
      }
      cleanups.length = 0;
      return errs;
    },
  };
}

module.exports = { createTestContext };
