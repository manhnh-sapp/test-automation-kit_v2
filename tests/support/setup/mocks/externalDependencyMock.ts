import { type Page, type Route } from '@playwright/test';

export type FaultMode = 'status' | 'timeout' | 'abort';

export interface ExternalMockOptions {
  /** URL/glob/regex của dependency NGOÀI scope cần cô lập. */
  urlPattern: string | RegExp;
  /** Kiểu fault muốn mô phỏng. Mặc định 'status'. */
  fault?: FaultMode;
  /** Status code khi fault = 'status' (mặc định 500). */
  status?: number;
  /** Body trả về khi fault = 'status'. */
  body?: unknown;
  /** Delay (ms) trước khi xử lý — dùng mô phỏng chậm/timeout. */
  delayMs?: number;
}

/**
 * Mock/test double cho dependency NGOÀI scope (third-party/integration).
 *
 * CHỈ dùng để cô lập dependency ngoài hoặc inject fault (5xx/timeout/abort) — KHÔNG mock
 * behavior/logic đang kiểm thử. Mọi mock phải được ghi rõ trong actual result/report.
 *
 * Template: đổi `urlPattern`/body theo integration thật của project.
 */
export async function mockExternalDependency(page: Page, opts: ExternalMockOptions): Promise<void> {
  await page.route(opts.urlPattern, async (route: Route) => {
    if (opts.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, opts.delayMs));
    }
    switch (opts.fault) {
      case 'abort':
        await route.abort('failed');
        return;
      case 'timeout':
        // Cố tình không fulfill để mô phỏng timeout; test phải đặt timeout ngắn để quan sát.
        return;
      case 'status':
      default:
        await route.fulfill({
          status: opts.status ?? 500,
          contentType: 'application/json',
          body: JSON.stringify(opts.body ?? { error: 'mocked external dependency failure' }),
        });
    }
  });
}
