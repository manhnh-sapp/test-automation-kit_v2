/**
 * Setup layer contracts — ánh xạ 1-1 với section
 * "## Setup Strategy (Hợp đồng tiền điều kiện)" và "### Precondition Execution Matrix"
 * do Phase 1 sinh ra. Phase 2 import các type này để resolve precondition theo hợp đồng,
 * KHÔNG đoán endpoint/payload/fixture.
 */

/** Loại trạng thái tiền điều kiện (cột `Precondition Type`). */
export type PreconditionType =
  | 'auth_session'
  | 'state_exist'
  | 'state_mutation'
  | 'config'
  | 'pre_existing_fixture'
  | 'none';

/** Cách hiện thực setup (cột `Setup Strategy` / `Setup Method`). */
export type SetupStrategy =
  | 'api'
  | 'factory'
  | 'test_hook'
  | 'ui'
  | 'pre_existing'
  | 'manual';

/** Mức sẵn sàng automation (cột `Automation Readiness`). */
export type AutomationReadiness = 'Ready' | 'Needs hook' | 'Manual-only';

/** Một dòng trong catalog Setup Strategy (PRE-NN). */
export interface Precondition {
  /** Mã PRE-NN. */
  id: string;
  /** Mô tả trạng thái cần có. */
  description: string;
  type: PreconditionType;
  strategy: SetupStrategy;
  /** Endpoint+payload / tên factory+tham số / id fixture cụ thể. */
  source: string;
  /** Cách xác nhận setup thành công trước khi assert. */
  verification: string;
  /** Hành động rollback, hoặc 'none' + lý do. */
  cleanup: string;
  readiness: AutomationReadiness;
  /** Các PRE-NN phải resolve trước. */
  dependsOn?: string[];
  linkedTcIds?: string[];
}

/** Hàm cleanup đã đăng ký; nên viết idempotent. */
export type CleanupFn = () => Promise<void>;

/** Kết quả resolve một precondition. */
export interface SetupResult<T = unknown> {
  precondition: Precondition;
  /** Dữ liệu đã tạo hoặc xác minh (id, token, entity...). */
  data?: T;
  /** true nếu `verification` đã pass. */
  verified: boolean;
}

/**
 * Lỗi setup — KHÔNG phải product bug.
 * Phase 2 dùng để phân loại `setup_failure`: sửa setup rồi rerun, không log Jira.
 */
export class SetupFailure extends Error {
  readonly preconditionId?: string;
  readonly readiness?: AutomationReadiness;
  /** true nếu nguyên nhân là thiếu test hook (`Needs hook`). */
  readonly needsHook: boolean;

  constructor(
    message: string,
    opts: { preconditionId?: string; readiness?: AutomationReadiness; needsHook?: boolean } = {},
  ) {
    super(message);
    this.name = 'SetupFailure';
    this.preconditionId = opts.preconditionId;
    this.readiness = opts.readiness;
    this.needsHook = opts.needsHook ?? false;
  }
}

/** true nếu error là setup_failure → execute layer không kết luận product bug. */
export function isSetupFailure(err: unknown): err is SetupFailure {
  return err instanceof SetupFailure;
}
