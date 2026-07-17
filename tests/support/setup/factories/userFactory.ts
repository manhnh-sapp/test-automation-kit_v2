import { type APIRequestContext } from '@playwright/test';
import { cleanupRegistry } from '../cleanup/cleanupRegistry';
import { testHookClient } from '../hooks/testHookClient';
import { SetupFailure } from '../contracts/preconditionTypes';

export interface CreatedUser {
  id: string;
  [key: string]: unknown;
}

/**
 * Factory user generic cho Setup Strategy = `api`/`factory` (Type = `state_exist`).
 * Tạo user qua API và tự đăng ký cleanup theo RUN_ID. Template — đổi endpoint/payload theo project.
 */
export async function createUser(
  ctx: APIRequestContext,
  overrides: Record<string, unknown> = {},
  opts: { runId?: string; preconditionId?: string } = {},
): Promise<CreatedUser> {
  const path = process.env.API_USERS_PATH || '/api/v1/users';
  const res = await ctx.post(path, { data: { ...overrides } });
  if (!res.ok()) {
    throw new SetupFailure(`Tạo user ${path} trả ${res.status()}.`, {
      preconditionId: opts.preconditionId,
    });
  }
  const user = (await res.json()) as CreatedUser;
  cleanupRegistry.register(
    async () => {
      await ctx.delete(`${path}/${user.id}`);
    },
    { label: `user:${user.id}`, runId: opts.runId },
  );
  return user;
}

/**
 * Ví dụ Setup Strategy = `test_hook`, Type = `state_mutation`:
 * đưa user về trạng thái đã thao tác N lần (vd đạt giới hạn).
 * Nếu chưa có test hook, `testHookClient` ném SetupFailure(needsHook) → Phase 2 đánh dấu `Needs hook`.
 */
export async function setUserActionCount(
  userId: string,
  count: number,
  opts: { runId?: string; preconditionId?: string } = {},
): Promise<void> {
  const hookPath = process.env.TEST_HOOK_SET_ACTION_COUNT_PATH || '/test-hooks/users/action-count';
  await testHookClient.call(hookPath, { userId, count }, opts.preconditionId);
  cleanupRegistry.register(
    async () => {
      await testHookClient.call(hookPath, { userId, count: 0 }, opts.preconditionId);
    },
    { label: `user-action-count:${userId}`, runId: opts.runId },
  );
}
