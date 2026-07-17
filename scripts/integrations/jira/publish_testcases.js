#!/usr/bin/env node

const fs = require('fs');
const https = require('https');
const path = require('path');

let ExcelJS;
try {
  ExcelJS = require('exceljs');
} catch {
  console.error('Missing dependency: exceljs. Run `npm install` at the repo root.');
  process.exit(1);
}

const {
  getProjectOutputDir,
  getTaskKey,
  getTaskOutputDir,
  loadEnv,
  resolveJiraAccountId,
} = require('./utils');
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
const TESTCASES_DIR = resolvePath(argString('testcases') || path.join(TASK_OUTPUT_DIR, 'test-cases'));
const REPORT_DIR = resolvePath(argString('report-dir') || path.join(TASK_OUTPUT_DIR, 'reports'));
const EXCEL_INPUT = argString('excel') || argString('xlsx') || '';
const STORY_KEY = normalizeIssueKey(argString('story') || process.env.JIRA_STORY_KEY || TASK_KEY);
const PROJECT_KEY = normalizeProjectKey(argString('project') || process.env.JIRA_PROJECT_KEY || deriveProjectKey(STORY_KEY));
const TEST_MANAGEMENT_TOOL = normalizeTool(
  argString('test-management-tool') ||
    process.env.TEST_MANAGEMENT_TOOL ||
    process.env.JIRA_TEST_MANAGEMENT_TOOL ||
    'xray',
);
const DEFAULT_ISSUE_TYPE = TEST_MANAGEMENT_TOOL === 'xray' ? 'Test' : 'Test Case';
const ISSUE_TYPE = argString('issue-type') || process.env.JIRA_TESTCASE_ISSUE_TYPE || DEFAULT_ISSUE_TYPE;
const PARENT_MODE = (argString('parent-mode') || process.env.JIRA_TESTCASE_PARENT_MODE || 'auto').toLowerCase();
const DRY_RUN = argFlag('publish') || argFlag('no-dry-run')
  ? false
  : argFlag('dry-run') || process.env.JIRA_TESTCASE_DRY_RUN === '1';
const QA_APPROVED = argFlag('qa-approved') || process.env.JIRA_TESTCASE_QA_APPROVED === '1';
const DEDUP = !argFlag('no-dedup') && process.env.JIRA_TESTCASE_DEDUP !== '0';
const LIMIT = Number.parseInt(argString('limit') || process.env.JIRA_TESTCASE_LIMIT || '0', 10) || 0;
const ONLY_TCS = splitList(argString('only') || process.env.JIRA_TESTCASE_ONLY || '').map((s) => s.trim().toLowerCase());
const XRAY_TEST_TYPE = argString('xray-test-type') || process.env.XRAY_TEST_TYPE || 'Manual';
const XRAY_TEST_TYPE_FIELD_ID = argString('xray-test-type-field') || process.env.XRAY_TEST_TYPE_FIELD_ID || '';
const XRAY_TEST_TYPE_FIELD_MODE = (argString('xray-test-type-field-mode') || process.env.XRAY_TEST_TYPE_FIELD_MODE || 'option').toLowerCase();
const XRAY_REQUIREMENT_LINK_ENABLED = argFlag('no-link-requirement')
  ? false
  : argFlag('link-requirement') ||
    process.env.XRAY_REQUIREMENT_LINK_ENABLED === '1' ||
    (TEST_MANAGEMENT_TOOL === 'xray' && process.env.XRAY_REQUIREMENT_LINK_ENABLED !== '0');
const XRAY_REQUIREMENT_LINK_TYPE =
  argString('requirement-link-type') ||
  process.env.XRAY_REQUIREMENT_LINK_TYPE ||
  process.env.JIRA_TESTCASE_REQUIREMENT_LINK_TYPE ||
  'Test';
const XRAY_REQUIREMENT_LINK_DIRECTION =
  (argString('requirement-link-direction') || process.env.XRAY_REQUIREMENT_LINK_DIRECTION || 'test_to_story').toLowerCase();
const XRAY_TEST_SET_ENABLED =
  argFlag('with-test-set') ||
  argFlag('with-test-sets') ||
  process.env.XRAY_TEST_SET_ENABLED === '1';
const XRAY_TEST_SET_ISSUE_TYPE = argString('test-set-issue-type') || process.env.XRAY_TEST_SET_ISSUE_TYPE || 'Test Set';
const XRAY_TEST_SET_SUMMARY_PREFIX = argString('test-set-summary-prefix') || process.env.XRAY_TEST_SET_SUMMARY_PREFIX || '[Test Set]';
const XRAY_TEST_SET_LINK_ENABLED = argFlag('no-link-test-set')
  ? false
  : argFlag('link-test-set') || process.env.XRAY_TEST_SET_LINK_ENABLED === '1' || XRAY_TEST_SET_ENABLED;
const XRAY_TEST_SET_LINK_TYPE =
  argString('test-set-link-type') ||
  process.env.XRAY_TEST_SET_LINK_TYPE ||
  XRAY_REQUIREMENT_LINK_TYPE ||
  'Test';
const XRAY_TEST_SET_LINK_DIRECTION =
  (argString('test-set-link-direction') || process.env.XRAY_TEST_SET_LINK_DIRECTION || 'testset_to_test').toLowerCase();
const XRAY_TEST_SET_STORY_LINK_ENABLED = argFlag('no-link-test-set-story')
  ? false
  : argFlag('link-test-set-story') ||
    process.env.XRAY_TEST_SET_STORY_LINK_ENABLED === '1' ||
    (XRAY_TEST_SET_ENABLED && XRAY_REQUIREMENT_LINK_ENABLED && process.env.XRAY_TEST_SET_STORY_LINK_ENABLED !== '0');
const XRAY_TEST_SET_LABELS = splitList(argString('test-set-labels') || process.env.XRAY_TEST_SET_LABELS || '');

const JIRA_BASE_URL = stripTrailingSlash(process.env.JIRA_BASE_URL || process.env.JIRA_URL || '');
const JIRA_EMAIL = process.env.JIRA_EMAIL || process.env.JIRA_USERNAME || '';
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN || '';
const JIRA_PAT = process.env.JIRA_PAT || '';
const EXTRA_LABELS = splitList(argString('labels') || process.env.JIRA_TESTCASE_LABELS || '');
const EXTRA_FIELDS = parseExtraFields(argString('extra-fields') || process.env.JIRA_TESTCASE_EXTRA_FIELDS || '');
// Field kế thừa TỪ Story cha khi tạo Test/Precondition/Test Set (thay vì hardcode theo config).
// Mặc định: Sub-Projects (customfield_10037) + SAPP Board (customfield_10039) → testcase luôn theo đúng
// sản phẩm/board của Task cha (LMS/OPs/QLVH/FinHub), giống cách Test Execution/Test Plan copy từ Story.
// Giá trị kế thừa GHI ĐÈ JIRA_TESTCASE_EXTRA_FIELDS cho các field trùng; EXTRA_FIELDS chỉ còn là fallback
// (khi Story không có giá trị / cho field required khác). Tắt: --no-inherit-story-fields hoặc
// JIRA_TESTCASE_INHERIT_STORY_FIELDS=none. Đổi danh sách: --inherit-story-fields "cf_a,cf_b".
const INHERIT_STORY_FIELD_IDS = (() => {
  if (argFlag('no-inherit-story-fields')) return [];
  const raw = argString('inherit-story-fields') || process.env.JIRA_TESTCASE_INHERIT_STORY_FIELDS || 'customfield_10037,customfield_10039';
  if (/^(none|off|0)$/i.test(raw.trim())) return [];
  return splitList(raw).map((s) => s.trim()).filter(Boolean);
})();
let INHERITED_FIELDS = {};
// Assignee cho mỗi Xray Test (QA điền tên/email vào JIRA_XRAY_ASSIGNEE ở task.env). Bỏ trống = không gán.
const XRAY_ASSIGNEE = argString('assignee') || process.env.JIRA_XRAY_ASSIGNEE || '';
let assigneeAccountId = null; // resolve 1 lần trong main() rồi dùng cho mọi Test

// Xray Cloud: push manual steps (Action/Data/Expected) into the native "Test details"
// panel. Requires an Xray API Key (XRAY_CLIENT_ID + XRAY_CLIENT_SECRET) — the Jira
// API token cannot write Xray steps.
const XRAY_PUSH_STEPS = argFlag('push-xray-steps') || process.env.XRAY_PUSH_STEPS === '1';
const XRAY_PUSH_PRECONDITIONS = argFlag('push-xray-preconditions') || process.env.XRAY_PUSH_PRECONDITIONS === '1';
const XRAY_PRECONDITION_ISSUE_TYPE = argString('precondition-issue-type') || process.env.XRAY_PRECONDITION_ISSUE_TYPE || 'Precondition';
const XRAY_TEST_REPO_FOLDER = normalizeFolderPath(argString('test-repo-folder') || process.env.XRAY_TEST_REPO_FOLDER || '');
const XRAY_SUBFOLDER_BY_SHEET = argFlag('subfolder-by-sheet') || process.env.XRAY_TEST_REPO_SUBFOLDER_BY_SHEET === '1';
// Sheet KHÔNG push làm Test: Summary + Test Cases (canonical, đọc riêng) + Preconditions (sheet tiền
// điều kiện; dữ liệu precondition lấy từ cột của TC). Giữ "Setup Contracts" (tên cũ) để backward-compat.
const XRAY_SHEET_EXCLUDE = splitList(argString('sheet-exclude') || process.env.XRAY_TESTCASE_SHEET_EXCLUDE || 'Summary,Test Cases,Preconditions,Setup Contracts');
const XRAY_PRECONDITION_FOLDER = normalizeFolderPath(argString('precondition-folder') || process.env.XRAY_PRECONDITION_FOLDER || '');
const XRAY_CLIENT_ID = process.env.XRAY_CLIENT_ID || '';
const XRAY_CLIENT_SECRET = process.env.XRAY_CLIENT_SECRET || '';
const XRAY_CLOUD_BASE_URL = process.env.XRAY_CLOUD_BASE_URL || process.env.XRAY_API_BASE_URL || 'https://xray.cloud.getxray.app';
const testSetCache = new Map();
const preconditionCache = new Map(); // precondition code -> { id, key, action, definition }
const preconditionWarnings = [];
let xrayClient = null;
let cachedProjectId = null;

main().catch((error) => {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
});

async function main() {
  const excelFiles = resolveExcelFiles();
  if (excelFiles.length === 0) {
    throw new Error(`No testcase Excel files found under ${TESTCASES_DIR}.`);
  }

  const testcases = await readTestcasesFromExcelFiles(excelFiles);
  if (testcases.length === 0) {
    throw new Error('No testcase rows found. Expected a sheet named "Test Cases" or a sheet with a "TC ID" header.');
  }

  validateForPublish();

  if (XRAY_ASSIGNEE) {
    assigneeAccountId = await resolveJiraAccountId(XRAY_ASSIGNEE);
    if (assigneeAccountId) console.log(`Assignee cho Test = "${XRAY_ASSIGNEE}".`);
    else console.warn(`WARN: Không resolve được assignee "${XRAY_ASSIGNEE}" → Test tạo không gán người.`);
  }

  await loadInheritedStoryFields();

  let selected = LIMIT > 0 ? testcases.slice(0, LIMIT) : testcases;
  if (ONLY_TCS.length) selected = selected.filter((tc) => ONLY_TCS.includes(String(tc.tcId).toLowerCase()));
  const results = [];
  const folderMap = new Map();
  for (const testcase of selected) {
    const payload = buildIssuePayload(testcase);
    const plannedTestSet = XRAY_TEST_SET_ENABLED ? buildPlannedTestSetInfo(testcase) : null;
    const item = {
      tcId: testcase.tcId,
      summary: payload.fields.summary,
      sourceExcel: relativeToRepo(testcase.sourceExcel),
      dryRun: DRY_RUN,
      action: DRY_RUN ? 'planned' : 'pending',
      issueKey: '',
      existingIssueKey: '',
      linkedStoryKey: DRY_RUN && XRAY_REQUIREMENT_LINK_ENABLED ? STORY_KEY : '',
      linkAction: DRY_RUN && XRAY_REQUIREMENT_LINK_ENABLED ? 'planned' : '',
      testSet: plannedTestSet,
      error: '',
      payload,
    };

    if (DRY_RUN) {
      results.push(item);
      continue;
    }

    try {
      let testIssueKey = '';
      if (DEDUP) {
        const existingIssue = await findExistingIssue(testcase);
        if (existingIssue) {
          item.action = 'skipped_existing';
          item.existingIssueKey = existingIssue.key;
          testIssueKey = existingIssue.key;
          await linkTestToStory(testIssueKey, item);
          await assignTestToBusinessFlowTestSet(testcase, testIssueKey, existingIssue.id, item);
          await syncXraySteps(existingIssue.id, testcase, item);
          await syncPrecondition(existingIssue.id, testcase, item);
          await refreshExistingFields(testIssueKey, testcase, item);
          addToFolderMap(folderMap, testFolderPath(testcase), existingIssue.id);
          results.push(item);
          continue;
        }
      }

      const created = await createJiraIssue(payload);
      item.action = 'created';
      item.issueKey = created.key || '';
      testIssueKey = item.issueKey;
      await linkTestToStory(testIssueKey, item);
      await assignTestToBusinessFlowTestSet(testcase, testIssueKey, created.id, item);
      await syncXraySteps(created.id, testcase, item);
      await syncPrecondition(created.id, testcase, item);
      addToFolderMap(folderMap, testFolderPath(testcase), created.id);
      results.push(item);
    } catch (error) {
      item.action = 'error';
      item.error = error.message;
      results.push(item);
    }
  }

  const folderSummary = await assignTestsToRepoFolder(folderMap);
  const preconditionFolderSummary = await assignPreconditionsToFolder();

  writeReports({ excelFiles, totalRows: testcases.length, selectedCount: selected.length, results, folderSummary, preconditionFolderSummary });

  const errors = results.filter((item) => item.action === 'error');
  const created = results.filter((item) => item.action === 'created');
  const skipped = results.filter((item) => item.action === 'skipped_existing');
  const planned = results.filter((item) => item.action === 'planned');
  const linked = results.filter((item) => item.linkAction === 'linked');
  const linkExisting = results.filter((item) => item.linkAction === 'existing');
  const linkErrors = results.filter((item) => item.linkAction === 'error');
  const stepsSynced = results.filter((item) => item.stepsAction === 'synced');
  const stepsErrors = results.filter((item) => item.stepsAction === 'error');
  const preTestsAssociated = results.filter((item) => item.preconditionAction === 'created' || item.preconditionAction === 'linked');
  const preErrors = results.filter((item) => item.preconditionAction === 'error');
  const preUniqueCreated = [...preconditionCache.values()].filter((p) => p.action === 'created').length;
  const preUniqueExisting = [...preconditionCache.values()].filter((p) => p.action === 'existing').length;
  const testSetItems = results.map((item) => item.testSet).filter(Boolean);
  const testSetCounts = countBy(testSetItems, 'action');
  const testSetLinkCounts = countBy(testSetItems, 'linkAction');
  const testSetStoryLinkCounts = countBy(testSetItems, 'storyLinkAction');
  const testSetErrors = testSetItems.filter((item) => item.action === 'error' || item.linkAction === 'error' || item.storyLinkAction === 'error');

  console.log(`Jira testcase publish ${DRY_RUN ? 'dry-run' : 'run'} complete.`);
  console.log(`Excel files: ${excelFiles.length}`);
  console.log(`Testcases: ${selected.length}/${testcases.length}`);
  console.log(`Planned: ${planned.length}, Created: ${created.length}, Existing skipped: ${skipped.length}, Errors: ${errors.length}`);
  if (XRAY_REQUIREMENT_LINK_ENABLED) {
    console.log(`Story links: linked=${linked.length}, existing=${linkExisting.length}, errors=${linkErrors.length}`);
  }
  if (XRAY_PUSH_STEPS) {
    console.log(`Xray steps: synced=${stepsSynced.length}, errors=${stepsErrors.length}`);
  }
  if (XRAY_PUSH_PRECONDITIONS) {
    console.log(`Xray preconditions: unique created=${preUniqueCreated}, reused=${preUniqueExisting}, tests associated=${preTestsAssociated.length}, errors=${preErrors.length}`);
    if (preconditionWarnings.length) {
      console.log(`Precondition warnings: ${unique(preconditionWarnings).length}`);
      unique(preconditionWarnings).forEach((w) => console.log(`  - ${w}`));
    }
  }
  if (folderSummary && folderSummary.enabled) {
    console.log(`Test Repository folders: base="${folderSummary.base}" folders=${folderSummary.folders}, tests assigned=${folderSummary.assigned}${folderSummary.error ? ` | ERROR: ${folderSummary.error}` : ''}`);
  }
  if (preconditionFolderSummary && preconditionFolderSummary.enabled) {
    console.log(`Precondition folder: "${preconditionFolderSummary.path}" assigned=${preconditionFolderSummary.assigned}${preconditionFolderSummary.error ? ` | ERROR: ${preconditionFolderSummary.error}` : ''}`);
  }
  if (XRAY_TEST_SET_ENABLED) {
    console.log(`Test Sets: planned=${testSetCounts.planned || 0}, created=${testSetCounts.created || 0}, existing=${testSetCounts.existing || 0}, cached=${testSetCounts.cached || 0}, errors=${testSetErrors.length}`);
    console.log(`Test Set links: linked=${testSetLinkCounts.linked || 0}, existing=${testSetLinkCounts.existing || 0}, planned=${testSetLinkCounts.planned || 0}, errors=${testSetLinkCounts.error || 0}`);
    console.log(`Test Set story links: linked=${testSetStoryLinkCounts.linked || 0}, existing=${testSetStoryLinkCounts.existing || 0}, planned=${testSetStoryLinkCounts.planned || 0}, errors=${testSetStoryLinkCounts.error || 0}`);
  }
  console.log(`Report: ${path.join(REPORT_DIR, 'jira-testcase-publish-summary.md')}`);

  const folderError = (folderSummary && folderSummary.enabled && folderSummary.error)
    || (preconditionFolderSummary && preconditionFolderSummary.enabled && preconditionFolderSummary.error);
  if (errors.length > 0 || linkErrors.length > 0 || testSetErrors.length > 0 || stepsErrors.length > 0 || preErrors.length > 0 || folderError) process.exitCode = 1;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;

    const [rawKey, inlineValue] = token.slice(2).split('=', 2);
    if (inlineValue !== undefined) {
      out[rawKey] = inlineValue;
      continue;
    }

    const next = argv[i + 1];
    out[rawKey] = next && !next.startsWith('--') ? argv[++i] : true;
  }
  return out;
}

function argString(key) {
  return typeof args[key] === 'string' ? args[key].trim() : '';
}

function argFlag(key) {
  return args[key] === true || args[key] === 'true';
}

function resolvePath(filePath) {
  if (!filePath) return filePath;
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function relativeToRepo(filePath) {
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
}

function stripTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function normalizeIssueKey(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeProjectKey(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeTool(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['xray', 'xrays'].includes(normalized)) return 'xray';
  return normalized || 'jira';
}

function deriveProjectKey(issueKey) {
  const match = String(issueKey || '').match(/^([A-Z][A-Z0-9]+)-\d+$/i);
  return match ? match[1].toUpperCase() : '';
}

function splitList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveExcelFiles() {
  if (EXCEL_INPUT) {
    const inputPath = resolvePath(EXCEL_INPUT);
    if (!fs.existsSync(inputPath)) throw new Error(`Excel input not found: ${inputPath}`);
    const stat = fs.statSync(inputPath);
    if (stat.isDirectory()) return scanExcelDir(inputPath);
    return [inputPath];
  }

  return scanExcelDir(TESTCASES_DIR);
}

function scanExcelDir(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath)
    .filter((name) => /\.xlsx$/i.test(name) && !name.startsWith('~$'))
    .map((name) => path.join(dirPath, name))
    .sort((a, b) => a.localeCompare(b));
}

async function readTestcasesFromExcelFiles(excelFiles) {
  const byTcId = new Map();

  for (const excelFile of excelFiles) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(excelFile);
    const sheet = findTestcaseSheet(workbook);
    if (!sheet) continue;

    const headerInfo = findHeaderRow(sheet);
    if (!headerInfo) continue;

    const { headerRowNumber, headers, indexes } = headerInfo;
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber <= headerRowNumber) return;
      const cells = headers.map((_, index) => cellText(row.getCell(index + 1)));
      const tcId = cells[indexes.tcId] || '';
      if (!tcId.trim()) return;

      const testcase = {
        tcId: tcId.trim(),
        functionGroup: indexes.functionGroup >= 0 ? (cells[indexes.functionGroup] || '') : '',
        module: cells[indexes.module] || '',
        title: cells[indexes.title] || '',
        precondition: cells[indexes.precondition] || '',
        testData: cells[indexes.testData] || '',
        steps: cells[indexes.steps] || '',
        expected: cells[indexes.expected] || '',
        priority: cells[indexes.priority] || '',
        risk: cells[indexes.risk] || '',
        sourceExcel: excelFile,
        sourceSheet: sheet.name,
      };

      if (!byTcId.has(testcase.tcId)) byTcId.set(testcase.tcId, testcase);
    });

    if (XRAY_SUBFOLDER_BY_SHEET) tagFunctionSheets(workbook, sheet.name, byTcId);
  }

  return Array.from(byTcId.values());
}

// Tag each testcase with the function sheet it appears in, so it can be filed
// into a matching Test Repository subfolder. Excludes Summary/Test Cases/Setup sheets.
function tagFunctionSheets(workbook, primarySheetName, byTcId) {
  const exclude = new Set([primarySheetName, ...XRAY_SHEET_EXCLUDE].map((s) => s.trim().toLowerCase()));
  for (const sheet of workbook.worksheets) {
    if (exclude.has(sheet.name.trim().toLowerCase())) continue;
    const headerInfo = findHeaderRow(sheet);
    if (!headerInfo) continue;
    const { headerRowNumber, headers, indexes } = headerInfo;
    if (indexes.tcId < 0) continue;
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber <= headerRowNumber) return;
      const tcId = cellText(row.getCell(indexes.tcId + 1)).trim();
      if (!tcId) return;
      const testcase = byTcId.get(tcId);
      if (testcase && !testcase.functionSheet) testcase.functionSheet = sheet.name.trim();
    });
  }
}

function findTestcaseSheet(workbook) {
  const named = workbook.getWorksheet('Test Cases');
  if (named && findHeaderRow(named)) return named;

  for (const sheet of workbook.worksheets) {
    if (findHeaderRow(sheet)) return sheet;
  }
  return null;
}

function findHeaderRow(sheet) {
  for (let rowNumber = 1; rowNumber <= Math.min(20, sheet.rowCount); rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const headers = [];
    for (let col = 1; col <= Math.max(row.cellCount, 12); col += 1) {
      headers.push(cellText(row.getCell(col)));
    }

    const indexes = mapHeaders(headers);
    if (indexes.tcId >= 0 && indexes.title >= 0) return { headerRowNumber: rowNumber, headers, indexes };
  }
  return null;
}

function cellText(cell) {
  if (!cell) return '';
  if (cell.text) return String(cell.text).trim();

  const value = cell.value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || '').join('').trim();
    if (value.text) return String(value.text).trim();
    if (value.result !== undefined) return String(value.result).trim();
    if (value.hyperlink && value.text) return String(value.text).trim();
  }
  return String(value).trim();
}

function normalizeHeaderName(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'D')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function mapHeaders(headers) {
  const normalized = headers.map(normalizeHeaderName);
  return {
    tcId: findHeader(normalized, ['tc id', 'id']),
    functionGroup: findHeader(normalized, ['nhom chuc nang', 'chuc nang', 'function group']),
    module: findHeader(normalized, ['module', 'phan he']),
    title: findHeader(normalized, ['truong hop kiem thu', 'test case', 'scenario', 'test title']),
    precondition: findHeader(normalized, ['tien dieu kien', 'precondition', 'pre condition']),
    testData: findHeader(normalized, ['du lieu test', 'test data', 'data']),
    steps: findHeader(normalized, ['cac buoc thuc hien', 'buoc thuc hien', 'steps', 'test steps']),
    expected: findHeader(normalized, ['ket qua mong doi', 'expected result', 'expected']),
    priority: findHeader(normalized, ['uu tien', 'priority']),
    risk: findHeader(normalized, ['muc do rui ro', 'risk']),
  };
}

function findHeader(normalizedHeaders, candidates) {
  return normalizedHeaders.findIndex((header) => candidates.some((candidate) => header === candidate || header.includes(candidate)));
}

function validateForPublish() {
  if (!PROJECT_KEY) throw new Error('Missing Jira project key. Set JIRA_PROJECT_KEY or pass --project <KEY>.');
  if (!STORY_KEY) throw new Error('Missing Jira story key. Set JIRA_STORY_KEY or pass --story <KEY>.');
  if (DRY_RUN) return;

  if (!QA_APPROVED) {
    throw new Error('Missing QA approval. Pass --qa-approved or set JIRA_TESTCASE_QA_APPROVED=1 before publishing real Jira issues.');
  }
  if (!JIRA_BASE_URL) throw new Error('Missing JIRA_BASE_URL or JIRA_URL.');
  if (!JIRA_PAT && (!JIRA_EMAIL || !JIRA_API_TOKEN)) {
    throw new Error('Missing Jira auth. Set JIRA_EMAIL + JIRA_API_TOKEN, or JIRA_PAT.');
  }
}

function buildIssuePayload(testcase) {
  // Label tối giản: task-* và tc-* bắt buộc cho dedup; automation-testcase là marker.
  // Không gắn xray/group/layer/risk/priority (đã có Test Set, field Priority native, description).
  const labels = unique([
    'automation-testcase',
    labelFor(`task-${TASK_KEY}`),
    labelFor(`tc-${testcase.tcId}`),
    ...EXTRA_LABELS.map(labelFor),
  ]).filter(Boolean);

  const fields = {
    project: { key: PROJECT_KEY },
    issuetype: { name: ISSUE_TYPE },
    // Summary chỉ là tên mô tả; TC ID nằm ở description + label tc-*, và Test đã ở trong subfolder.
    summary: truncate(testcase.title || testcase.module || `Testcase ${testcase.tcId}`, 255),
    description: testcaseToAdf(testcase),
    labels,
  };

  const priority = normalizePriority(testcase.priority);
  if (priority) fields.priority = { name: priority };
  if (shouldSetParent()) fields.parent = { key: STORY_KEY };
  if (assigneeAccountId) fields.assignee = { accountId: assigneeAccountId };
  applyXrayFields(fields);
  Object.assign(fields, EXTRA_FIELDS, INHERITED_FIELDS);

  return { fields };
}

function parseExtraFields(raw) {
  const value = String(raw || '').trim();
  if (!value) return {};
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(`Invalid JIRA_TESTCASE_EXTRA_FIELDS JSON: ${error.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('JIRA_TESTCASE_EXTRA_FIELDS must be a JSON object mapping field id to value.');
  }
  return parsed;
}

// Chuẩn hoá giá trị field đọc từ Story về dạng dùng được khi tạo/PUT issue ([{id}] cho multi-select,
// {id} cho single-select, giữ nguyên scalar). Trả null nếu Story bỏ trống field đó.
function normalizeInheritedValue(v) {
  if (v == null) return null;
  if (Array.isArray(v)) {
    const arr = v.map((x) => (x && x.id != null ? { id: String(x.id) } : null)).filter(Boolean);
    return arr.length ? arr : null;
  }
  if (typeof v === 'object' && v.id != null) return { id: String(v.id) };
  if (typeof v === 'object') return null; // object lạ không có id → bỏ qua cho an toàn
  return v;
}

// Đọc các field cần kế thừa từ Story cha đúng 1 lần → INHERITED_FIELDS (áp cho Test/Precondition/Test Set).
async function loadInheritedStoryFields() {
  if (!INHERIT_STORY_FIELD_IDS.length || !STORY_KEY) return;
  try {
    const d = await requestJson('GET', `/rest/api/3/issue/${encodeURIComponent(STORY_KEY)}?fields=${INHERIT_STORY_FIELD_IDS.join(',')}`, null);
    const sf = (d && d.fields) || {};
    const out = {};
    for (const id of INHERIT_STORY_FIELD_IDS) {
      const nv = normalizeInheritedValue(sf[id]);
      if (nv != null) out[id] = nv;
    }
    INHERITED_FIELDS = out;
    const names = Object.keys(out);
    if (names.length) {
      console.log(`Kế thừa field từ Story ${STORY_KEY}: ${names.join(', ')} → Test/Precondition/Test Set theo đúng sản phẩm của Story (ghi đè JIRA_TESTCASE_EXTRA_FIELDS).`);
    } else {
      console.warn(`WARN: Story ${STORY_KEY} không có giá trị cho field kế thừa (${INHERIT_STORY_FIELD_IDS.join(', ')}) → dùng JIRA_TESTCASE_EXTRA_FIELDS làm fallback.`);
    }
  } catch (error) {
    console.warn(`WARN: Không đọc được field kế thừa từ Story ${STORY_KEY}: ${error.message.slice(0, 150)} → fallback JIRA_TESTCASE_EXTRA_FIELDS.`);
  }
}

function getXrayClient() {
  if (!isUsableCreds(XRAY_CLIENT_ID, XRAY_CLIENT_SECRET)) {
    throw new Error('XRAY_PUSH_STEPS is enabled but XRAY_CLIENT_ID/XRAY_CLIENT_SECRET are missing or still placeholders. Set a real Xray Cloud API key.');
  }
  if (!xrayClient) {
    xrayClient = new XrayCloudClient({
      clientId: XRAY_CLIENT_ID,
      clientSecret: XRAY_CLIENT_SECRET,
      baseUrl: XRAY_CLOUD_BASE_URL,
    });
  }
  return xrayClient;
}

async function syncXraySteps(issueId, testcase, item) {
  if (!XRAY_PUSH_STEPS) {
    item.stepsAction = 'disabled';
    return;
  }
  if (!issueId) {
    item.stepsAction = 'error';
    item.error = item.error ? `${item.error}; Xray steps: missing issue id` : 'Xray steps: missing issue id';
    return;
  }
  try {
    const client = getXrayClient();
    const steps = buildXraySteps(testcase);
    const res = await client.syncManualSteps(issueId, steps, { testType: XRAY_TEST_TYPE });
    item.stepsAction = 'synced';
    item.stepsCount = res.added;
  } catch (error) {
    item.stepsAction = 'error';
    item.error = item.error ? `${item.error}; Xray steps: ${error.message}` : `Xray steps: ${error.message}`;
  }
}

function appendError(existing, message) {
  return existing ? `${existing}; ${message}` : message;
}

function normalizeFolderPath(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const withSlash = raw.startsWith('/') ? raw : `/${raw}`;
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, '') : withSlash;
}

async function resolveProjectId() {
  if (cachedProjectId) return cachedProjectId;
  const project = await requestJson('GET', `/rest/api/3/project/${encodeURIComponent(PROJECT_KEY)}`);
  if (!project || !project.id) throw new Error(`Cannot resolve project id for ${PROJECT_KEY}.`);
  cachedProjectId = String(project.id);
  return cachedProjectId;
}

// Target Test Repository folder for a testcase: base + "/<function sheet>" when
// subfolder-by-sheet is on and the sheet is known, else the base folder.
function testFolderPath(testcase) {
  if (!XRAY_TEST_REPO_FOLDER) return '';
  if (XRAY_SUBFOLDER_BY_SHEET && testcase.functionSheet) {
    return `${XRAY_TEST_REPO_FOLDER}/${testcase.functionSheet}`;
  }
  return XRAY_TEST_REPO_FOLDER;
}

function addToFolderMap(map, folderPath, issueId) {
  if (!folderPath || !issueId) return;
  if (!map.has(folderPath)) map.set(folderPath, []);
  map.get(folderPath).push(issueId);
}

// Create every ancestor segment of a folder path (idempotent) so nested paths
// work even when parent folders don't exist yet.
async function ensureFolder(client, projectId, folderPath) {
  const segments = String(folderPath || '').split('/').filter(Boolean);
  let current = '';
  for (const segment of segments) {
    current += `/${segment}`;
    try {
      await client.createFolder(projectId, current);
    } catch (error) {
      if (!/already exist|exists/i.test(error.message)) throw error;
    }
  }
}

// Move published/updated Tests into their Test Repository folders (one call per folder).
async function assignTestsToRepoFolder(folderMap) {
  if (!XRAY_TEST_REPO_FOLDER) return { enabled: false };
  const summary = { enabled: true, base: XRAY_TEST_REPO_FOLDER, assigned: 0, folders: 0, error: '' };
  const total = [...folderMap.values()].reduce((n, ids) => n + ids.length, 0);
  if (total === 0) return summary;
  if (!isUsableCreds(XRAY_CLIENT_ID, XRAY_CLIENT_SECRET)) {
    summary.error = 'Test Repository folder needs an Xray API key (XRAY_CLIENT_ID/XRAY_CLIENT_SECRET).';
    return summary;
  }
  try {
    const projectId = await resolveProjectId();
    const client = getXrayClient();
    for (const [folderPath, ids] of folderMap) {
      await ensureFolder(client, projectId, folderPath);
      await client.addTestsToFolder(projectId, folderPath, ids);
      summary.assigned += ids.length;
      summary.folders += 1;
    }
  } catch (error) {
    summary.error = error.message;
  }
  return summary;
}

// Move all published/updated Preconditions into their Test Repository folder.
async function assignPreconditionsToFolder() {
  if (!XRAY_PRECONDITION_FOLDER) return { enabled: false };
  const summary = { enabled: true, path: XRAY_PRECONDITION_FOLDER, assigned: 0, error: '' };
  const ids = [...preconditionCache.values()].map((p) => p.id).filter(Boolean);
  if (ids.length === 0) return summary;
  if (!isUsableCreds(XRAY_CLIENT_ID, XRAY_CLIENT_SECRET)) {
    summary.error = 'Precondition folder needs an Xray API key (XRAY_CLIENT_ID/XRAY_CLIENT_SECRET).';
    return summary;
  }
  try {
    const projectId = await resolveProjectId();
    const client = getXrayClient();
    await ensureFolder(client, projectId, XRAY_PRECONDITION_FOLDER);
    await client.addIssuesToFolder(projectId, XRAY_PRECONDITION_FOLDER, ids);
    summary.assigned = ids.length;
  } catch (error) {
    summary.error = error.message;
  }
  return summary;
}

// Refresh the description of an already-existing Test so it matches the slimmed
// format. Only runs when native panels are being populated (steps/preconditions),
// i.e. when the kit is actively managing the issue.
// Keep existing Tests in sync with the current summary/labels/description format.
async function refreshExistingFields(issueKey, testcase, item) {
  try {
    const payload = buildIssuePayload(testcase);
    await requestJson('PUT', `/rest/api/3/issue/${encodeURIComponent(issueKey)}`, {
      fields: {
        summary: payload.fields.summary,
        labels: payload.fields.labels,
        description: payload.fields.description,
        // Đồng bộ lại Sub-Project/Board (và field kế thừa khác) theo Story khi re-publish → test cũ tự khớp sản phẩm.
        ...INHERITED_FIELDS,
      },
    });
    item.fieldsUpdated = true;
  } catch (error) {
    item.error = appendError(item.error, `Update fields: ${error.message}`);
  }
}

async function syncPrecondition(issueId, testcase, item) {
  if (!XRAY_PUSH_PRECONDITIONS) {
    item.preconditionAction = 'disabled';
    return;
  }
  const entries = parsePreconditionEntries(testcase.precondition, testcase.tcId);
  if (entries.length === 0) {
    item.preconditionAction = 'empty';
    return;
  }
  if (!issueId) {
    item.preconditionAction = 'error';
    item.error = appendError(item.error, 'Precondition: missing test issue id');
    return;
  }
  try {
    const ids = [];
    const keys = [];
    let createdCount = 0;
    for (const entry of entries) {
      const precondition = await ensurePrecondition(entry);
      if (precondition.id) ids.push(precondition.id);
      if (precondition.key) keys.push(precondition.key);
      if (precondition.action === 'created') createdCount += 1;
    }
    if (ids.length === 0) throw new Error('No precondition issue ids resolved.');
    // Idempotent sync: remove associations no longer desired (e.g. legacy per-TC
    // preconditions), then add only the missing desired ones.
    const client = getXrayClient();
    const desired = ids.map(String);
    const current = await client.getTestPreconditionIds(issueId);
    const toRemove = current.filter((id) => !desired.includes(id));
    const toAdd = desired.filter((id) => !current.includes(id));
    if (toRemove.length) await client.removePreconditionsFromTest(issueId, toRemove);
    if (toAdd.length) await client.addPreconditionsToTest(issueId, toAdd);
    item.preconditionKeys = keys;
    item.preconditionCount = ids.length;
    // Per-item status: 'created' if this test triggered any new precondition, else 'linked' to shared ones.
    item.preconditionAction = createdCount > 0 ? 'created' : 'linked';
  } catch (error) {
    item.preconditionAction = 'error';
    item.error = appendError(item.error, `Precondition: ${error.message}`);
  }
}

// Reusable, shared-by-code preconditions: each [PRE-xx] marker becomes one
// Precondition issue, deduped across the whole task and associated to every
// Test that references it. Definition is taken from the first occurrence.
async function ensurePrecondition(entry) {
  const cached = preconditionCache.get(entry.code);
  if (cached) {
    if (cached.definition && entry.text && cached.definition !== entry.text) {
      preconditionWarnings.push(`${entry.code}: mô tả khác nhau giữa các TC (giữ bản đầu tiên)`);
    }
    return cached;
  }

  const existing = await findExistingPrecondition(entry.code);
  if (existing) {
    // Refresh summary + labels to the current format on existing preconditions.
    try {
      const payload = buildPreconditionPayload(entry);
      await requestJson('PUT', `/rest/api/3/issue/${encodeURIComponent(existing.key)}`, {
        fields: { summary: payload.fields.summary, labels: payload.fields.labels },
      });
    } catch (error) {
      preconditionWarnings.push(`${entry.code}: không cập nhật được summary/labels (${error.message})`);
    }
    const value = { id: existing.id, key: existing.key, action: 'existing', definition: entry.text };
    preconditionCache.set(entry.code, value);
    return value;
  }

  const created = await createJiraIssue(buildPreconditionPayload(entry));
  try {
    await getXrayClient().setPreconditionDefinition(created.id, entry.text);
  } catch (defError) {
    preconditionWarnings.push(`${entry.code}: không set được definition (${defError.message})`);
  }
  const value = { id: created.id, key: created.key || '', action: 'created', definition: entry.text };
  preconditionCache.set(entry.code, value);
  return value;
}

// Parse "[PRE-01] text. [PRE-04] text" into [{code, text}]. When no [..] marker
// exists the precondition is not shareable, so it falls back to a per-TC code.
function parsePreconditionEntries(rawText, tcId) {
  const text = String(rawText || '').trim();
  if (!text || text === '-') return [];

  const markers = [...text.matchAll(/\[([^\]]+)\]/g)];
  if (markers.length === 0) {
    return [{ code: `TC-${tcId}`, text }];
  }

  const entries = [];
  for (let i = 0; i < markers.length; i += 1) {
    const code = markers[i][1].trim();
    const start = markers[i].index + markers[i][0].length;
    const end = i + 1 < markers.length ? markers[i + 1].index : text.length;
    const body = text.slice(start, end).trim().replace(/^[-:.\s]+|[.;\s]+$/g, '').trim();
    entries.push({ code, text: body || code });
  }
  return entries;
}

function findExistingPrecondition(code) {
  const taskLabel = labelFor(`task-${TASK_KEY}`);
  const preLabel = labelFor(`pre-${code}`);
  const jql = `project = ${PROJECT_KEY} AND issuetype = "${escapeJql(XRAY_PRECONDITION_ISSUE_TYPE)}" AND labels = "${escapeJql(taskLabel)}" AND labels = "${escapeJql(preLabel)}" ORDER BY created DESC`;
  return requestJson('POST', '/rest/api/3/search/jql', {
    jql,
    fields: ['summary', 'key'],
    maxResults: 1,
  }).then((response) => (response.issues && response.issues.length > 0 ? response.issues[0] : null));
}

function buildPreconditionPayload(entry) {
  const taskLabel = labelFor(`task-${TASK_KEY}`);
  const labels = unique([
    'automation-precondition',
    taskLabel,
    labelFor(`pre-${entry.code}`),
  ]).filter(Boolean);

  const fields = {
    project: { key: PROJECT_KEY },
    issuetype: { name: XRAY_PRECONDITION_ISSUE_TYPE },
    summary: buildPreconditionSummary(entry),
    description: preconditionToAdf(entry),
    labels,
  };
  Object.assign(fields, EXTRA_FIELDS, INHERITED_FIELDS);
  return { fields };
}

// Precondition summary: chỉ mã + mô tả, vd "[PRE-01] Ops Staff đã đăng nhập OPS".
function buildPreconditionSummary(entry) {
  return truncate(`[${entry.code}] ${entry.text}`, 255);
}

function preconditionToAdf(entry) {
  return {
    type: 'doc',
    version: 1,
    content: [
      heading(`Precondition ${entry.code}`, 3),
      paragraph(entry.text || '-'),
      paragraph(`Task: ${TASK_KEY} | Story: ${STORY_KEY}`),
    ],
  };
}

// Build Xray manual steps. "Dữ liệu Test" is testcase-level (kept in the
// description), so per-step Data is left empty. Expected results are paired to
// steps by their leading number; results without a matching step number are
// appended to the last step so nothing is lost.
function buildXraySteps(testcase) {
  const actions = splitNumberedItems(testcase.steps);
  const results = splitNumberedItems(testcase.expected);

  if (actions.length === 0) {
    return [{
      action: String(testcase.steps || testcase.title || '-').trim() || '-',
      data: '',
      result: results.map((r) => r.text).join('\n'),
    }];
  }

  const actionNums = new Set(actions.map((a) => a.num).filter((n) => n != null));
  const resultByNum = new Map();
  const unmatched = [];
  for (const result of results) {
    if (result.num != null && actionNums.has(result.num) && !resultByNum.has(result.num)) {
      resultByNum.set(result.num, result.text);
    } else {
      unmatched.push(result.text);
    }
  }

  const steps = actions.map((action) => ({
    action: action.text,
    data: '',
    result: action.num != null && resultByNum.has(action.num) ? resultByNum.get(action.num) : '',
  }));

  if (unmatched.length) {
    const last = steps[steps.length - 1];
    last.result = [last.result, ...unmatched].filter(Boolean).join('\n');
  }
  return steps;
}

// Split "1. foo\n2. bar" into [{num:1,text:'foo'},{num:2,text:'bar'}].
// Lines without a leading number are appended to the previous item (or, if
// first, kept as a numberless item).
function splitNumberedItems(text) {
  const raw = String(text || '').replace(/\r/g, '');
  if (!raw.trim()) return [];
  const items = [];
  let current = null;
  for (const line of raw.split('\n')) {
    const match = line.match(/^\s*(\d+)[.)]\s*(.*)$/);
    if (match) {
      if (current) items.push(current);
      current = { num: Number.parseInt(match[1], 10), text: match[2] };
    } else if (current) {
      if (line.trim()) current.text += `\n${line.trim()}`;
    } else if (line.trim()) {
      current = { num: null, text: line.trim() };
    }
  }
  if (current) items.push(current);
  return items
    .map((item) => ({ num: item.num, text: item.text.trim() }))
    .filter((item) => item.text);
}

function applyXrayFields(fields) {
  if (TEST_MANAGEMENT_TOOL !== 'xray') return;
  if (!XRAY_TEST_TYPE_FIELD_ID) return;

  fields[XRAY_TEST_TYPE_FIELD_ID] = XRAY_TEST_TYPE_FIELD_MODE === 'text'
    ? XRAY_TEST_TYPE
    : { value: XRAY_TEST_TYPE };
}

function normalizeLabelValue(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'D')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function shouldSetParent() {
  if (PARENT_MODE === 'none' || PARENT_MODE === 'off') return false;
  if (PARENT_MODE === 'parent') return true;
  return /sub|child/i.test(ISSUE_TYPE);
}

function normalizePriority(value) {
  const normalized = normalizeHeaderName(value);
  const aliases = {
    highest: 'Highest',
    critical: 'Highest',
    blocker: 'Highest',
    p0: 'Highest',
    high: 'High',
    major: 'High',
    p1: 'High',
    medium: 'Medium',
    p2: 'Medium',
    low: 'Low',
    minor: 'Low',
    p3: 'Low',
    lowest: 'Lowest',
    trivial: 'Lowest',
    p4: 'Lowest',
  };
  return aliases[normalized.replace(/\s+/g, '')] || '';
}

function labelFor(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 255);
}

function unique(items) {
  return Array.from(new Set(items));
}

function truncate(value, maxLength) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3).trim()}...`;
}

function testcaseToAdf(testcase) {
  // Steps/preconditions live in native Xray panels (Test details, Preconditions)
  // when pushed, so the description keeps only traceability + testcase-level data
  // and points to the native tabs. Falls back to full content when native push is
  // disabled (Jira mirror only).
  const userStory = moduleDetail(testcase.module);
  const overview = [
    ['Test Case ID', testcase.tcId],
    ['Nhóm chức năng', testcase.functionGroup || '-'],
    ['User Story', userStory || '-'],
    ['Priority', testcase.priority || '-'],
    ['Risk', testcase.risk || '-'],
  ];

  const content = [
    heading('📋 Tổng quan', 3),
    table([['Thông tin', 'Giá trị'], ...overview]),
  ];

  // Testcase-level test data is not represented per-step, so always keep it here.
  const testData = String(testcase.testData || '').trim();
  if (testData && testData !== '-') {
    content.push(heading('🧪 Dữ liệu Test', 3), paragraph(testData));
  }

  if (XRAY_PUSH_PRECONDITIONS || XRAY_PUSH_STEPS) {
    const pointers = [];
    if (XRAY_PUSH_PRECONDITIONS) pointers.push('Tiền điều kiện → tab "Preconditions"');
    if (XRAY_PUSH_STEPS) pointers.push('Các bước & kết quả mong đợi → tab "Test details"');
    content.push(panel('info', pointers.map((text) => paragraph(text))));
  }

  if (!XRAY_PUSH_PRECONDITIONS) {
    content.push(heading('✅ Tiền điều kiện', 3), paragraph(testcase.precondition || '-'));
  }
  if (!XRAY_PUSH_STEPS) {
    content.push(
      heading('▶️ Các bước thực hiện', 3),
      paragraph(testcase.steps || '-'),
      heading('🎯 Kết quả mong đợi', 3),
      paragraph(testcase.expected || '-'),
    );
  }

  return { type: 'doc', version: 1, content };
}

// Module is stored as "<Nhóm chức năng> / <User Story>"; return the part after
// the first "/" to avoid repeating the function group.
function moduleDetail(moduleValue) {
  const value = String(moduleValue || '').trim();
  const slash = value.indexOf('/');
  return slash >= 0 ? value.slice(slash + 1).trim() : value;
}

function panel(panelType, contentNodes) {
  return { type: 'panel', attrs: { panelType }, content: contentNodes };
}

function heading(text, level) {
  return {
    type: 'heading',
    attrs: { level },
    content: textNodes(text),
  };
}

function paragraph(text) {
  const lines = String(text || '').split(/\r?\n/);
  const content = [];
  lines.forEach((line, index) => {
    if (index > 0) content.push({ type: 'hardBreak' });
    content.push(...textNodes(line));
  });
  return { type: 'paragraph', content: content.length ? content : textNodes('-') };
}

function table(rows) {
  return {
    type: 'table',
    content: rows.map((row, rowIndex) => ({
      type: 'tableRow',
      content: row.map((cell) => ({
        type: rowIndex === 0 ? 'tableHeader' : 'tableCell',
        content: [paragraph(cell || '-')],
      })),
    })),
  };
}

function textNodes(text) {
  const value = String(text || '');
  return value ? [{ type: 'text', text: value }] : [{ type: 'text', text: '-' }];
}

function buildPlannedTestSetInfo(testcase) {
  const group = businessGroupInfo(testcase);
  return {
    group: group.name,
    groupLabel: group.groupLabel,
    issueType: XRAY_TEST_SET_ISSUE_TYPE,
    summary: buildTestSetSummary(group),
    issueKey: '',
    action: 'planned',
    linkAction: XRAY_TEST_SET_LINK_ENABLED ? 'planned' : 'disabled',
    storyLinkAction: XRAY_TEST_SET_STORY_LINK_ENABLED ? 'planned' : 'disabled',
    linkedStoryKey: XRAY_TEST_SET_STORY_LINK_ENABLED ? STORY_KEY : '',
    error: '',
  };
}

async function assignTestToBusinessFlowTestSet(testcase, testIssueKey, testIssueId, item) {
  if (!XRAY_TEST_SET_ENABLED) return;

  const group = businessGroupInfo(testcase);
  item.testSet = item.testSet || buildPlannedTestSetInfo(testcase);

  if (!testIssueKey) {
    item.testSet.action = 'error';
    item.testSet.error = 'Missing Xray Test issue key; cannot assign to Test Set.';
    return;
  }

  try {
    const testSet = await ensureBusinessFlowTestSet(group);
    item.testSet.issueKey = testSet.key;
    item.testSet.action = testSet.action;

    await linkTestSetToStory(testSet.key, item.testSet);
    await addTestToTestSetMembership(testIssueKey, testIssueId, testSet, item.testSet);
  } catch (error) {
    item.testSet.action = 'error';
    item.testSet.error = error.message;
  }
}

async function ensureBusinessFlowTestSet(group) {
  if (testSetCache.has(group.value)) {
    const cached = testSetCache.get(group.value);
    return { ...cached, action: 'cached' };
  }

  const existing = await findExistingTestSet(group);
  if (existing) {
    const value = { key: existing.key, id: existing.id, action: 'existing' };
    testSetCache.set(group.value, value);
    return value;
  }

  const created = await createJiraIssue(buildTestSetPayload(group));
  const value = { key: created.key || '', id: created.id || '', action: 'created' };
  testSetCache.set(group.value, value);
  return value;
}

// Native Xray membership (addTestsToTestSet) when an Xray API key is available;
// falls back to a Jira issue link otherwise. Native membership is what populates
// the Test's "Test Sets" tab and the Test Set's "Tests" tab.
async function addTestToTestSetMembership(testIssueKey, testIssueId, testSet, testSetItem) {
  if (!XRAY_TEST_SET_LINK_ENABLED) {
    testSetItem.linkAction = testSetItem.linkAction || 'disabled';
    return;
  }
  if (isUsableCreds(XRAY_CLIENT_ID, XRAY_CLIENT_SECRET)) {
    if (!testIssueId || !testSet.id) {
      testSetItem.linkAction = 'error';
      testSetItem.error = appendError(testSetItem.error, 'Test Set membership: missing numeric issue id');
      return;
    }
    try {
      await getXrayClient().addTestsToTestSet(testSet.id, [testIssueId]);
      testSetItem.linkAction = 'linked';
    } catch (error) {
      testSetItem.linkAction = 'error';
      testSetItem.error = appendError(testSetItem.error, `Test Set membership: ${error.message}`);
    }
    return;
  }
  // Legacy fallback: plain Jira issue link (does NOT populate the native Xray Test Sets tab).
  await linkTestToTestSet(testIssueKey, testSet.key, testSetItem);
}

async function findExistingTestSet(group) {
  const taskLabel = labelFor(`task-${TASK_KEY}`);
  const jql = [
    `project = ${PROJECT_KEY}`,
    `issuetype = "${escapeJql(XRAY_TEST_SET_ISSUE_TYPE)}"`,
    `labels = "automation-testset"`,
    `labels = "${escapeJql(taskLabel)}"`,
    `labels = "${escapeJql(group.groupLabel)}"`,
  ].join(' AND ');
  const response = await requestJson('POST', '/rest/api/3/search/jql', {
    jql: `${jql} ORDER BY created DESC`,
    fields: ['summary', 'key'],
    maxResults: 1,
  });
  return response.issues && response.issues.length > 0 ? response.issues[0] : null;
}

function buildTestSetPayload(group) {
  const taskLabel = labelFor(`task-${TASK_KEY}`);
  const labels = unique([
    'automation-testset',
    TEST_MANAGEMENT_TOOL === 'xray' ? 'xray' : '',
    taskLabel,
    group.groupLabel,
    ...XRAY_TEST_SET_LABELS.map(labelFor),
  ]).filter(Boolean);

  const fields = {
    project: { key: PROJECT_KEY },
    issuetype: { name: XRAY_TEST_SET_ISSUE_TYPE },
    summary: buildTestSetSummary(group),
    description: testSetToAdf(group),
    labels,
  };
  Object.assign(fields, EXTRA_FIELDS, INHERITED_FIELDS);
  return { fields };
}

function buildTestSetSummary(group) {
  return truncate(`${XRAY_TEST_SET_SUMMARY_PREFIX} ${TASK_KEY} - ${group.name}`, 255);
}

function testSetToAdf(group) {
  return {
    type: 'doc',
    version: 1,
    content: [
      heading('Xray Test Set', 3),
      paragraph(`Business flow: ${group.name}`),
      paragraph(`Jira Story: ${STORY_KEY}`),
      paragraph(`Task key: ${TASK_KEY}`),
      paragraph('Generated from Excel source of truth. This Test Set is a Jira/Xray mirror for review and grouping.'),
    ],
  };
}

function businessGroupInfo(testcase) {
  // Test Set is grouped by the dedicated "Nhóm chức năng" column when present,
  // falling back to the first segment of "Module".
  const rawGroup = String(testcase.functionGroup || '').trim()
    || businessGroupNameFromModule(testcase.module)
    || 'Other';
  const value = normalizeLabelValue(rawGroup) || 'other';
  return {
    name: rawGroup,
    value,
    groupLabel: labelFor(`group-${value}`),
  };
}

function businessGroupNameFromModule(moduleValue) {
  const value = String(moduleValue || '').trim();
  if (!value) return '';
  return (value.split('/')[0] || value).trim();
}

async function findExistingIssue(testcase) {
  const tcLabel = labelFor(`tc-${testcase.tcId}`);
  const taskLabel = labelFor(`task-${TASK_KEY}`);
  const jql = `project = ${PROJECT_KEY} AND labels = "${escapeJql(tcLabel)}" AND labels = "${escapeJql(taskLabel)}" ORDER BY created DESC`;
  const response = await requestJson('POST', '/rest/api/3/search/jql', {
    jql,
    fields: ['summary', 'key'],
    maxResults: 1,
  });
  return response.issues && response.issues.length > 0 ? response.issues[0] : null;
}

async function createJiraIssue(payload) {
  return requestJson('POST', '/rest/api/3/issue', payload);
}

async function linkTestToStory(testIssueKey, item) {
  if (!XRAY_REQUIREMENT_LINK_ENABLED) {
    item.linkAction = item.linkAction || 'disabled';
    return;
  }
  if (!testIssueKey || !STORY_KEY || normalizeIssueKey(testIssueKey) === STORY_KEY) {
    item.linkAction = item.linkAction || 'skipped';
    return;
  }

  const payload = buildRequirementLinkPayload(testIssueKey);
  try {
    await requestJson('POST', '/rest/api/3/issueLink', payload);
    item.linkAction = 'linked';
    item.linkedStoryKey = STORY_KEY;
  } catch (error) {
    if (/already exists|duplicate|A link already exists/i.test(error.message)) {
      item.linkAction = 'existing';
      item.linkedStoryKey = STORY_KEY;
      return;
    }
    item.linkAction = 'error';
    item.error = item.error ? `${item.error}; Link error: ${error.message}` : `Link error: ${error.message}`;
  }
}

function buildRequirementLinkPayload(testIssueKey) {
  const sourceIsTest = XRAY_REQUIREMENT_LINK_DIRECTION !== 'story_to_test';
  const testSide = { key: testIssueKey };
  const storySide = { key: STORY_KEY };

  // Coverage của Xray cần: requirement (Story) ở chiều INWARD "is tested by", Test ở chiều OUTWARD "tests".
  // Kiểm chứng thực tế trên instance: payload {inwardIssue: Test, outwardIssue: Story} mới cho ra
  // Story = inward "is tested by" (đúng). Nên với test_to_story: inwardIssue=Test, outwardIssue=Story.
  // (Bản cũ đặt ngược khiến Story thành outward "tests" -> Test Coverage của Story luôn trống.)
  return {
    type: { name: XRAY_REQUIREMENT_LINK_TYPE },
    inwardIssue: sourceIsTest ? testSide : storySide,
    outwardIssue: sourceIsTest ? storySide : testSide,
  };
}

async function linkTestSetToStory(testSetIssueKey, testSetItem) {
  if (!XRAY_TEST_SET_STORY_LINK_ENABLED) {
    testSetItem.storyLinkAction = testSetItem.storyLinkAction || 'disabled';
    return;
  }
  if (!testSetIssueKey || !STORY_KEY || normalizeIssueKey(testSetIssueKey) === STORY_KEY) {
    testSetItem.storyLinkAction = testSetItem.storyLinkAction || 'skipped';
    return;
  }

  const payload = buildRequirementLinkPayload(testSetIssueKey);
  try {
    await requestJson('POST', '/rest/api/3/issueLink', payload);
    testSetItem.storyLinkAction = 'linked';
    testSetItem.linkedStoryKey = STORY_KEY;
  } catch (error) {
    if (/already exists|duplicate|A link already exists/i.test(error.message)) {
      testSetItem.storyLinkAction = 'existing';
      testSetItem.linkedStoryKey = STORY_KEY;
      return;
    }
    testSetItem.storyLinkAction = 'error';
    testSetItem.error = testSetItem.error
      ? `${testSetItem.error}; Test Set story link error: ${error.message}`
      : `Test Set story link error: ${error.message}`;
  }
}

async function linkTestToTestSet(testIssueKey, testSetIssueKey, testSetItem) {
  if (!XRAY_TEST_SET_LINK_ENABLED) {
    testSetItem.linkAction = testSetItem.linkAction || 'disabled';
    return;
  }
  if (!testIssueKey || !testSetIssueKey || normalizeIssueKey(testIssueKey) === normalizeIssueKey(testSetIssueKey)) {
    testSetItem.linkAction = testSetItem.linkAction || 'skipped';
    return;
  }

  const payload = buildTestSetLinkPayload(testIssueKey, testSetIssueKey);
  try {
    await requestJson('POST', '/rest/api/3/issueLink', payload);
    testSetItem.linkAction = 'linked';
  } catch (error) {
    if (/already exists|duplicate|A link already exists/i.test(error.message)) {
      testSetItem.linkAction = 'existing';
      return;
    }
    testSetItem.linkAction = 'error';
    testSetItem.error = testSetItem.error
      ? `${testSetItem.error}; Test Set link error: ${error.message}`
      : `Test Set link error: ${error.message}`;
  }
}

function buildTestSetLinkPayload(testIssueKey, testSetIssueKey) {
  const sourceIsTestSet = XRAY_TEST_SET_LINK_DIRECTION !== 'test_to_testset';
  const testSide = { key: testIssueKey };
  const testSetSide = { key: testSetIssueKey };

  return {
    type: { name: XRAY_TEST_SET_LINK_TYPE },
    inwardIssue: sourceIsTestSet ? testSide : testSetSide,
    outwardIssue: sourceIsTestSet ? testSetSide : testSide,
  };
}

function requestJson(method, apiPath, payload) {
  return new Promise((resolve, reject) => {
    const jiraUrl = new URL(JIRA_BASE_URL);
    const basePath = jiraUrl.pathname.replace(/\/+$/, '');
    const data = payload ? JSON.stringify(payload) : '';
    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
    };

    if (JIRA_PAT) {
      headers.Authorization = `Bearer ${JIRA_PAT}`;
    } else {
      headers.Authorization = `Basic ${Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64')}`;
    }

    const req = https.request(
      {
        hostname: jiraUrl.hostname,
        method,
        path: `${basePath}${apiPath}`,
        headers,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          let parsed = {};
          try {
            parsed = body ? JSON.parse(body) : {};
          } catch {
            reject(new Error(`Invalid Jira JSON response (${res.statusCode}): ${body.slice(0, 500)}`));
            return;
          }

          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`Jira API ${method} ${apiPath} failed (${res.statusCode}): ${body.slice(0, 1000)}`));
            return;
          }

          resolve(parsed);
        });
      },
    );

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function escapeJql(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function writeReports(context) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const jsonPath = path.join(REPORT_DIR, 'jira-testcase-publish.json');
  const mdPath = path.join(REPORT_DIR, 'jira-testcase-publish-summary.md');
  const json = {
    generatedAt: new Date().toISOString(),
    projectOutputDir: relativeToRepo(PROJECT_OUTPUT_DIR),
    taskKey: TASK_KEY,
    taskOutputDir: relativeToRepo(TASK_OUTPUT_DIR),
    storyKey: STORY_KEY,
    projectKey: PROJECT_KEY,
    testManagementTool: TEST_MANAGEMENT_TOOL,
    issueType: ISSUE_TYPE,
    xrayTestType: TEST_MANAGEMENT_TOOL === 'xray' ? XRAY_TEST_TYPE : '',
    xrayTestTypeFieldId: TEST_MANAGEMENT_TOOL === 'xray' ? XRAY_TEST_TYPE_FIELD_ID : '',
    requirementLinkEnabled: XRAY_REQUIREMENT_LINK_ENABLED,
    requirementLinkType: XRAY_REQUIREMENT_LINK_TYPE,
    requirementLinkDirection: XRAY_REQUIREMENT_LINK_DIRECTION,
    testSetEnabled: XRAY_TEST_SET_ENABLED,
    testSetIssueType: XRAY_TEST_SET_ISSUE_TYPE,
    testSetLinkEnabled: XRAY_TEST_SET_LINK_ENABLED,
    testSetLinkType: XRAY_TEST_SET_LINK_TYPE,
    testSetLinkDirection: XRAY_TEST_SET_LINK_DIRECTION,
    testSetStoryLinkEnabled: XRAY_TEST_SET_STORY_LINK_ENABLED,
    xrayPushSteps: XRAY_PUSH_STEPS,
    xrayPushPreconditions: XRAY_PUSH_PRECONDITIONS,
    testRepoFolder: XRAY_TEST_REPO_FOLDER,
    subfolderBySheet: XRAY_SUBFOLDER_BY_SHEET,
    preconditionFolder: XRAY_PRECONDITION_FOLDER,
    folderSummary: context.folderSummary || null,
    preconditionFolderSummary: context.preconditionFolderSummary || null,
    parentMode: PARENT_MODE,
    dryRun: DRY_RUN,
    qaApproved: QA_APPROVED,
    excelFiles: context.excelFiles.map(relativeToRepo),
    totalRows: context.totalRows,
    selectedCount: context.selectedCount,
    results: context.results,
  };

  fs.writeFileSync(jsonPath, JSON.stringify(json, null, 2), 'utf8');
  fs.writeFileSync(mdPath, renderMarkdownSummary(json), 'utf8');
}

function renderMarkdownSummary(report) {
  const counts = countBy(report.results, 'action');
  const linkCounts = countBy(report.results, 'linkAction');
  const stepsCounts = countBy(report.results, 'stepsAction');
  const preCounts = countBy(report.results, 'preconditionAction');
  const testSetItems = report.results.map((item) => item.testSet).filter(Boolean);
  const testSetCounts = countBy(testSetItems, 'action');
  const testSetLinkCounts = countBy(testSetItems, 'linkAction');
  const testSetStoryLinkCounts = countBy(testSetItems, 'storyLinkAction');
  const lines = [
    '# Jira Testcase Publish Summary',
    '',
    `- Task key: ${report.taskKey}`,
    `- Jira story: ${report.storyKey}`,
    `- Jira project: ${report.projectKey}`,
    `- Test management tool: ${report.testManagementTool || '-'}`,
    `- Issue type: ${report.issueType}`,
    `- Xray test type: ${report.xrayTestType || '-'}`,
    `- Requirement link: ${report.requirementLinkEnabled ? `${report.requirementLinkType} (${report.requirementLinkDirection})` : 'disabled'}`,
    `- Test Set by business flow: ${report.testSetEnabled ? `${report.testSetIssueType} (${report.testSetLinkType}, ${report.testSetLinkDirection})` : 'disabled'}`,
    `- Mode: ${report.dryRun ? 'dry-run' : 'publish'}`,
    `- Excel source of truth: ${report.excelFiles.join(', ')}`,
    `- Testcases selected: ${report.selectedCount}/${report.totalRows}`,
    `- Planned: ${counts.planned || 0}`,
    `- Created: ${counts.created || 0}`,
    `- Existing skipped: ${counts.skipped_existing || 0}`,
    `- Errors: ${counts.error || 0}`,
    `- Story links: linked=${linkCounts.linked || 0}, existing=${linkCounts.existing || 0}, planned=${linkCounts.planned || 0}, errors=${linkCounts.error || 0}`,
    `- Xray steps (Test details): ${report.xrayPushSteps ? `synced=${stepsCounts.synced || 0}, errors=${stepsCounts.error || 0}` : 'disabled (set XRAY_PUSH_STEPS=1 + Xray API key)'}`,
    `- Xray preconditions: ${report.xrayPushPreconditions ? `tests associated=${(preCounts.created || 0) + (preCounts.linked || 0)}, empty=${preCounts.empty || 0}, errors=${preCounts.error || 0}` : 'disabled (set XRAY_PUSH_PRECONDITIONS=1 + Xray API key)'}`,
    `- Test Repository folders: ${report.testRepoFolder ? `base="${report.testRepoFolder}"${report.subfolderBySheet ? ' (subfolder theo sheet)' : ''} folders=${report.folderSummary ? report.folderSummary.folders : 0}, tests=${report.folderSummary ? report.folderSummary.assigned : 0}${report.folderSummary && report.folderSummary.error ? ` (ERROR: ${report.folderSummary.error})` : ''}` : 'disabled (set XRAY_TEST_REPO_FOLDER)'}`,
    `- Precondition folder: ${report.preconditionFolder ? `"${report.preconditionFolder}" assigned=${report.preconditionFolderSummary ? report.preconditionFolderSummary.assigned : 0}${report.preconditionFolderSummary && report.preconditionFolderSummary.error ? ` (ERROR: ${report.preconditionFolderSummary.error})` : ''}` : 'disabled (set XRAY_PRECONDITION_FOLDER)'}`,
    `- Test Sets: planned=${testSetCounts.planned || 0}, created=${testSetCounts.created || 0}, existing=${testSetCounts.existing || 0}, cached=${testSetCounts.cached || 0}, errors=${testSetCounts.error || 0}`,
    `- Test Set links: linked=${testSetLinkCounts.linked || 0}, existing=${testSetLinkCounts.existing || 0}, planned=${testSetLinkCounts.planned || 0}, errors=${testSetLinkCounts.error || 0}`,
    `- Test Set story links: linked=${testSetStoryLinkCounts.linked || 0}, existing=${testSetStoryLinkCounts.existing || 0}, planned=${testSetStoryLinkCounts.planned || 0}, errors=${testSetStoryLinkCounts.error || 0}`,
    '',
    '| TC ID | Action | Jira Issue | Story Link | Xray Steps | Precondition | Test Set | Source Excel | Error |',
    '|---|---|---|---|---|---|---|---|---|',
  ];

  for (const item of report.results) {
    const testSet = item.testSet
      ? `${item.testSet.issueKey || '-'}<br>${item.testSet.group || '-'}<br>${item.testSet.action || '-'} / ${item.testSet.linkAction || '-'} / story:${item.testSet.storyLinkAction || '-'}`
      : '-';
    const steps = item.stepsAction
      ? (item.stepsAction === 'synced' ? `synced (${item.stepsCount || 0})` : item.stepsAction)
      : '-';
    const preKeys = Array.isArray(item.preconditionKeys) ? item.preconditionKeys.join(', ') : '';
    const precondition = item.preconditionAction
      ? `${item.preconditionAction}${preKeys ? ` (${preKeys})` : ''}`
      : '-';
    const error = [item.error || '', item.testSet?.error || ''].filter(Boolean).join('; ') || '-';
    lines.push(`| ${escapeMd(item.tcId)} | ${escapeMd(item.action)} | ${escapeMd(item.issueKey || item.existingIssueKey || '-')} | ${escapeMd(item.linkAction || '-')} ${escapeMd(item.linkedStoryKey || '')} | ${escapeMd(steps)} | ${escapeMd(precondition)} | ${escapeMd(testSet)} | ${escapeMd(item.sourceExcel)} | ${escapeMd(error)} |`);
  }

  lines.push('');
  lines.push('Excel remains the source of truth. Jira issues are a published mirror for tracking/review.');
  return `${lines.join('\n')}\n`;
}

function countBy(items, key) {
  return items.reduce((acc, item) => {
    acc[item[key]] = (acc[item[key]] || 0) + 1;
    return acc;
  }, {});
}

function escapeMd(value) {
  return String(value || '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}
