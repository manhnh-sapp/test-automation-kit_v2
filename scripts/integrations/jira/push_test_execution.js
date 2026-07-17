#!/usr/bin/env node

/**
 * Push Phase 2 execution results to Xray as a Test Execution (test run).
 *
 * After each execute/rerun, this reads the machine-readable status file the
 * agent writes (test-results/testcase-status.json) plus the TC -> Xray Test key
 * map produced by publish_testcases.js (reports/jira-testcase-publish.json), then
 * calls the Xray Cloud import-execution endpoint to create a Test Execution whose
 * runs carry PASSED / FAILED / TO DO status per test.
 *
 * Status mapping (kit -> Xray) is configurable; on this instance Xray only exposes
 * PASSED / FAILED / TO DO / EXECUTING, so SKIP and BLOCKED both map to TO DO by
 * default and the real classification is preserved in each run's comment. The
 * script validates every mapped status against the instance's getStatuses() before
 * posting, so a misconfiguration fails fast instead of half-importing.
 *
 * Step-level status (XRAY_EXEC_STEP_STATUS / --step-status): by default ('pass') a
 * PASSED test also marks every manual step PASSED so the Test Run steps aren't left
 * at "TO DO"; 'off' keeps only the overall status, 'mirror' pushes the overall
 * status to all steps. Step counts are read from Xray (getTests) at push time.
 * For FAILED tests, the status file can carry per-step detail — either a steps[]
 * array ({status, comment?, evidence?} per step, positional) or a failedStep index
 * (1-based) + failedStepEvidence — so the Test Run marks the exact failing step
 * FAILED with its evidence attached (steps before = PASSED, after = TODO). Step
 * statuses use Xray's step-status names (note: 'TODO', not the test-run 'TO DO').
 *
 * Closing the cycle (XRAY_EXECUTION_DONE_STATUS / --done-status): after a successful
 * --write (in Phase 2 that means after QA approved the preview), the Test Execution
 * issue is transitioned to that status (e.g. "Done"); empty = left Open. It never
 * transitions at creation or on a non-conclusive run (the conclusive guard runs first).
 *
 * Task-agnostic (driven by env/args). Default is --dry-run (preview only); pass
 * --write to actually create the Test Execution.
 *
 * Usage:
 *   node scripts/integrations/jira/push_test_execution.js --task <KEY> --story <KEY> --project-output <DIR> --dry-run
 *   node scripts/integrations/jira/push_test_execution.js --task <KEY> --story <KEY> --project-output <DIR> --write
 *   node scripts/integrations/jira/push_test_execution.js --task <KEY> --project-output <DIR> --write --with-evidence
 *   node scripts/integrations/jira/push_test_execution.js --task <KEY> --project-output <DIR> --write --execution-key <EXEC-KEY>
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const {
  loadEnv,
  buildJiraHeaders,
  resolveJiraAccountId,
  getProjectOutputDir,
  getTaskKey,
  getTaskOutputDir,
  saveJsonToFile,
  saveTextToFile,
  log,
} = require('./utils');
const { getRunId, getTestResultsDir } = require('../../utils/runtime_config');
const { XrayCloudClient, isUsableCreds } = require('./xray_cloud');

loadEnv();

const SCRIPT_DIR = __dirname;
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..', '..');
const args = parseArgs(process.argv.slice(2));

const PROJECT_OUTPUT_DIR = resolvePath(argString('project-output') || getProjectOutputDir());
const TASK_KEY = getTaskKey({ task: argString('task') });
const TASK_OUTPUT_DIR = resolvePath(
  argString('task-output') || getTaskOutputDir({ projectOutputDir: PROJECT_OUTPUT_DIR, taskKey: TASK_KEY }),
);
const RUN_ID = getRunId(argString('run-id') || process.env.RUN_ID);
const TEST_RESULTS_DIR = resolvePath(getTestResultsDir({ taskOutputDir: TASK_OUTPUT_DIR, runId: RUN_ID }));
const REPORT_DIR = resolvePath(
  argString('report-dir') || (RUN_ID ? path.join(TASK_OUTPUT_DIR, 'reports', 'runs', RUN_ID) : path.join(TASK_OUTPUT_DIR, 'reports')),
);

const STATUS_FILE = resolvePath(argString('status') || path.join(TEST_RESULTS_DIR, 'testcase-status.json'));
const MAP_FILE = resolvePath(argString('map') || path.join(TASK_OUTPUT_DIR, 'reports', 'jira-testcase-publish.json'));

const STORY_KEY = normalizeIssueKey(argString('story') || process.env.JIRA_STORY_KEY || TASK_KEY);
const PROJECT_KEY = normalizeProjectKey(argString('project') || process.env.JIRA_PROJECT_KEY || deriveProjectKey(STORY_KEY));
const ISSUE_TYPE = argString('issue-type') || process.env.JIRA_TESTCASE_ISSUE_TYPE || 'Test';

const EXECUTION_KEY = normalizeIssueKey(argString('execution-key') || '');
const EXEC_ISSUE_TYPE = argString('execution-issue-type') || process.env.XRAY_TEST_EXECUTION_ISSUE_TYPE || 'Test Execution';
// Extra fields for the pre-created Test Execution issue (projects like SAPP require
// customfield_10037/10039 on every create). Reuse the publish convention.
const EXTRA_FIELDS = parseJsonObject(process.env.JIRA_EXECUTION_EXTRA_FIELDS || process.env.JIRA_TESTCASE_EXTRA_FIELDS || '');
const SUMMARY = argString('summary') || '';
// Default Test Execution name = "[<TASK_KEY>] Test Execution - <scope> - <version>".
const SCOPE_LABEL = argString('scope-label') || process.env.XRAY_EXECUTION_SCOPE_LABEL || 'Full testcases';
const VERSION_OVERRIDE = argString('version') || process.env.RELEASE_VERSION || '';
const TEST_ENVIRONMENTS = splitList(argString('test-environments') || process.env.XRAY_TEST_ENVIRONMENTS || '');
const TEST_PLAN_KEY = normalizeIssueKey(argString('test-plan') || process.env.XRAY_TEST_PLAN_KEY || '');
// Tự dò Test Plan theo sprint của Story nếu không cấp key; --no-test-plan để tắt.
const NO_TEST_PLAN = argFlag('no-test-plan') || process.env.XRAY_NO_TEST_PLAN === '1';
const JIRA_SPRINT_FIELD_ID = argString('sprint-field') || process.env.JIRA_SPRINT_FIELD_ID || '';
// Test Plan issue type name (để search theo sprint).
const TEST_PLAN_ISSUE_TYPE = argString('test-plan-issue-type') || process.env.JIRA_TEST_PLAN_ISSUE_TYPE || 'Test Plan';

const WITH_EVIDENCE = argFlag('with-evidence') || process.env.XRAY_EXECUTION_WITH_EVIDENCE === '1';
// Bắt buộc mọi case đã execute (PASS/FAIL) phải có evidence ở TỪNG step; thiếu -> lỗi (thay vì chỉ cảnh báo).
const REQUIRE_STEP_EVIDENCE = argFlag('require-step-evidence') || process.env.XRAY_REQUIRE_STEP_EVIDENCE === '1';
const EVIDENCE_MAX_BYTES = Number.parseInt(argString('evidence-max-bytes') || process.env.XRAY_EVIDENCE_MAX_BYTES || '', 10) || 5 * 1024 * 1024;

// Step-level status trong Test Run (mặc định 'pass'):
//   off    = chỉ set status TỔNG của test; từng step giữ mặc định "TO DO" (hành vi cũ).
//   pass   = với test PASSED, set TẤT CẢ step = PASSED (step "xanh" khớp overall). Test khác giữ TO DO.
//   mirror = set mọi step = status tổng của test (kể cả FAILED → mọi step FAILED — thô, dùng khi cần).
// Cần Xray API key (đã có) để đọc số step mỗi Test; đọc lỗi → tự bỏ qua, giữ status tổng.
const STEP_STATUS = normalizeStepStatusMode(argString('step-status') || process.env.XRAY_EXEC_STEP_STATUS || 'pass');

// Assignee cho Test Execution (QA điền tên/email vào JIRA_XRAY_ASSIGNEE ở task.env). Bỏ trống = không gán.
const XRAY_ASSIGNEE = argString('assignee') || process.env.JIRA_XRAY_ASSIGNEE || '';
// Sau khi push XONG (kết quả đã import; Phase 2 = QA đã duyệt trước --write) → tự transition Test Execution
// sang status này để "đóng" vòng chạy. Bỏ trống = KHÔNG transition (giữ Open). Vd đặt "Done". --no-done bỏ 1 lần.
// Không chạy lúc tạo/khi chưa conclusive (guard conclusive đã chặn ở trên) — chỉ chạy cuối, sau khi có kết quả.
const DONE_STATUS = argString('done-status') || process.env.XRAY_EXECUTION_DONE_STATUS || '';
const NO_DONE = argFlag('no-done');

const DO_WRITE = argFlag('write') || argFlag('no-dry-run') || argFlag('publish');
const DRY_RUN = !DO_WRITE;
// AUTO mode (PUSH_XRAY_EXECUTION=auto hoặc --auto): tạo Test Execution ở checkpoint có ý nghĩa
// (cuối cycle Phase 2 chính thức / mỗi re-run). Ở AUTO, thiếu creds/status → BỎ QUA mềm (exit 0),
// không làm vỡ pipeline. --force để bỏ qua guard "conclusive".
const PUSH_MODE = String(process.env.PUSH_XRAY_EXECUTION || '').trim().toLowerCase();
// Soft mode (auto|confirm): thiếu creds/status -> skip mềm exit 0 thay vì throw. 'confirm' còn yêu cầu
// QA xác nhận preview (dry-run) trước khi --write — do agent/prompt điều phối, không ép ở script.
const AUTO = argFlag('auto') || PUSH_MODE === 'auto' || PUSH_MODE === 'confirm';
const CONFIRM_MODE = PUSH_MODE === 'confirm' && !argFlag('auto');
const FORCE = argFlag('force');

// status trong file -> Xray status name (validated against the instance later).
// Ưu tiên dùng thẳng tên Xray (PASSED/FAILED/TO DO/EXECUTING); vẫn nhận alias kit cũ.
const STATUS_PASS = process.env.XRAY_STATUS_PASS || 'PASSED';
const STATUS_FAIL = process.env.XRAY_STATUS_FAIL || 'FAILED';
const STATUS_SKIP = process.env.XRAY_STATUS_SKIP || 'TO DO';
const STATUS_BLOCKED = process.env.XRAY_STATUS_BLOCKED || 'TO DO';
const STATUS_EXECUTING = process.env.XRAY_STATUS_EXECUTING || 'EXECUTING';
const STATUS_MAP = {
  // Xray-native (khuyến nghị)
  passed: STATUS_PASS,
  failed: STATUS_FAIL,
  'to do': STATUS_SKIP,
  todo: STATUS_SKIP,
  executing: STATUS_EXECUTING,
  // alias kit cũ
  pass: STATUS_PASS,
  fail: STATUS_FAIL,
  skip: STATUS_SKIP,
  skipped: STATUS_SKIP,
  block: STATUS_BLOCKED,
  blocked: STATUS_BLOCKED,
};

const XRAY_CLIENT_ID = process.env.XRAY_CLIENT_ID || '';
const XRAY_CLIENT_SECRET = process.env.XRAY_CLIENT_SECRET || '';
const XRAY_CLOUD_BASE_URL = process.env.XRAY_CLOUD_BASE_URL || process.env.XRAY_API_BASE_URL || 'https://xray.cloud.getxray.app';
const JIRA_BASE_URL = stripTrailingSlash(process.env.JIRA_BASE_URL || process.env.JIRA_URL || '');

let xrayClient = null;
const keyByJqlCache = new Map();
let _stepCanon = null; // normStatus -> tên step-status chuẩn của instance (khác test-status: step dùng "TODO")

main().catch((error) => {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
});

async function main() {
  validate();

  const statusDoc = readStatusFile(STATUS_FILE);
  const rawTests = Array.isArray(statusDoc) ? statusDoc : (statusDoc.tests || statusDoc.testcases || []);
  if (!rawTests.length) throw new Error(`Status file không có test nào: ${relativeToRepo(STATUS_FILE)}`);

  const tcToKey = loadTcKeyMap(MAP_FILE);

  const client = getXrayClient();
  const statuses = await client.getStatuses();
  const canonByNorm = new Map(statuses.map((s) => [normStatus(s.name), s.name]));
  log('LOG', `Xray statuses: ${statuses.map((s) => s.name).join(', ')}`);
  if (STEP_STATUS !== 'off') _stepCanon = await buildStepCanon(client);

  const tests = [];
  const skipped = [];
  const unmappedStatus = new Set();
  const counts = {};

  for (const t of rawTests) {
    const tcId = String(t.tcId || t.tc || t.id || '').trim();
    const kitStatus = String(t.status || '').trim();
    if (!tcId || !kitStatus) { skipped.push({ tcId: tcId || '(no id)', reason: 'thiếu tcId/status' }); continue; }

    const mapped = STATUS_MAP[kitStatus.toLowerCase()];
    if (!mapped) { unmappedStatus.add(kitStatus); skipped.push({ tcId, reason: `status "${kitStatus}" không map được` }); continue; }
    const xrayStatus = canonByNorm.get(normStatus(mapped));
    if (!xrayStatus) {
      throw new Error(`Status "${mapped}" (từ kit "${kitStatus}") không tồn tại trên Xray. Có: ${statuses.map((s) => s.name).join(', ')}. Chỉnh XRAY_STATUS_* hoặc thêm status trong Xray.`);
    }

    const testKey = await resolveTestKey(tcId, tcToKey);
    if (!testKey) { skipped.push({ tcId, reason: 'không map được sang Xray Test key' }); continue; }

    const entry = { testKey, status: xrayStatus, comment: buildComment(kitStatus, t.comment) };
    if (WITH_EVIDENCE) {
      const ev = buildEvidence(t.evidence);
      if (ev.length) entry.evidence = ev;
    }
    // Chi tiết từng step (đặc biệt cho case FAILED): status file có thể cung cấp
    //   steps: [{status, comment?, evidence?}]  — hoặc shortcut  failedStep: <index 1-based> (+ failedStepEvidence).
    if (Array.isArray(t.steps)) entry._rawSteps = t.steps;
    else if (t.failedStep != null || t.failed_step != null) {
      entry._failedStep = Number(t.failedStep != null ? t.failedStep : t.failed_step);
      entry._failedEvidence = t.failedStepEvidence || t.failed_step_evidence || t.evidence;
    }
    tests.push(entry);
    counts[`${kitStatus.toUpperCase()} → ${xrayStatus}`] = (counts[`${kitStatus.toUpperCase()} → ${xrayStatus}`] || 0) + 1;
  }

  if (!tests.length) throw new Error('Không có test nào đủ điều kiện push (thiếu key mapping hoặc status). Xem cảnh báo ở trên.');

  // Guard "conclusive run": không tạo Test Execution nếu 0 case có verdict PASSED/FAILED
  // (toàn TO DO/EXECUTING = run debug/partial/setup-lỗi) → tránh execution rác. --force để bỏ qua.
  const conclusive = tests.filter((t) => {
    const n = normStatus(t.status);
    return n === normStatus(STATUS_PASS) || n === normStatus(STATUS_FAIL);
  }).length;
  if (conclusive === 0 && !FORCE) {
    log('WARN', `Run KHÔNG conclusive: 0 PASSED/FAILED trên ${tests.length} test (toàn TO DO/EXECUTING) → KHÔNG tạo Test Execution để tránh execution rác. Dùng --force nếu vẫn muốn tạo.`);
    return;
  }

  // Step-level status: điền steps[].status cho khớp overall (step "xanh" khi test PASSED).
  if (STEP_STATUS !== 'off') await applyStepStatuses(tests, client);

  // Gate evidence: mọi case đã execute (PASS/FAIL) phải có evidence ở từng step (+ cấp case khi --with-evidence).
  checkEvidenceCoverage(tests);

  const nowIso = new Date().toISOString();
  const version = SUMMARY ? '' : await resolveVersion();
  // Số lần chạy = số Test Execution đã có của task + 1 (append vào execution có sẵn thì giữ nguyên tên).
  const runNo = (SUMMARY || EXECUTION_KEY) ? null : await resolveRunNumber();
  const defaultSummary = `[${TASK_KEY}] Test Execution - Lần ${runNo || 1}${SCOPE_LABEL ? ` - ${SCOPE_LABEL}` : ''}${version ? ` - ${version}` : ''}${RUN_ID ? ` (run ${RUN_ID})` : ''}`;
  // Test Plan: ưu tiên key được cấp; nếu không có và không --no-test-plan → tự dò theo sprint của Story.
  let effectivePlanKey = TEST_PLAN_KEY;
  if (!effectivePlanKey && !NO_TEST_PLAN) effectivePlanKey = await resolveTestPlanBySprint();
  const info = {
    summary: SUMMARY || defaultSummary,
    project: PROJECT_KEY,
    startDate: statusDoc.startDate || statusDoc.generatedAt || nowIso,
    finishDate: statusDoc.finishDate || statusDoc.generatedAt || nowIso,
  };
  if (TEST_ENVIRONMENTS.length) info.testEnvironments = TEST_ENVIRONMENTS;
  if (effectivePlanKey) info.testPlanKey = effectivePlanKey;
  log('LOG', `Test Execution: "${info.summary}"${effectivePlanKey ? ` → link Test Plan ${effectivePlanKey}` : ' (không link Test Plan)'}`);

  // Strip field nội bộ (không thuộc Xray import format) sau khi đã build steps → tránh 400 "Result is not valid Xray Format".
  for (const t of tests) { delete t._rawSteps; delete t._failedStep; delete t._failedEvidence; }

  const execution = { info, tests };
  if (EXECUTION_KEY) execution.testExecutionKey = EXECUTION_KEY;

  printPlan(tests, counts, skipped, unmappedStatus);

  if (DRY_RUN) {
    const previewPath = path.join(REPORT_DIR, 'xray-execution-preview.json');
    saveJsonToFile(previewPath, execution);
    console.log('\n[DRY-RUN] Chưa tạo Test Execution. Đây là PREVIEW.');
    if (CONFIRM_MODE) console.log('  ⚠️ Chế độ CONFIRM: trình preview này cho QA duyệt; chỉ chạy lại kèm --write SAU KHI QA xác nhận.');
    else console.log('  Thêm --write để đẩy lên Xray.');
    console.log(`  Preview payload: ${relativeToRepo(previewPath)}`);
    return;
  }

  let res;
  let execKey;
  if (EXECUTION_KEY) {
    // Append vào execution có sẵn: chỉ import runs, không gửi info (tránh set field issue không có trên screen).
    res = await client.importExecution({ testExecutionKey: EXECUTION_KEY, tests });
    execKey = EXECUTION_KEY;
    if (effectivePlanKey) await linkExecutionToPlan(client, effectivePlanKey, null, EXECUTION_KEY);
  } else {
    try {
      res = await client.importExecution(execution);
      execKey = res.key || (res.testExecIssue && res.testExecIssue.key) || '(unknown)';
    } catch (error) {
      // Projects like SAPP require custom fields on every issue create, which Xray's
      // import cannot set. Pre-create the Test Execution issue ourselves with those
      // fields, then import runs-only into it (no info → no execution-field update).
      const missing = parseMissingCustomFields(error.message);
      if (!missing.length) throw error;
      log('WARN', `Import tạo issue bị chặn bởi field bắt buộc (${missing.join(', ')}) → pre-create Test Execution rồi import runs.`);
      const created = await preCreateTestExecution(info, missing, tests[0].testKey);
      execKey = created.key;
      log('LOG', `Đã pre-create Test Execution ${execKey}.`);
      res = await client.importExecution({ testExecutionKey: created.key, tests });
      if (effectivePlanKey) await linkExecutionToPlan(client, effectivePlanKey, created.id, created.key);
    }
  }
  // Tự điền field: Test Execution theo Story (Sprint/Fix versions/Start date/SAPP-Due date);
  // Test Plan theo sprint (Sprint/Start date/SAPP-Due date, chỉ khi trống).
  await fillExecutionFieldsFromStory(execKey);
  if (effectivePlanKey) await fillTestPlanFieldsFromSprint(effectivePlanKey);
  await assignExecution(execKey);
  await transitionExecution(execKey);

  console.log(`\n[OK] Test Execution: ${execKey}`);
  if (JIRA_BASE_URL && /^[A-Z]/.test(execKey)) console.log(`  ${JIRA_BASE_URL}/browse/${execKey}`);

  saveTextToFile(path.join(REPORT_DIR, 'xray-execution-summary.md'), buildReport(execKey, tests, counts, skipped));
  console.log(`  Report: ${relativeToRepo(path.join(REPORT_DIR, 'xray-execution-summary.md'))}`);
}

function validate() {
  if (!JIRA_BASE_URL) throw new Error('Thiếu JIRA_BASE_URL/JIRA_URL.');
  if (!PROJECT_KEY) throw new Error('Thiếu Jira project key. Set JIRA_PROJECT_KEY hoặc --project <KEY>.');
  if (!isUsableCreds(XRAY_CLIENT_ID, XRAY_CLIENT_SECRET)) {
    if (AUTO) { log('WARN', 'AUTO: thiếu XRAY_CLIENT_ID/SECRET → bỏ qua push Test Execution (report local vẫn giữ).'); process.exit(0); }
    throw new Error('Thiếu XRAY_CLIENT_ID/XRAY_CLIENT_SECRET (Xray Cloud API key) để tạo Test Execution.');
  }
  if (!fs.existsSync(STATUS_FILE)) {
    if (AUTO) { log('WARN', `AUTO: chưa thấy ${relativeToRepo(STATUS_FILE)} (chưa có kết quả execute) → bỏ qua push.`); process.exit(0); }
    throw new Error(`Không thấy status file: ${relativeToRepo(STATUS_FILE)}. Phase 2 phải ghi test-results/testcase-status.json (schema: {tests:[{tcId,status,comment,evidence?}]}).`);
  }
}

function readStatusFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`Đọc status file lỗi (${relativeToRepo(file)}): ${error.message}`);
  }
}

// tcId(lower) -> Xray Test issue key, from the publish report's results[].
function loadTcKeyMap(file) {
  const map = new Map();
  if (!fs.existsSync(file)) {
    log('WARN', `Không thấy map publish (${relativeToRepo(file)}) → sẽ resolve key bằng JQL theo label tc-*.`);
    return map;
  }
  try {
    const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
    const results = doc.results || (Array.isArray(doc) ? doc : []);
    for (const r of results) {
      const key = r.issueKey || r.existingIssueKey || '';
      if (r.tcId && key) map.set(String(r.tcId).toLowerCase(), key);
    }
    log('LOG', `Map publish: ${map.size} TC → Xray key.`);
  } catch (error) {
    log('WARN', `Đọc map publish lỗi: ${error.message} → fallback JQL.`);
  }
  return map;
}

async function resolveTestKey(tcId, tcToKey) {
  const direct = tcToKey.get(tcId.toLowerCase());
  if (direct) return direct;
  // Fallback: find the Test by its tc-<id> label.
  const label = labelFor(`tc-${tcId}`);
  if (keyByJqlCache.has(label)) return keyByJqlCache.get(label);
  try {
    const jql = `project = "${escapeJql(PROJECT_KEY)}" AND issuetype = "${escapeJql(ISSUE_TYPE)}" AND labels = "${escapeJql(label)}"`;
    const res = await axios.get(`${JIRA_BASE_URL}/rest/api/3/search/jql`, {
      headers: buildJiraHeaders(),
      params: { jql, maxResults: 1, fields: 'summary' },
    });
    const key = (res.data.issues && res.data.issues[0] && res.data.issues[0].key) || '';
    keyByJqlCache.set(label, key);
    return key;
  } catch (error) {
    log('WARN', `${tcId}: resolve key lỗi (${error.message}).`);
    keyByJqlCache.set(label, '');
    return '';
  }
}

// Preserve the true kit classification (esp. SKIP vs BLOCKED that both map to TO DO).
// PASS/FAIL đã hiển thị ở badge status của Test Run → KHÔNG chèn tag (tránh comment thừa/rối);
// chỉ giữ tag cho các trạng thái map về "TO DO" (SKIP/BLOCKED/EXECUTING) để phân biệt.
function buildComment(kitStatus, comment) {
  const k = String(kitStatus || '').toUpperCase();
  const body = String(comment || '').trim();
  const redundant = /^(PASS|PASSED|FAIL|FAILED)$/.test(k);
  if (redundant) return body;
  const tag = `[${k}]`;
  return body ? `${tag} ${body}` : tag;
}

function buildEvidence(evidence) {
  const files = Array.isArray(evidence) ? evidence : (evidence ? [evidence] : []);
  const out = [];
  for (const f of files) {
    const p = resolvePath(String(f));
    if (!fs.existsSync(p)) { log('WARN', `Evidence không tồn tại: ${f}`); continue; }
    const size = fs.statSync(p).size;
    if (size > EVIDENCE_MAX_BYTES) { log('WARN', `Evidence quá lớn (${Math.round(size / 1024)}KB), bỏ qua: ${path.basename(p)}`); continue; }
    out.push({ data: fs.readFileSync(p).toString('base64'), filename: path.basename(p), contentType: contentTypeOf(p) });
  }
  return out;
}

function contentTypeOf(file) {
  const ext = path.extname(file).toLowerCase();
  return {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
    '.gif': 'image/gif', '.mp4': 'video/mp4', '.webm': 'video/webm', '.pdf': 'application/pdf',
    '.txt': 'text/plain', '.json': 'application/json', '.html': 'text/html',
  }[ext] || 'application/octet-stream';
}

function normalizeStepStatusMode(value) {
  const s = String(value || '').trim().toLowerCase();
  if (s === 'off' || s === 'pass' || s === 'mirror') return s;
  log('WARN', `XRAY_EXEC_STEP_STATUS="${value}" không hợp lệ (off|pass|mirror) → dùng 'pass'.`);
  return 'pass';
}

// Đọc danh sách step-status hợp lệ của instance (khác test-status: step dùng "TODO" không dấu cách).
async function buildStepCanon(client) {
  try {
    const d = await client.graphql('{ getStepStatuses { name } }');
    const arr = (d && d.getStepStatuses) || [];
    if (arr.length) return new Map(arr.map((s) => [normStatus(s.name), s.name]));
  } catch (error) {
    log('WARN', `Không đọc được step statuses (${error.message.slice(0, 80)}) → dùng PASSED/FAILED/TODO mặc định.`);
  }
  return new Map([['PASSED', 'PASSED'], ['FAILED', 'FAILED'], ['TODO', 'TODO'], ['EXECUTING', 'EXECUTING']]);
}
function canonStepStatus(name) {
  return (_stepCanon && _stepCanon.get(normStatus(name))) || String(name || '');
}
// Map status của 1 step trong status file -> tên step-status chuẩn của instance.
function mapStepStatus(raw) {
  const s = String(raw || '').toLowerCase().replace(/\s+/g, ' ').trim();
  let name;
  if (s === 'passed' || s === 'pass') name = 'PASSED';
  else if (s === 'failed' || s === 'fail') name = 'FAILED';
  else if (s === 'executing') name = 'EXECUTING';
  else name = 'TODO'; // to do / todo / skip / skipped / blocked / rỗng / lạ
  return canonStepStatus(name);
}

// Kiểm tra coverage evidence: mọi case đã execute (PASS/FAIL) phải có evidence ở TỪNG step;
// khi --with-evidence còn kiểm evidence cấp case. Thiếu -> WARN (hoặc THROW nếu --require-step-evidence).
function checkEvidenceCoverage(tests) {
  const isExec = (t) => { const s = normStatus(t.status); return s === normStatus(STATUS_PASS) || s === normStatus(STATUS_FAIL); };
  const executed = tests.filter(isExec);
  if (!executed.length) return;
  const noStepEv = executed.filter((t) => !(t.steps || []).some((s) => (s.evidences || []).length));
  const noCaseEv = executed.filter((t) => !((t.evidence || []).length));
  if (!WITH_EVIDENCE) log('WARN', 'Evidence cấp CASE đang TẮT → thêm --with-evidence (hoặc XRAY_EXECUTION_WITH_EVIDENCE=1) để đính ảnh cấp case.');
  const problems = [];
  if (noStepEv.length) problems.push(`${noStepEv.length}/${executed.length} case THIẾU evidence ở step (ví dụ: ${noStepEv.slice(0, 5).map((t) => t.testKey).join(', ')})`);
  if (WITH_EVIDENCE && noCaseEv.length) problems.push(`${noCaseEv.length}/${executed.length} case THIẾU evidence cấp case (ví dụ: ${noCaseEv.slice(0, 5).map((t) => t.testKey).join(', ')})`);
  if (problems.length) {
    const msg = `Evidence chưa đủ: ${problems.join(' | ')}. Yêu cầu: mọi step PASS/FAIL đều có ảnh (dùng scripts/utils/evidence_recorder.js). TODO không cần.`;
    if (REQUIRE_STEP_EVIDENCE) throw new Error(msg);
    log('WARN', msg);
  } else {
    log('LOG', `Evidence coverage OK: ${executed.length} case execute đều có step-evidence${WITH_EVIDENCE ? ' + case-evidence' : ''}.`);
  }
}

// Điền steps[].status (+ evidence) vào payload import.
//  - test có steps[]/failedStep trong status file  -> theo chi tiết đó (đặc biệt case FAILED: step nào FAILED + evidence step đó);
//  - còn lại: 'pass' -> mọi step PASSED cho test PASSED; 'mirror' -> mọi step = status tổng.
async function applyStepStatuses(tests, client) {
  const hasRaw = (t) => Array.isArray(t._rawSteps) || t._failedStep != null;
  const passFill = (t) => normStatus(t.status) === normStatus(STATUS_PASS);
  const candidates = tests.filter((t) => hasRaw(t) || STEP_STATUS === 'mirror' || (STEP_STATUS === 'pass' && passFill(t)));
  if (!candidates.length) return;
  let stepCountByKey;
  try {
    stepCountByKey = await fetchStepCounts(candidates.map((t) => t.testKey), client);
  } catch (error) {
    log('WARN', `Không đọc được số step từ Xray (${error.message.slice(0, 120)}) → bỏ set step-level, giữ status tổng.`);
    return;
  }
  let filled = 0;
  let failSteps = 0;
  let evCount = 0;
  let noSteps = 0;
  for (const t of candidates) {
    const n = stepCountByKey.get(t.testKey) || 0;
    if (n <= 0) { noSteps += 1; continue; }
    if (Array.isArray(t._rawSteps)) {
      // Test PASSED: step thiếu/pad = PASSED (không phải TODO). Test khác: pad TODO.
      t.steps = buildStepsFromRaw(t._rawSteps, n, passFill(t) ? canonStepStatus(STATUS_PASS) : canonStepStatus('TODO'));
    } else if (t._failedStep != null) {
      t.steps = buildStepsFromFailedIndex(t._failedStep, n, t._failedEvidence);
      failSteps += 1;
    } else {
      const st = STEP_STATUS === 'mirror' ? canonStepStatus(t.status) : canonStepStatus(STATUS_PASS);
      t.steps = Array.from({ length: n }, () => ({ status: st }));
    }
    filled += 1;
    evCount += t.steps.reduce((a, s) => a + ((s.evidences || []).length), 0);
  }
  log('LOG', `Step-level (${STEP_STATUS}): ${filled} test${failSteps ? `, ${failSteps} có step-fail chỉ định` : ''}${evCount ? `, ${evCount} evidence gắn ở step` : ''}${noSteps ? ` (${noSteps} test không có step manual)` : ''}.`);
}

// Từ steps[] chi tiết của status file (positional). Pad tới đúng số step Xray (dư -> cắt, thiếu -> TODO).
function buildStepsFromRaw(rawSteps, n, padStatus) {
  const pad = padStatus || canonStepStatus('TODO');
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const rs = rawSteps[i];
    if (!rs) { out.push({ status: pad }); continue; }
    const step = { status: mapStepStatus(rs.status) };
    if (rs.comment) step.comment = String(rs.comment);
    const ev = buildEvidence(rs.evidence);
    if (ev.length) step.evidences = ev;
    out.push(step);
  }
  if (rawSteps.length > n) log('WARN', `Status file có ${rawSteps.length} step nhưng Xray Test chỉ ${n} — cắt bớt phần dư.`);
  return out;
}

// Từ shortcut failedStep (1-based): trước = PASSED, tại đó = FAILED (+ evidence), sau = TODO (chưa chạy).
function buildStepsFromFailedIndex(failedIdx, n, failedEvidence) {
  const f = Math.max(1, Math.min(n, Number(failedIdx) || 1));
  const out = [];
  for (let i = 1; i <= n; i += 1) {
    if (i < f) { out.push({ status: canonStepStatus(STATUS_PASS) }); continue; }
    if (i === f) {
      const step = { status: canonStepStatus(STATUS_FAIL) };
      const ev = buildEvidence(failedEvidence);
      if (ev.length) step.evidences = ev;
      out.push(step);
      continue;
    }
    out.push({ status: canonStepStatus('TODO') });
  }
  return out;
}

// testKey -> số step (manual) trên Xray, đọc thẳng qua getTests (GraphQL, batch 100):
// dùng jql `key in (...)` + jira(fields:["key"]) để lấy key↔step trong 1 call, không cần Jira search
// (endpoint search/jql không trả về `key` khi giới hạn fields).
async function fetchStepCounts(testKeys, client) {
  const out = new Map();
  const keys = [...new Set(testKeys.filter(Boolean))];
  if (!keys.length) return out;
  for (let i = 0; i < keys.length; i += 100) {
    const batch = keys.slice(i, i + 100);
    const jql = `key in (${batch.join(', ')})`;
    const data = await client.graphql(
      'query($jql:String, $limit:Int!){ getTests(jql:$jql, limit:$limit){ results{ jira(fields:["key"]) steps{ id } } } }',
      { jql, limit: batch.length },
    );
    for (const r of (((data.getTests || {}).results) || [])) {
      const k = r && r.jira && r.jira.key;
      if (k) out.set(k, (r.steps || []).length);
    }
  }
  return out;
}

function printPlan(tests, counts, skipped, unmappedStatus) {
  console.log('\n--- Kế hoạch Test Execution ---');
  console.log(`Tests sẽ push: ${tests.length}`);
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
  if (unmappedStatus.size) console.log(`⚠️  Status không map được (bỏ qua): ${[...unmappedStatus].join(', ')}`);
  if (skipped.length) {
    console.log(`⚠️  Bỏ qua ${skipped.length} TC:`);
    for (const s of skipped.slice(0, 15)) console.log(`   - ${s.tcId}: ${s.reason}`);
    if (skipped.length > 15) console.log(`   ... +${skipped.length - 15} nữa`);
  }
}

function buildReport(execKey, tests, counts, skipped) {
  const lines = [];
  lines.push(`# Xray Test Execution — ${TASK_KEY}`);
  lines.push('');
  lines.push(`- Test Execution: **${execKey}**${JIRA_BASE_URL ? ` (${JIRA_BASE_URL}/browse/${execKey})` : ''}`);
  lines.push(`- Tests: ${tests.length}${RUN_ID ? ` · run ${RUN_ID}` : ''}`);
  for (const [k, v] of Object.entries(counts)) lines.push(`- ${k}: ${v}`);
  if (skipped.length) {
    lines.push('');
    lines.push('## Bỏ qua');
    for (const s of skipped) lines.push(`- ${s.tcId}: ${s.reason}`);
  }
  lines.push('');
  lines.push('## Chi tiết');
  lines.push('| Test | Status |');
  lines.push('|---|---|');
  for (const t of tests) lines.push(`| ${t.testKey} | ${t.status} |`);
  lines.push('');
  return lines.join('\n');
}

// --- Jira REST helpers (dùng axios + buildJiraHeaders) ---
async function jiraGet(pathname, params) {
  const r = await axios.get(`${JIRA_BASE_URL}${pathname}`, { headers: buildJiraHeaders(), params });
  return r.data;
}
// Search JQL (enhanced endpoint, fallback legacy). Trả về {issues:[{key,fields}]}.
async function jiraSearch(jql, fields = 'key', maxResults = 100) {
  try {
    return await jiraGet('/rest/api/3/search/jql', { jql, maxResults, fields });
  } catch (error) {
    return await jiraGet('/rest/api/3/search', { jql, maxResults, fields });
  }
}

// Lần chạy thứ N = số Test Execution đã có của task (theo summary chứa "[TASK_KEY]") + 1.
async function resolveRunNumber() {
  try {
    const jql = `project = "${PROJECT_KEY}" AND issuetype = "${EXEC_ISSUE_TYPE}" AND summary ~ "${TASK_KEY}"`;
    const d = await jiraSearch(jql, 'summary', 100);
    // JQL text-search có thể over-match do tách token dấu gạch → lọc chính xác theo "[TASK_KEY]".
    const n = (d.issues || []).filter((i) => String((i.fields || {}).summary || '').includes(`[${TASK_KEY}]`)).length;
    return n + 1;
  } catch (error) {
    log('WARN', `Không đếm được Test Execution cũ (mặc định Lần #1): ${error.message.slice(0, 120)}`);
    return 1;
  }
}

async function resolveSprintFieldId() {
  if (JIRA_SPRINT_FIELD_ID) return JIRA_SPRINT_FIELD_ID;
  try {
    const fields = await jiraGet('/rest/api/3/field');
    const f = (fields || []).find((x) => /^Sprint$/i.test(x.name || ''));
    return f ? f.id : 'customfield_10020';
  } catch (error) {
    return 'customfield_10020';
  }
}

let _storySprints = null;      // sprint object(s) của Story parent
let _matchedPlanSprint = null; // sprint khớp với Test Plan đã dò
let _fieldIdCache = null;      // id các field cần điền (resolve theo tên)

// Resolve field id theo tên (portable giữa các instance): Sprint / Start date / SAPP - Due date.
async function resolveFieldIds() {
  if (_fieldIdCache) return _fieldIdCache;
  const m = { sprint: 'customfield_10020', startDate: '', dueDate: '', fixVersions: 'fixVersions' };
  try {
    const fields = await jiraGet('/rest/api/3/field');
    for (const f of (fields || [])) {
      const n = String(f.name || '').trim().toLowerCase();
      if (n === 'sprint') m.sprint = f.id;
      else if (n === 'start date') m.startDate = f.id;
      else if (n === 'sapp - due date') m.dueDate = f.id;
    }
  } catch (error) { /* dùng default */ }
  _fieldIdCache = m;
  return m;
}

// Sprint object(s) hiện tại của Story parent (id/name/startDate/endDate/state).
async function resolveSprints() {
  if (_storySprints) return _storySprints;
  const ids = await resolveFieldIds();
  try {
    const d = await jiraGet(`/rest/api/3/issue/${encodeURIComponent(STORY_KEY)}`, { fields: ids.sprint });
    const v = ((d.fields || {})[ids.sprint]) || [];
    const arr = Array.isArray(v) ? v : [v];
    _storySprints = arr
      .filter((s) => s && typeof s === 'object' && s.name)
      .map((s) => ({ id: s.id, name: s.name, startDate: s.startDate, endDate: s.endDate, state: s.state }));
  } catch (error) {
    log('WARN', `Không lấy được sprint của ${STORY_KEY}: ${error.message.slice(0, 120)}`);
    _storySprints = [];
  }
  return _storySprints;
}

// Tự dò Test Plan theo sprint: SAPP đặt Test Plan summary theo convention "[Test Plan] <tên sprint>".
// Test Plan KHÔNG có field fixVersion nên phải khớp bằng summary. Lưu sprint khớp để điền field sau.
async function resolveTestPlanBySprint() {
  const sprints = await resolveSprints();
  for (const sp of sprints) {
    try {
      const jql = `project = "${PROJECT_KEY}" AND issuetype = "${TEST_PLAN_ISSUE_TYPE}" AND summary ~ "${sp.name.replace(/"/g, '\\"')}"`;
      const d = await jiraSearch(jql, 'summary', 20);
      const hit = (d.issues || []).find((i) => String((i.fields || {}).summary || '').toLowerCase().includes(sp.name.toLowerCase()));
      if (hit) {
        _matchedPlanSprint = sp;
        log('LOG', `Tự dò Test Plan theo sprint "${sp.name}": ${hit.key} — "${hit.fields.summary}".`);
        return normalizeIssueKey(hit.key);
      }
    } catch (error) {
      log('WARN', `Dò Test Plan cho sprint "${sp.name}" lỗi: ${error.message.slice(0, 120)}`);
    }
  }
  if (sprints.length) log('WARN', `Không tìm thấy Test Plan khớp sprint (${sprints.map((s) => s.name).join(', ')}). Bỏ link (dùng --test-plan để chỉ định).`);
  return '';
}

// PUT fields: thử cả cụm; lỗi thì thử từng field (tránh 1 field ngoài edit-screen chặn cả cụm).
async function safePutFields(key, fields) {
  const put = async (f) => {
    try { await axios.put(`${JIRA_BASE_URL}/rest/api/3/issue/${encodeURIComponent(key)}`, { fields: f }, { headers: buildJiraHeaders() }); return true; }
    catch (e) { return e; }
  };
  if ((await put(fields)) === true) return Object.keys(fields);
  const done = [];
  for (const [k, v] of Object.entries(fields)) {
    const r = await put({ [k]: v });
    if (r === true) done.push(k);
    else log('WARN', `  field ${k} không set được cho ${key}: ${((r.response && JSON.stringify(r.response.data)) || r.message || '').slice(0, 120)}`);
  }
  return done;
}

// Điền Sprint / Fix versions / Start date / SAPP - Due date cho Test Execution theo Story parent (task).
async function fillExecutionFieldsFromStory(execKey) {
  try {
    const ids = await resolveFieldIds();
    const want = [ids.sprint, 'fixVersions', ids.startDate, ids.dueDate].filter(Boolean);
    const d = await jiraGet(`/rest/api/3/issue/${encodeURIComponent(STORY_KEY)}`, { fields: want.join(',') });
    const sf = d.fields || {};
    const fields = {};
    const spr = sf[ids.sprint];
    if (Array.isArray(spr) && spr.length) { const a = spr.find((s) => s.state === 'active') || spr[spr.length - 1]; if (a && a.id != null) fields[ids.sprint] = Number(a.id); }
    if (Array.isArray(sf.fixVersions) && sf.fixVersions.length) fields.fixVersions = sf.fixVersions.map((v) => ({ id: String(v.id) }));
    if (ids.startDate && sf[ids.startDate]) fields[ids.startDate] = sf[ids.startDate];
    if (ids.dueDate && sf[ids.dueDate]) fields[ids.dueDate] = sf[ids.dueDate];
    if (!Object.keys(fields).length) return;
    const done = await safePutFields(execKey, fields);
    log('LOG', `Điền field Test Execution ${execKey} theo Story ${STORY_KEY}: ${done.join(', ') || '(không set được)'}`);
  } catch (error) { log('WARN', `Không điền được field cho ${execKey}: ${error.message.slice(0, 150)}`); }
}

// Transition Test Execution sang DONE_STATUS SAU khi đã push kết quả (đóng vòng chạy). Bỏ trống/--no-done = giữ nguyên.
// Chỉ chạy ở cuối luồng --write (đã qua guard conclusive + Phase 2 đã QA duyệt) — không tự Done lúc tạo/chưa có kết quả.
async function transitionExecution(execKey) {
  if (!DONE_STATUS || NO_DONE) return;
  try {
    const issue = await jiraGet(`/rest/api/3/issue/${encodeURIComponent(execKey)}`, { fields: 'status' });
    const cur = (((issue.fields || {}).status) || {}).name || '';
    if (normStatus(cur) === normStatus(DONE_STATUS)) { log('LOG', `Test Execution ${execKey} đã ở "${cur}".`); return; }
    const list = (await jiraGet(`/rest/api/3/issue/${encodeURIComponent(execKey)}/transitions`)).transitions || [];
    const match = list.find((t) => normStatus((t.to && t.to.name) || '') === normStatus(DONE_STATUS))
      || list.find((t) => normStatus(t.name) === normStatus(DONE_STATUS));
    if (!match) { log('WARN', `Không có transition tới "${DONE_STATUS}" cho ${execKey} (có: ${list.map((t) => (t.to && t.to.name)).join(', ') || '-'}).`); return; }
    await axios.post(`${JIRA_BASE_URL}/rest/api/3/issue/${encodeURIComponent(execKey)}/transitions`, { transition: { id: match.id } }, { headers: buildJiraHeaders() });
    log('LOG', `Chuyển Test Execution ${execKey} → "${DONE_STATUS}" (đóng vòng chạy).`);
  } catch (error) {
    log('WARN', `Không transition được ${execKey} → "${DONE_STATUS}": ${(error.response ? JSON.stringify(error.response.data) : error.message).slice(0, 140)}`);
  }
}

// Gán assignee cho Test Execution theo JIRA_XRAY_ASSIGNEE (tên/email → accountId). Bỏ trống = không gán.
async function assignExecution(execKey) {
  if (!XRAY_ASSIGNEE) return;
  const id = await resolveJiraAccountId(XRAY_ASSIGNEE);
  if (!id) { log('WARN', `Không resolve được assignee "${XRAY_ASSIGNEE}" → ${execKey} không gán người.`); return; }
  try {
    await axios.put(`${JIRA_BASE_URL}/rest/api/3/issue/${encodeURIComponent(execKey)}/assignee`, { accountId: id }, { headers: buildJiraHeaders() });
    log('LOG', `Gán assignee Test Execution ${execKey} = "${XRAY_ASSIGNEE}".`);
  } catch (error) {
    log('WARN', `Không gán được assignee cho ${execKey}: ${(error.response ? JSON.stringify(error.response.data) : error.message).slice(0, 120)}`);
  }
}

// Điền Sprint / Start date / SAPP - Due date cho Test Plan theo sprint (chỉ khi đang trống, không ghi đè).
async function fillTestPlanFieldsFromSprint(planKey) {
  const sp = _matchedPlanSprint;
  if (!planKey || !sp) return;
  try {
    const ids = await resolveFieldIds();
    const want = [ids.sprint, ids.startDate, ids.dueDate].filter(Boolean);
    const cur = await jiraGet(`/rest/api/3/issue/${encodeURIComponent(planKey)}`, { fields: want.join(',') });
    const cf = cur.fields || {};
    const fields = {};
    if (ids.sprint && !(Array.isArray(cf[ids.sprint]) && cf[ids.sprint].length) && sp.id != null) fields[ids.sprint] = Number(sp.id);
    if (ids.startDate && !cf[ids.startDate] && sp.startDate) fields[ids.startDate] = String(sp.startDate).slice(0, 10);
    if (ids.dueDate && !cf[ids.dueDate] && sp.endDate) fields[ids.dueDate] = String(sp.endDate).slice(0, 10);
    if (!Object.keys(fields).length) return;
    const done = await safePutFields(planKey, fields);
    log('LOG', `Điền field Test Plan ${planKey} theo sprint "${sp.name}": ${done.join(', ') || '(không set được)'}`);
  } catch (error) { log('WARN', `Không điền được field Test Plan ${planKey}: ${error.message.slice(0, 150)}`); }
}

// Version segment for the execution name: explicit override, else the task's
// fixVersions (joined by "/"), else empty (segment dropped).
async function resolveVersion() {
  if (VERSION_OVERRIDE) return VERSION_OVERRIDE;
  try {
    const r = await axios.get(`${JIRA_BASE_URL}/rest/api/3/issue/${encodeURIComponent(STORY_KEY)}`, { headers: buildJiraHeaders(), params: { fields: 'fixVersions' } });
    const names = (((r.data || {}).fields || {}).fixVersions || []).map((v) => v.name).filter(Boolean);
    return names.join('/');
  } catch (error) {
    log('WARN', `Không lấy được fixVersions của ${STORY_KEY}: ${error.message.slice(0, 120)}`);
    return '';
  }
}

// Best-effort: associate the Test Execution with an existing Test Plan via GraphQL
// (used when the pre-create/append path can't rely on info.testPlanKey).
async function linkExecutionToPlan(client, planKey, execId, execKey) {
  try {
    let eid = execId;
    if (!eid) {
      const ej = await axios.get(`${JIRA_BASE_URL}/rest/api/3/issue/${encodeURIComponent(execKey)}`, { headers: buildJiraHeaders(), params: { fields: 'id' } });
      eid = ej.data.id;
    }
    const pj = await axios.get(`${JIRA_BASE_URL}/rest/api/3/issue/${encodeURIComponent(planKey)}`, { headers: buildJiraHeaders(), params: { fields: 'id' } });
    await client.graphql(
      `mutation($p: String!, $e: [String]!) { addTestExecutionsToTestPlan(issueId: $p, testExecIssueIds: $e) { addedTestExecutions warning } }`,
      { p: String(pj.data.id), e: [String(eid)] },
    );
    log('LOG', `Đã gắn ${execKey} vào Test Plan ${planKey}.`);
  } catch (error) {
    log('WARN', `Không gắn được ${execKey} vào Test Plan ${planKey}: ${error.message.slice(0, 160)}`);
  }
}

// Field ids Jira reports as required when the import tried to create the issue.
function parseMissingCustomFields(message) {
  const ids = String(message || '').match(/customfield_\d+/g) || [];
  return [...new Set(ids)];
}

// Create the Test Execution issue via Jira REST with the required custom fields
// (copied from a reference Test issue, overridable by JIRA_EXECUTION_EXTRA_FIELDS).
async function preCreateTestExecution(info, missingFieldIds, referenceKey) {
  const copied = {};
  if (missingFieldIds.length && referenceKey) {
    try {
      const ref = await axios.get(`${JIRA_BASE_URL}/rest/api/3/issue/${encodeURIComponent(referenceKey)}`, {
        headers: buildJiraHeaders(),
        params: { fields: missingFieldIds.join(',') },
      });
      const src = (ref.data && ref.data.fields) || {};
      for (const id of missingFieldIds) {
        if (src[id] != null) copied[id] = sanitizeFieldValue(src[id]);
      }
    } catch (error) {
      log('WARN', `Không copy được field bắt buộc từ ${referenceKey}: ${error.message}`);
    }
  }
  const fields = {
    project: { key: PROJECT_KEY },
    issuetype: { name: EXEC_ISSUE_TYPE },
    summary: info.summary,
    ...copied,
    ...EXTRA_FIELDS, // env override wins
  };
  const missingAfter = missingFieldIds.filter((id) => fields[id] == null);
  if (missingAfter.length) {
    throw new Error(`Không dựng được field bắt buộc ${missingAfter.join(', ')} cho Test Execution. Set JIRA_EXECUTION_EXTRA_FIELDS (JSON) hoặc kiểm tra reference test ${referenceKey}.`);
  }
  try {
    const res = await axios.post(`${JIRA_BASE_URL}/rest/api/3/issue`, { fields }, { headers: buildJiraHeaders() });
    return res.data;
  } catch (error) {
    const detail = error.response ? JSON.stringify(error.response.data).slice(0, 300) : error.message;
    throw new Error(`Tạo Test Execution issue lỗi: ${detail}`);
  }
}

// Reduce a field value read from Jira into the shape accepted on create
// ({id}/{value}/{key} for options; arrays mapped element-wise).
function sanitizeFieldValue(value) {
  if (Array.isArray(value)) return value.map(sanitizeFieldValue);
  if (value && typeof value === 'object') {
    if (value.id != null) return { id: String(value.id) };
    if (value.value != null) return { value: value.value };
    if (value.key != null) return { key: value.key };
  }
  return value;
}

function parseJsonObject(raw) {
  const v = String(raw || '').trim();
  if (!v) return {};
  try {
    const parsed = JSON.parse(v);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    log('WARN', 'JIRA_EXECUTION_EXTRA_FIELDS/JIRA_TESTCASE_EXTRA_FIELDS không phải JSON object hợp lệ — bỏ qua.');
    return {};
  }
}

// ---- helpers ----

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const [rawKey, inlineValue] = token.slice(2).split('=', 2);
    if (inlineValue !== undefined) { out[rawKey] = inlineValue; continue; }
    const next = argv[i + 1];
    out[rawKey] = next && !next.startsWith('--') ? argv[++i] : true;
  }
  return out;
}
function argString(key) { return typeof args[key] === 'string' ? args[key].trim() : ''; }
function argFlag(key) { return args[key] === true || args[key] === 'true'; }
function resolvePath(p) { return !p ? p : (path.isAbsolute(p) ? p : path.resolve(REPO_ROOT, p)); }
function relativeToRepo(p) { return path.relative(REPO_ROOT, p).replace(/\\/g, '/'); }
function stripTrailingSlash(v) { return String(v || '').replace(/\/+$/, ''); }
function normalizeIssueKey(v) { return String(v || '').trim().toUpperCase(); }
function normalizeProjectKey(v) { return String(v || '').trim().toUpperCase(); }
function deriveProjectKey(k) { const m = String(k || '').match(/^([A-Z][A-Z0-9]+)-\d+$/i); return m ? m[1].toUpperCase() : ''; }
function splitList(v) { return String(v || '').split(',').map((s) => s.trim()).filter(Boolean); }
function escapeJql(v) { return String(v || '').replace(/"/g, '\\"'); }
function normStatus(s) { return String(s || '').toUpperCase().replace(/\s+/g, ''); }
function labelFor(v) {
  return String(v || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 255);
}

function getXrayClient() {
  if (!xrayClient) {
    xrayClient = new XrayCloudClient({ clientId: XRAY_CLIENT_ID, clientSecret: XRAY_CLIENT_SECRET, baseUrl: XRAY_CLOUD_BASE_URL });
  }
  return xrayClient;
}
