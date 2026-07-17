#!/usr/bin/env node

/**
 * Pull testcases FROM Xray/Jira back into a local canonical Excel/JSON.
 *
 * This is the reverse of publish_testcases.js. It lets Phase 2 execute from
 * testcases that live on Xray (edited/reviewed there) instead of the hand-authored
 * Excel: it discovers the published Test issues, reads their manual steps from the
 * Xray Cloud store, reconstructs the testcase rows, and writes them to an ISOLATED
 * folder (test-cases/from-xray/) so the human Excel in test-cases/ is never touched.
 *
 * Task-agnostic: driven entirely by env/args (PROJECT_OUTPUT_DIR, TASK_KEY,
 * JIRA_PROJECT_KEY, JIRA_STORY_KEY), so the same command works for any task.
 *
 * Discovery uses the Jira REST search (labels automation-testcase + task-<KEY>) —
 * the same labels publish_testcases.js stamps — so it does not depend on Xray's
 * own JQL indexing. Steps/Expected come from Xray getTest(); if no Xray API key is
 * configured (or steps were never pushed), it falls back to parsing the Test's
 * description, which contains the full steps/preconditions when native push is off.
 *
 * Usage:
 *   node scripts/integrations/jira/pull_testcases.js --dry-run        # preview only
 *   node scripts/integrations/jira/pull_testcases.js --write          # write xlsx + json
 *   node scripts/integrations/jira/pull_testcases.js --write --only TC_001,TC_002
 *   node scripts/integrations/jira/pull_testcases.js --write --jql "project = SAPP AND ..."
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

let ExcelJS;
try {
  ExcelJS = require('exceljs');
} catch {
  console.error('Missing dependency: exceljs. Run `npm install` at the repo root.');
  process.exit(1);
}

const {
  loadEnv,
  buildJiraHeaders,
  adfToMarkdown,
  getProjectOutputDir,
  getTaskKey,
  getTaskOutputDir,
  saveJsonToFile,
  saveTextToFile,
  log,
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
const OUT_DIR = resolvePath(argString('out-dir') || path.join(TASK_OUTPUT_DIR, 'test-cases', 'from-xray'));
const REPORT_DIR = resolvePath(argString('report-dir') || path.join(TASK_OUTPUT_DIR, 'reports'));

const STORY_KEY = normalizeIssueKey(argString('story') || process.env.JIRA_STORY_KEY || TASK_KEY);
const PROJECT_KEY = normalizeProjectKey(argString('project') || process.env.JIRA_PROJECT_KEY || deriveProjectKey(STORY_KEY));
const TEST_MANAGEMENT_TOOL = normalizeTool(
  argString('test-management-tool') || process.env.TEST_MANAGEMENT_TOOL || process.env.JIRA_TEST_MANAGEMENT_TOOL || 'xray',
);
const DEFAULT_ISSUE_TYPE = TEST_MANAGEMENT_TOOL === 'xray' ? 'Test' : 'Test Case';
const ISSUE_TYPE = argString('issue-type') || process.env.JIRA_TESTCASE_ISSUE_TYPE || DEFAULT_ISSUE_TYPE;
const MARKER_LABEL = argString('marker-label') || 'automation-testcase';
const ONLY_TCS = splitList(argString('only') || process.env.JIRA_TESTCASE_ONLY || '').map((s) => s.trim().toLowerCase());
const CUSTOM_JQL = argString('jql');
const MAX_RESULTS = Number.parseInt(argString('max') || '500', 10) || 500;

// Reading is safe, but WRITING the canonical file is gated so an accidental run
// never clobbers a reviewed local file. Default = dry-run (preview only).
const DO_WRITE = argFlag('write') || argFlag('no-dry-run');
const DRY_RUN = !DO_WRITE;
const WRITE_JSON = !argFlag('no-json');

const USE_XRAY = !argFlag('no-xray');
// Xray Cloud rate-limits aggressively; keep concurrency low and give the client a
// generous retry budget so 429 windows (often 5-6s) self-heal instead of falling
// back to an empty description.
const CONCURRENCY = Math.max(1, Number.parseInt(argString('concurrency') || '3', 10) || 3);
const XRAY_CLIENT_ID = process.env.XRAY_CLIENT_ID || '';
const XRAY_CLIENT_SECRET = process.env.XRAY_CLIENT_SECRET || '';
const XRAY_CLOUD_BASE_URL = process.env.XRAY_CLOUD_BASE_URL || process.env.XRAY_API_BASE_URL || 'https://xray.cloud.getxray.app';

const JIRA_BASE_URL = stripTrailingSlash(process.env.JIRA_BASE_URL || process.env.JIRA_URL || '');

const HEADERS = [
  'TC ID',
  'Nhóm chức năng',
  'Module',
  'Trường hợp kiểm thử',
  'Tiền điều kiện',
  'Dữ liệu test',
  'Các bước thực hiện',
  'Kết quả mong đợi',
  'Ưu tiên',
  'Mức độ rủi ro',
];
const COL_WIDTHS = [16, 22, 22, 50, 42, 40, 60, 60, 12, 14];

let xrayClient = null;
const preconditionSummaryCache = new Map(); // issueId -> "[PRE-xx] text"

main().catch((error) => {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
});

async function main() {
  validate();

  const jql = CUSTOM_JQL || buildDiscoveryJql();
  log('LOG', `JQL: ${jql}`);
  const issues = await searchTests(jql, MAX_RESULTS);
  if (issues.length === 0) {
    throw new Error(`Không tìm thấy Test issue nào. Kiểm tra PROJECT_KEY/TASK_KEY/label, hoặc truyền --jql.`);
  }
  log('LOG', `Tìm thấy ${issues.length} Test issue.`);

  const xrayReady = USE_XRAY && isUsableCreds(XRAY_CLIENT_ID, XRAY_CLIENT_SECRET);
  if (USE_XRAY && !xrayReady) {
    log('WARN', 'Không có XRAY_CLIENT_ID/SECRET hợp lệ → sẽ đọc steps/precondition từ description (chỉ đủ nếu Phase 1 publish KHÔNG đẩy native).');
  }

  // Apply --only BEFORE the expensive Xray build loop, matching the `tc-<id>`
  // label so we only fetch the requested testcases (not the whole task).
  let targets = issues;
  if (ONLY_TCS.length) {
    const want = new Set(ONLY_TCS.map((o) => labelFor(o)));
    targets = issues.filter((i) => want.has(issueTcLabelId(i)) || ONLY_TCS.includes(issueTcLabelId(i)));
    log('LOG', `--only: lọc còn ${targets.length}/${issues.length} Test.`);
    if (targets.length === 0) throw new Error(`--only không khớp Test nào. TC hợp lệ dùng label tc-*, ví dụ: ${issues.slice(0, 3).map(issueTcLabelId).filter(Boolean).join(', ')}`);
  }

  const built = await mapWithConcurrency(targets, CONCURRENCY, async (issue, idx) => {
    const tc = await buildTestcaseFromIssue(issue, xrayReady);
    if ((idx + 1) % 10 === 0 || idx + 1 === targets.length) log('LOG', `...đã dựng ${idx + 1}/${targets.length}`);
    return tc;
  });
  const testcases = built.filter(Boolean);

  if (testcases.length === 0) {
    throw new Error('Không dựng lại được testcase nào (description/steps rỗng?).');
  }
  testcases.sort((a, b) => naturalCompare(a.tcId, b.tcId));

  const meta = {
    generatedFrom: 'xray-pull',
    projectKey: PROJECT_KEY,
    storyKey: STORY_KEY,
    taskKey: TASK_KEY,
    jql,
    stepsSource: xrayReady ? 'xray+fallback-description' : 'description-only',
    total: testcases.length,
  };

  if (DRY_RUN) {
    const previewPath = path.join(REPORT_DIR, 'xray-pull-preview.json');
    if (WRITE_JSON) saveJsonToFile(previewPath, { ...meta, testcases });
    printSummary(testcases, xrayReady);
    console.log('\n[DRY-RUN] Chưa ghi file canonical. Thêm --write để ghi ra:');
    console.log(`  Excel: ${relativeToRepo(path.join(OUT_DIR, `${sanitize(TASK_KEY)}_from_xray.xlsx`))}`);
    if (WRITE_JSON) console.log(`  Preview JSON đã ghi: ${relativeToRepo(previewPath)}`);
    return;
  }

  const xlsxPath = path.join(OUT_DIR, `${sanitize(TASK_KEY)}_from_xray.xlsx`);
  await writeXlsx(testcases, xlsxPath);
  console.log(`[OK] Đã ghi Excel: ${relativeToRepo(xlsxPath)}`);

  if (WRITE_JSON) {
    const jsonPath = path.join(OUT_DIR, `${sanitize(TASK_KEY)}_from_xray.json`);
    saveJsonToFile(jsonPath, { ...meta, testcases });
  }

  const reportPath = path.join(REPORT_DIR, 'xray-pull-summary.md');
  saveTextToFile(reportPath, buildReport(testcases, meta, xlsxPath));
  console.log(`[OK] Report: ${relativeToRepo(reportPath)}`);
  printSummary(testcases, xrayReady);
}

function validate() {
  if (!JIRA_BASE_URL) throw new Error('Thiếu JIRA_BASE_URL/JIRA_URL.');
  if (!CUSTOM_JQL && !PROJECT_KEY) throw new Error('Thiếu Jira project key. Set JIRA_PROJECT_KEY hoặc --project <KEY> (hoặc dùng --jql).');
  // Auth is validated lazily by buildJiraHeaders() on first request.
}

function buildDiscoveryJql() {
  const parts = [
    `project = "${escapeJql(PROJECT_KEY)}"`,
    `issuetype = "${escapeJql(ISSUE_TYPE)}"`,
    `labels = "${escapeJql(labelFor(MARKER_LABEL))}"`,
    `labels = "${escapeJql(labelFor(`task-${TASK_KEY}`))}"`,
  ];
  return `${parts.join(' AND ')} ORDER BY key ASC`;
}

async function searchTests(jql, maxResults) {
  const url = `${JIRA_BASE_URL}/rest/api/3/search/jql`;
  const headers = buildJiraHeaders();
  const all = [];
  let nextPageToken = null;
  while (all.length < maxResults) {
    const params = {
      jql,
      maxResults: Math.min(maxResults - all.length, 50),
      fields: 'summary,priority,labels,description,issuetype',
    };
    if (nextPageToken) params.nextPageToken = nextPageToken;
    const res = await axios.get(url, { headers, params });
    const data = res.data || {};
    all.push(...(data.issues || []));
    if (data.isLast || !data.nextPageToken || (data.issues || []).length === 0) break;
    nextPageToken = data.nextPageToken;
  }
  return all;
}

async function buildTestcaseFromIssue(issue, xrayReady) {
  const fields = issue.fields || {};
  const md = adfToMarkdown(fields.description);
  const overview = extractOverview(md);
  const sections = extractSections(md);

  const tcId = overview['test case id'] || labelTcId(fields.labels) || issue.key;
  const functionGroup = overview['nhom chuc nang'] || '';
  const userStory = overview['user story'] || '';
  const risk = overview['risk'] || '';
  const priority = (fields.priority && fields.priority.name) || overview['priority'] || '';
  const testData = cleanField(findSection(sections, 'du lieu test'));

  let steps = '';
  let expected = '';
  let precondition = '';
  let stepsFrom = 'description';

  if (xrayReady) {
    try {
      const client = getXrayClient();
      const test = await client.getTest(issue.id);
      const xraySteps = (test && test.steps) || [];
      if (xraySteps.length) {
        steps = xraySteps.map((s, i) => `${i + 1}. ${flatten(s.action)}`).join('\n');
        expected = xraySteps
          .map((s, i) => (flatten(s.result) ? `${i + 1}. ${flatten(s.result)}` : ''))
          .filter(Boolean)
          .join('\n');
        stepsFrom = 'xray';
      }
      const preIds = await client.getTestPreconditionIds(issue.id);
      if (preIds && preIds.length) {
        const summaries = [];
        for (const id of preIds) summaries.push(await getPreconditionSummary(id));
        precondition = summaries.filter(Boolean).join(' ');
      }
    } catch (error) {
      log('WARN', `${issue.key}: đọc Xray lỗi (${error.message}) → dùng description.`);
    }
  }

  // Fallbacks from description when Xray had nothing (native push was off at publish).
  if (!steps) steps = cleanField(findSection(sections, 'cac buoc thuc hien') || findSection(sections, 'buoc thuc hien'));
  if (!expected) expected = cleanField(findSection(sections, 'ket qua mong doi'));
  if (!precondition) precondition = cleanField(findSection(sections, 'tien dieu kien'));

  const module = functionGroup && userStory ? `${functionGroup} / ${userStory}` : (userStory || functionGroup || '');

  return {
    tcId: String(tcId).trim(),
    issueKey: issue.key,
    issueId: issue.id,
    functionGroup,
    module,
    title: (fields.summary || '').trim(),
    precondition: precondition.trim(),
    testData: testData.trim(),
    steps: steps.trim(),
    expected: expected.trim(),
    priority,
    risk,
    stepsFrom,
    preconditionCount: precondition ? (precondition.match(/\[[^\]]+\]/g) || []).length : 0,
  };
}

async function getPreconditionSummary(issueId) {
  if (preconditionSummaryCache.has(issueId)) return preconditionSummaryCache.get(issueId);
  try {
    const url = `${JIRA_BASE_URL}/rest/api/3/issue/${encodeURIComponent(issueId)}`;
    const res = await axios.get(url, { headers: buildJiraHeaders(), params: { fields: 'summary' } });
    const summary = ((res.data && res.data.fields && res.data.fields.summary) || '').trim();
    preconditionSummaryCache.set(issueId, summary);
    return summary;
  } catch (error) {
    log('WARN', `Precondition ${issueId}: không lấy được summary (${error.message}).`);
    preconditionSummaryCache.set(issueId, '');
    return '';
  }
}

// ---- description (ADF→markdown) parsing helpers ----

// Overview appears as a markdown table "| Label | Value |"; map normalized label -> value.
function extractOverview(md) {
  const map = {};
  for (const raw of String(md || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 2) continue;
    if (/^-+$/.test(cells[0])) continue; // separator row
    const key = normKey(cells[0]);
    if (!key || key === 'thong tin') continue; // header row
    if (map[key] === undefined) map[key] = cells[1];
  }
  return map;
}

// Collect the body under each heading, keyed by normalized heading text.
function extractSections(md) {
  const sections = {};
  let cur = null;
  for (const raw of String(md || '').split(/\r?\n/)) {
    const h = raw.match(/^#{1,6}\s+(.*)$/);
    if (h) {
      cur = normKey(h[1]);
      if (!sections[cur]) sections[cur] = [];
      continue;
    }
    if (/^-{3,}$/.test(raw.trim())) { cur = null; continue; } // horizontal rule ends a section
    if (cur) sections[cur].push(raw);
  }
  const out = {};
  for (const k of Object.keys(sections)) out[k] = sections[k].join('\n').trim();
  return out;
}

function findSection(sections, needle) {
  const key = Object.keys(sections).find((k) => k.includes(needle));
  return key ? sections[key] : '';
}

// Drop boilerplate lines that leak into a section from the description's info
// panel (the "... → tab Preconditions/Test details" pointers publish adds when
// native push is on), so testData/steps/expected stay clean.
function cleanField(text) {
  return String(text || '')
    .split(/\r?\n/)
    .filter((l) => !/→.*\btab\b/i.test(l) && !/\btab\s+"?(Preconditions|Test details)"?/i.test(l))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function labelTcId(labels) {
  const match = (labels || []).map(String).find((l) => /^tc-/i.test(l));
  return match ? match.replace(/^tc-/i, '') : '';
}

// The `tc-<id>` label value (lowercased) for an issue, used to match --only.
function issueTcLabelId(issue) {
  return labelTcId((issue.fields && issue.fields.labels) || []).toLowerCase();
}

// Run `fn` over items with a bounded number of concurrent workers, preserving
// input order in the returned array.
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = next++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

// Normalize accents/emoji/punctuation to lowercase ascii words for matching.
function normKey(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function flatten(text) {
  return String(text == null ? '' : text).replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').trim();
}

// ---- output writers ----

async function writeXlsx(testcases, outputPath) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'test-automation-kit (xray-pull)';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('Test Cases', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.addRow(HEADERS);
  for (const tc of testcases) {
    sheet.addRow([
      tc.tcId,
      tc.functionGroup,
      tc.module,
      tc.title,
      tc.precondition,
      tc.testData,
      tc.steps,
      tc.expected,
      tc.priority,
      tc.risk,
    ]);
  }
  sheet.columns.forEach((column, index) => { column.width = COL_WIDTHS[index] || 24; });
  sheet.eachRow((row, rowNumber) => {
    row.height = rowNumber === 1 ? 24 : undefined;
    row.eachCell((cell) => {
      cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
      if (rowNumber === 1) cell.font = { bold: true };
    });
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  await workbook.xlsx.writeFile(outputPath);
}

function buildReport(testcases, meta, xlsxPath) {
  const lines = [];
  lines.push(`# Xray Pull Summary — ${TASK_KEY}`);
  lines.push('');
  lines.push(`> Nguồn: Xray/Jira · Story ${STORY_KEY} · Steps source: ${meta.stepsSource}`);
  lines.push('');
  lines.push(`- Tổng testcase kéo về: **${testcases.length}**`);
  lines.push(`- JQL: \`${meta.jql}\``);
  lines.push(`- Canonical Excel: \`${relativeToRepo(xlsxPath)}\``);
  lines.push('');
  lines.push('| TC ID | Issue | Tiêu đề | #Steps | Steps từ | #Precond |');
  lines.push('|---|---|---|---|---|---|');
  for (const tc of testcases) {
    const nStep = tc.steps ? tc.steps.split('\n').filter((l) => /^\s*\d+[.)]/.test(l)).length : 0;
    const title = tc.title.replace(/\|/g, '\\|').slice(0, 80);
    lines.push(`| ${tc.tcId} | ${tc.issueKey} | ${title} | ${nStep} | ${tc.stepsFrom} | ${tc.preconditionCount} |`);
  }
  lines.push('');
  return lines.join('\n');
}

function printSummary(testcases, xrayReady) {
  const fromXray = testcases.filter((t) => t.stepsFrom === 'xray').length;
  const fromDesc = testcases.length - fromXray;
  console.log('\n--- Tóm tắt ---');
  console.log(`Testcases: ${testcases.length} (steps từ Xray: ${fromXray}, từ description: ${fromDesc})`);
  const missingSteps = testcases.filter((t) => !t.steps);
  if (missingSteps.length) {
    console.log(`⚠️  ${missingSteps.length} TC KHÔNG có steps: ${missingSteps.map((t) => t.tcId).join(', ')}`);
    if (!xrayReady) console.log('    (Có thể Phase 1 đã đẩy steps native → cần XRAY_CLIENT_ID/SECRET để đọc.)');
  }
}

// ---- small shared helpers (mirrors publish_testcases.js conventions) ----

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

function resolvePath(filePath) {
  if (!filePath) return filePath;
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}
function relativeToRepo(filePath) { return path.relative(REPO_ROOT, filePath).replace(/\\/g, '/'); }
function stripTrailingSlash(value) { return String(value || '').replace(/\/+$/, ''); }
function normalizeIssueKey(value) { return String(value || '').trim().toUpperCase(); }
function normalizeProjectKey(value) { return String(value || '').trim().toUpperCase(); }
function normalizeTool(value) {
  const n = String(value || '').trim().toLowerCase();
  return ['xray', 'xrays'].includes(n) ? 'xray' : (n || 'jira');
}
function deriveProjectKey(issueKey) {
  const m = String(issueKey || '').match(/^([A-Z][A-Z0-9]+)-\d+$/i);
  return m ? m[1].toUpperCase() : '';
}
function splitList(value) {
  return String(value || '').split(',').map((s) => s.trim()).filter(Boolean);
}
function escapeJql(value) { return String(value || '').replace(/"/g, '\\"'); }
function labelFor(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 255);
}
function sanitize(value) { return String(value || 'task').replace(/[^A-Za-z0-9_-]+/g, '_'); }
function naturalCompare(a, b) {
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

function getXrayClient() {
  if (!xrayClient) {
    xrayClient = new XrayCloudClient({
      clientId: XRAY_CLIENT_ID,
      clientSecret: XRAY_CLIENT_SECRET,
      baseUrl: XRAY_CLOUD_BASE_URL,
      // Longer backoff than the publish default so a 5-6s 429 window is ridden out.
      maxRetries: Number.parseInt(process.env.XRAY_MAX_RETRIES || '', 10) || 6,
      retryBaseMs: Number.parseInt(process.env.XRAY_RETRY_BASE_MS || '', 10) || 800,
    });
  }
  return xrayClient;
}
