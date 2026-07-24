// Canonical TestCase model — types cho consumer TS (tests/). Impl là JS CommonJS (scripts/lib/testcase).
// Full JS→TS để #7; file .d.ts này cho type-safety phía tests/ mà không cần build-step.

export interface NumberedLine { n: number | null; text: string; }

export interface SetupContract {
  preId: string; desc: string; type: string; method: string; source: string;
  verification: string; cleanup: string; readiness: string; linked: string;
}

export interface TestCase {
  tcId: string;
  module: string;
  title: string;
  precondition: string;
  data: string;
  steps: NumberedLine[];
  stepsRaw: string;
  expected: NumberedLine[];
  expectedRaw: string;
  priority: string;
  risk: string;
  dimensions: string[];
  group: string;
  traceability: { reqId: string; story: string };
  /** original-header → cleaned cell (fidelity / migration bridge) */
  _cells: Record<string, string>;
}

export interface TestCaseDoc {
  source: 'md' | 'xlsx' | 'xray';
  tests: TestCase[];
  setup: SetupContract[];
  headers: string[];
  groups: string[];
  warnings: string[];
}

export interface ValidateResult { problems: string[]; warnings: string[]; }

export function parseMarkdown(mdOrPath: string, opts?: { story?: string }): TestCaseDoc;
export function parseXlsx(filePath: string, opts?: { story?: string }): Promise<TestCaseDoc>;
export function validate(doc: TestCaseDoc): ValidateResult;
export function cleanCell(text: string): string;
export function normalizeHeader(text: string): string;
export function splitNumbered(cell: string): NumberedLine[];
export function dimensionsOf(title: string): string[];
