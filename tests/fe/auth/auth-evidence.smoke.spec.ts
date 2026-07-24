import { test, expect } from '@playwright/test';
import { haveOpsCreds } from '../support/opsLogin';
import { ensureOpsAuth } from '../support/auth/opsAuth';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { EvidenceRecorder } = require('../../../scripts/utils/evidence_recorder');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sessionCache = require('../../../scripts/utils/auth/session_cache');

/*
 * INFRA SMOKE (@smoke) — nghiệm thu P1 Auth reuse + #3 Evidence highlight/manifest trên UAT THẬT.
 * Non-destructive: chỉ login + xem trang + chụp; KHÔNG tạo/sửa/xoá dữ liệu. Login 1 LẦN (run2 reuse → né throttle).
 */
test.describe('@smoke Auth reuse + Evidence highlight (infra)', () => {
  test.skip(!haveOpsCreds, 'Thiếu OPS creds → skip (chạy với TASK_ENV=profiles/<TASK>/task.env).');

  test('login+cache rồi reuse (không login lại); EvidenceRecorder highlight capture', async ({ browser }) => {
    const key = 'ops-smoke';
    sessionCache.clear(key);

    // RUN 1: chưa cache → login UI + cache session.
    const ctx1 = await browser.newContext();
    const p1 = await ctx1.newPage();
    const m1 = await ensureOpsAuth(p1, ctx1, { key });
    expect(m1, 'run1 phải là login+cached').toContain('login');
    expect(/\/auth\/login/.test(p1.url()), 'run1 đã đăng nhập (không kẹt /auth/login)').toBeFalsy();
    expect(sessionCache.isFresh(key, 25), 'session đã được cache').toBeTruthy();

    // #3 evidence highlight + settle + capture (dùng chính EvidenceRecorder path).
    const rec = new EvidenceRecorder({ taskKey: 'SAPP-26523', projectOutputDir: process.env.PROJECT_OUTPUT_DIR || 'outputs/lms-operations-automation', repoRoot: process.cwd(), log: false });
    const c = rec.case('AUTH_EV_SMOKE_TC_001');
    const st = await c.step(p1, 'Chụp có highlight (verify capture)', { highlight: p1.locator('body'), status: 'PASSED' });
    expect(st, 'step capture PASSED').toBe('PASSED');
    await c.finish('PASSED');
    rec.write();
    await ctx1.close();

    // RUN 2: cache tươi → REUSE (seed cookies+localStorage), KHÔNG login UI.
    const ctx2 = await browser.newContext();
    const p2 = await ctx2.newPage();
    const m2 = await ensureOpsAuth(p2, ctx2, { key });
    expect(m2, 'run2 phải reuse session').toBe('storage(reuse)');
    expect(/\/auth\/login/.test(p2.url()), 'run2 reuse vẫn đã đăng nhập (session seed hợp lệ)').toBeFalsy();
    await ctx2.close();

    sessionCache.clear(key);
  });
});
