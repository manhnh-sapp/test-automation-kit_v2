/**
 * EvidenceRecorder — chuẩn hoá evidence Phase 2 để MỌI case (PASS/FAIL) và MỌI step đều có:
 *   - trạng thái pass/fail theo từng step,
 *   - 1 ảnh evidence highlight vào đúng element được kiểm ở step đó.
 *
 * Ảnh lưu: <projectOutputDir>/tasks/<taskKey>/test-results/artifacts/<TC_ID>/step-NN-<status>.png
 * Ghi ra:  <projectOutputDir>/tasks/<taskKey>/test-results/testcase-status.json
 *   schema đúng với push_test_execution.js:
 *   { taskKey, generatedAt, runId?, tests: [ { tcId, status, comment, evidence:[...], steps:[ {status, comment, evidence:[...]} ] } ] }
 *
 * Cách dùng trong automation task-scoped (standalone Playwright):
 *   const { EvidenceRecorder } = require('<repo>/scripts/utils/evidence_recorder');
 *   const rec = new EvidenceRecorder({ taskKey:'SAPP-XXXX', projectOutputDir:'outputs/lms-operations-automation', runId });
 *   const tc = rec.case('OPS_ORD_TC_021');
 *   await tc.step(page, 'Mở dropdown Hình thức', { highlight: page.getByLabel('Hình thức'),
 *        assert: async () => (await page.getByRole('option').count()) === 2 });   // pass/fail suy từ assert
 *   await tc.step(page, 'Kiểm giá trị', { highlight: locator, status: 'PASSED' });  // hoặc set tay
 *   await tc.finish();            // status tổng = FAILED nếu có step fail, else PASSED
 *   await rec.write();            // ghi testcase-status.json (merge)
 *
 * TODO không cần evidence: đừng gọi step()/case() cho case chưa chạy — chỉ ghi case đã execute.
 */
const fs = require('fs');
const path = require('path');

function pad2(n) { return String(n).padStart(2, '0'); }
function ts() { try { return new Date().toISOString(); } catch { return ''; } }

async function highlight(page, target) {
  if (!target) return null;
  let handle = null;
  try {
    if (typeof target === 'string') handle = await page.$(target);
    else if (typeof target.elementHandle === 'function') handle = await target.first().elementHandle({ timeout: 2000 }).catch(() => null);
    else if (typeof target.evaluate === 'function') handle = target; // đã là ElementHandle
  } catch { handle = null; }
  if (!handle) return null;
  try {
    await page.evaluate((el) => {
      el.__evPrev = { outline: el.style.outline, box: el.style.boxShadow, offset: el.style.outlineOffset };
      el.style.outline = '3px solid #e11d48';
      el.style.outlineOffset = '2px';
      el.style.boxShadow = '0 0 0 4px rgba(225,29,72,.30)';
      el.scrollIntoView({ block: 'center', inline: 'center' });
    }, handle);
  } catch { return null; }
  return handle;
}
async function unhighlight(page, handle) {
  if (!handle) return;
  try { await page.evaluate((el) => { const p = el.__evPrev || {}; el.style.outline = p.outline || ''; el.style.boxShadow = p.box || ''; el.style.outlineOffset = p.offset || ''; }, handle); } catch { /* noop */ }
}

class Case {
  constructor(recorder, tcId) {
    this.rec = recorder;
    this.tcId = tcId;
    this.steps = [];
    this.dir = path.join(recorder.artifactsRoot, tcId);
    fs.mkdirSync(this.dir, { recursive: true });
  }

  /**
   * Chụp evidence 1 step, highlight element cụ thể, đánh dấu pass/fail.
   * opts: { highlight?: Locator|selector|ElementHandle, assert?: ()=>bool|Promise<bool>, status?: 'PASSED'|'FAILED', comment?, mask?: Locator[] }
   */
  async step(page, name, opts = {}) {
    const idx = this.steps.length + 1;
    let status = opts.status;
    let comment = opts.comment || name;
    if (!status && typeof opts.assert === 'function') {
      try { status = (await opts.assert()) ? 'PASSED' : 'FAILED'; }
      catch (e) { status = 'FAILED'; comment = `${name} — lỗi assert: ${e.message}`; }
    }
    if (!status) status = 'PASSED';
    const h = await highlight(page, opts.highlight);
    const file = path.join(this.dir, `step-${pad2(idx)}-${status.toLowerCase()}.png`);
    try {
      await page.screenshot({ path: file, fullPage: true, mask: opts.mask || [], maskColor: '#8a8a8a' });
    } catch (e) {
      try { await page.screenshot({ path: file, mask: opts.mask || [] }); } catch { /* give up */ }
    }
    await unhighlight(page, h);
    const rel = path.relative(this.rec.repoRoot, file).split(path.sep).join('/');
    this.steps.push({ status, comment, evidence: [rel] });
    if (this.rec.log) console.log(`   [step ${idx}] ${status} — ${name} → ${path.basename(file)}`);
    return status;
  }

  /** Kết thúc case: status tổng (mặc định = FAILED nếu có step FAILED). Evidence cấp case = ảnh step lỗi (nếu có) hoặc step cuối. */
  async finish(overallStatus, opts = {}) {
    const anyFail = this.steps.some((s) => s.status === 'FAILED');
    const status = overallStatus || (anyFail ? 'FAILED' : (this.steps.length ? 'PASSED' : 'TODO'));
    const failEv = this.steps.find((s) => s.status === 'FAILED');
    const caseEv = (failEv || this.steps[this.steps.length - 1] || {}).evidence || [];
    this.rec._put({
      tcId: this.tcId,
      status,
      comment: opts.comment || (anyFail ? 'Có step FAILED — xem step evidence' : 'Executed'),
      evidence: caseEv,
      steps: this.steps,
    });
    return status;
  }
}

class EvidenceRecorder {
  constructor({ taskKey, projectOutputDir, runId = '', repoRoot = process.cwd(), log = true } = {}) {
    if (!taskKey || !projectOutputDir) throw new Error('EvidenceRecorder cần taskKey + projectOutputDir');
    this.taskKey = taskKey;
    this.runId = runId;
    this.repoRoot = repoRoot;
    this.log = log;
    this.taskDir = path.join(repoRoot, projectOutputDir, 'tasks', taskKey);
    this.testResults = path.join(this.taskDir, 'test-results');
    this.artifactsRoot = path.join(this.testResults, 'artifacts');
    fs.mkdirSync(this.artifactsRoot, { recursive: true });
    this.statusFile = path.join(this.testResults, 'testcase-status.json');
    this._tests = new Map();
  }
  case(tcId) { return new Case(this, tcId); }
  _put(entry) { this._tests.set(entry.tcId, entry); }

  /** Ghi/merge testcase-status.json (giữ entry cũ của TC không thuộc lần này). */
  write() {
    let existing = { taskKey: this.taskKey, tests: [] };
    try { existing = JSON.parse(fs.readFileSync(this.statusFile, 'utf8')); } catch { /* new */ }
    const byId = new Map((existing.tests || []).map((t) => [t.tcId, t]));
    for (const [id, e] of this._tests) byId.set(id, e);
    const out = { taskKey: this.taskKey, generatedAt: ts(), ...(this.runId ? { runId: this.runId } : {}), tests: [...byId.values()] };
    fs.writeFileSync(this.statusFile, JSON.stringify(out, null, 2), 'utf8');
    if (this.log) console.log(`\nĐã ghi ${this._tests.size} case (kèm step-evidence) → ${path.relative(this.repoRoot, this.statusFile).split(path.sep).join('/')}`);
    return this.statusFile;
  }
}

module.exports = { EvidenceRecorder, highlight, unhighlight };
