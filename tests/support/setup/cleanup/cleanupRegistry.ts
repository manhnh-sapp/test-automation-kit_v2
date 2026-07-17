import type { CleanupFn } from '../contracts/preconditionTypes';

interface CleanupEntry {
  label: string;
  runId: string;
  fn: CleanupFn;
}

function resolveRunId(runId?: string): string {
  return runId || process.env.RUN_ID || 'default';
}

/**
 * Đăng ký và chạy cleanup theo RUN_ID.
 * Factory/hook/fixture đăng ký cleanup vào đây khi tạo dữ liệu; Phase 2 gọi `runAll(runId)`
 * sau khi chạy xong (cả khi PASS lẫn FAIL). Cleanup chạy LIFO để gỡ phụ thuộc đúng chiều.
 */
export class CleanupRegistry {
  private entries: CleanupEntry[] = [];

  register(fn: CleanupFn, opts: { label: string; runId?: string }): void {
    this.entries.push({ fn, label: opts.label, runId: resolveRunId(opts.runId) });
  }

  /**
   * Chạy toàn bộ cleanup của một runId. Không throw — trả về danh sách lỗi để report,
   * vì một cleanup fail không nên che kết quả test chính.
   */
  async runAll(runId?: string): Promise<{ label: string; error: unknown }[]> {
    const scopedRunId = resolveRunId(runId);
    const failures: { label: string; error: unknown }[] = [];
    const scoped = this.entries.filter((entry) => entry.runId === scopedRunId);
    for (let i = scoped.length - 1; i >= 0; i--) {
      try {
        await scoped[i].fn();
      } catch (error) {
        failures.push({ label: scoped[i].label, error });
      }
    }
    this.entries = this.entries.filter((entry) => entry.runId !== scopedRunId);
    return failures;
  }

  size(runId?: string): number {
    const scopedRunId = resolveRunId(runId);
    return this.entries.filter((entry) => entry.runId === scopedRunId).length;
  }
}

/** Singleton dùng chung trong một process test. */
export const cleanupRegistry = new CleanupRegistry();
