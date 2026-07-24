// runtime_config (typed surface — P1 "typed RuntimeConfig"). Impl là JS CommonJS (runtime_config.js);
// .d.ts cho consumer TS (tests/) có type mà KHÔNG cần build-step (full JS→TS hoãn). Resolve-once +
// bundle immutable = TestContext (scripts/utils/test_context). File này chỉ type-hoá API sẵn có.

export const REPO_ROOT: string;

export interface TaskKeyOptions {
  task?: string; taskKey?: string; task_key?: string; taskId?: string; task_id?: string; story?: string;
}
export interface TaskOutputDirOptions {
  taskOutputDir?: string; projectOutputDir?: string; taskKey?: string;
}
export interface TestResultsDirOptions {
  taskOutputDir?: string; projectOutputDir?: string; taskKey?: string; runId?: string;
}

/** PROJECT_OUTPUT_DIR (opts hoặc env) — throw nếu thiếu. */
export function getProjectOutputDir(value?: string): string;
/** RUN_ID hợp lệ ([A-Za-z0-9_.-]) hoặc '' nếu không có. */
export function getRunId(value?: string): string;
/** TASK_KEY (opts.task/taskKey/… hoặc env TASK_KEY/TASK_SCOPE/TASK) — throw nếu thiếu. */
export function getTaskKey(options?: TaskKeyOptions): string;
/** <projectOutputDir>/tasks/<taskKey> (hoặc TASK_OUTPUT_DIR nếu khớp taskKey). */
export function getTaskOutputDir(options?: TaskOutputDirOptions): string;
/** <taskOutputDir>/test-results[/runs/<runId>]. */
export function getTestResultsDir(options?: TestResultsDirOptions): string;

export function isUsableValue(value: unknown): boolean;
export function loadEnvFiles(extraFiles?: string[]): void;
export function parseEnvFile(file: string): boolean;
export function requireValue(name: string, value: unknown, hint?: string): string;
/** path tuyệt đối (hoặc resolve theo REPO_ROOT). */
export function resolveFromRepo(filePath: string): string;
