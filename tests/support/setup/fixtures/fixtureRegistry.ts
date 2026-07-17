import { SetupFailure } from '../contracts/preconditionTypes';

/** Hàm verify một fixture pre-existing tồn tại; trả dữ liệu fixture hoặc null nếu thiếu. */
export type FixtureVerifier<T = unknown> = () => Promise<T | null>;

/**
 * Registry cho dữ liệu pre-existing / read-only fixture (Setup Strategy = `pre_existing`).
 * KHÔNG tạo mới dữ liệu — chỉ xác minh tồn tại trước khi test dùng. Thiếu fixture là
 * `setup_failure`, không phải product bug.
 */
export class FixtureRegistry {
  private verifiers = new Map<string, FixtureVerifier>();

  /** Đăng ký cách verify cho một fixture id (vd 'admin-user', 'parent-record'). */
  register<T>(id: string, verifier: FixtureVerifier<T>): void {
    this.verifiers.set(id, verifier as FixtureVerifier);
  }

  /** Xác minh fixture tồn tại; ném SetupFailure nếu chưa đăng ký hoặc không tồn tại. */
  async verify<T = unknown>(id: string, preconditionId?: string): Promise<T> {
    const verifier = this.verifiers.get(id);
    if (!verifier) {
      throw new SetupFailure(`Chưa đăng ký verifier cho fixture '${id}'.`, { preconditionId });
    }
    const data = await verifier();
    if (data == null) {
      throw new SetupFailure(`Fixture pre-existing '${id}' không tồn tại trên môi trường test.`, {
        preconditionId,
      });
    }
    return data as T;
  }
}

export const fixtureRegistry = new FixtureRegistry();
