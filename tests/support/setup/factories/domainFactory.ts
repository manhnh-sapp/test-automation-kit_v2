import { type APIRequestContext } from '@playwright/test';
import { cleanupRegistry } from '../cleanup/cleanupRegistry';
import { SetupFailure } from '../contracts/preconditionTypes';

export interface CreatedRecord {
  id: string;
  [key: string]: unknown;
}

/**
 * Factory generic cho domain entity (Setup Strategy = `api`/`factory`, Type = `state_exist`).
 * Tạo bản ghi nghiệp vụ (có thể kèm children trong payload) và tự đăng ký cleanup theo RUN_ID.
 *
 * Đây là TEMPLATE dùng chung — KHÔNG hardcode domain của một task. Mỗi project đặt
 * `resourcePath`/payload theo entity thật (order, record, ticket, exam, ...).
 */
export async function createRecord(
  ctx: APIRequestContext,
  payload: Record<string, unknown>,
  opts: { resourcePath?: string; runId?: string; preconditionId?: string } = {},
): Promise<CreatedRecord> {
  const path = opts.resourcePath || process.env.API_RESOURCES_PATH || '/api/v1/resources';
  const res = await ctx.post(path, { data: payload });
  if (!res.ok()) {
    throw new SetupFailure(`Tạo record ${path} trả ${res.status()}.`, {
      preconditionId: opts.preconditionId,
    });
  }
  const record = (await res.json()) as CreatedRecord;
  cleanupRegistry.register(
    async () => {
      await ctx.delete(`${path}/${record.id}`);
    },
    { label: `record:${record.id}`, runId: opts.runId },
  );
  return record;
}
