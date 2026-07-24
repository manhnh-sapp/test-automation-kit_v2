// TestContext (#4) — types cho consumer TS (tests/). Impl là JS CommonJS (test_context.js). Thin glue.

export interface TestContextMetadata {
  tcId: string;
  requirementId: string;
  xrayKey: string;
}

export interface EvidenceRecorderLike {
  case(tcId: string): unknown;
  write(): string;
}

export interface TestContext {
  taskKey: string;
  runId: string;
  projectOutputDir: string;
  taskOutputDir: string;
  repoRoot: string;
  metadata: TestContextMetadata;
  /** Lazy EvidenceRecorder (đúng task/run). */
  evidence(): EvidenceRecorderLike;
  /** Đăng ký cleanup callback (LIFO). */
  onCleanup(fn: () => void | Promise<void>, label?: string): void;
  /** Chạy cleanup LIFO best-effort → list lỗi. */
  runCleanup(): Promise<string[]>;
}

export interface CreateTestContextOptions {
  taskKey?: string;
  task?: string;
  projectOutputDir?: string;
  runId?: string;
  tcId?: string;
  requirementId?: string;
  xrayKey?: string;
}

export function createTestContext(opts?: CreateTestContextOptions): TestContext;
