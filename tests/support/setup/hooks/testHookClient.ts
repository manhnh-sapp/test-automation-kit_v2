import { request, type APIRequestContext } from '@playwright/test';
import { SetupFailure } from '../contracts/preconditionTypes';

/**
 * Client gọi test hook — endpoint chỉ dùng cho test (reset/mutate state nhanh),
 * tương ứng Setup Strategy = `test_hook`.
 *
 * Base URL lấy từ env TEST_HOOK_BASE_URL. Nếu chưa cấu hình hoặc hook lỗi, ném
 * `SetupFailure(needsHook=true)` để Phase 2 phân loại `Needs hook` thay vì product bug.
 */
export class TestHookClient {
  private ctx?: APIRequestContext;

  private baseUrl(preconditionId?: string): string {
    const url = process.env.TEST_HOOK_BASE_URL;
    if (!url) {
      throw new SetupFailure(
        'TEST_HOOK_BASE_URL chưa cấu hình — không có test hook để setup precondition.',
        { preconditionId, readiness: 'Needs hook', needsHook: true },
      );
    }
    return url;
  }

  private async context(preconditionId?: string): Promise<APIRequestContext> {
    if (!this.ctx) {
      this.ctx = await request.newContext({ baseURL: this.baseUrl(preconditionId) });
    }
    return this.ctx;
  }

  /** Gọi một hook theo path + payload. Trả JSON; ném SetupFailure nếu hook lỗi. */
  async call<T = unknown>(
    path: string,
    payload: Record<string, unknown> = {},
    preconditionId?: string,
  ): Promise<T> {
    const ctx = await this.context(preconditionId);
    const res = await ctx.post(path, { data: payload });
    if (!res.ok()) {
      throw new SetupFailure(`Test hook ${path} trả ${res.status()}.`, {
        preconditionId,
        readiness: 'Needs hook',
        needsHook: true,
      });
    }
    return (await res.json()) as T;
  }

  async dispose(): Promise<void> {
    await this.ctx?.dispose();
    this.ctx = undefined;
  }
}

export const testHookClient = new TestHookClient();
