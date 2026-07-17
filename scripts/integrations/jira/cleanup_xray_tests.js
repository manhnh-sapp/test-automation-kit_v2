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
} = require('./utils');

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
const ISSUE_TYPE = argString('issue-type') || process.env.JIRA_TESTCASE_ISSUE_TYPE || 'Test';
const TASK_LABEL = labelFor(`task-${TASK_KEY}`);
const AUTOMATION_LABEL = labelFor(argString('automation-label') || process.env.JIRA_TESTCASE_AUTOMATION_LABEL || 'automation-testcase');
const APPLY = argFlag('apply') || argFlag('publish') || argFlag('no-dry-run') || process.env.XRAY_CLEANUP_APPLY === '1';
const DRY_RUN = !APPLY;
const QA_APPROVED = argFlag('qa-approved') || process.env.XRAY_CLEANUP_QA_APPROVED === '1';
const UNLINK_STALE = argFlag('unlink') || process.env.XRAY_CLEANUP_UNLINK_STALE === '1';
const DEPRECATE_LABELS = unique(
  splitList(argString('deprecate-labels') || process.env.XRAY_CLEANUP_DEPRECATE_LABELS || 'deprecated,out-of-scope,stale-from-excel')
    .map(labelFor)
    .filter(Boolean),
);
const RESTORE_ACTIVE = argFlag('no-restore-active') ? false : process.env.XRAY_CLEANUP_RESTORE_ACTIVE !== '0';
const XRAY_REQUIREMENT_LINK_TYPE =
  argString('requirement-link-type') ||
  process.env.XRAY_REQUIREMENT_LINK_TYPE ||
  process.env.JIRA_TESTCASE_REQUIREMENT_LINK_TYPE ||
  'Tests';
const LIMIT = Number.parseInt(argString('limit') || process.env.XRAY_CLEANUP_LIMIT || '0', 10) || 0;

const JIRA_BASE_URL = stripTrailingSlash(process.env.JIRA_BASE_URL || process.env.JIRA_URL || '');
const JIRA_EMAIL = process.env.JIRA_EMAIL || process.env.JIRA_USERNAME || '';
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN || '';
const JIRA_PAT = process.env.JIRA_PAT || '';

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

  validateForCleanup();

  const currentTcLabels = new Set(testcases.map((testcase) => labelFor(`tc-${testcase.tcId}`)));
  const currentTcIds = new Set(testcases.map((testcase) => testcase.tcId));
  const allPublishedIssues = await searchPublishedTests();
  const publishedIssues = LIMIT > 0 ? allPublishedIssues.slice(0, LIMIT) : allPublishedIssues;
  const results = [];

  for (const issue of publishedIssues) {
    const labels = issue.fields?.labels || [];
    const tcLabels = labels.filter(isTcLabel);
    const inExcel = tcLabels.some((label) => currentTcLabels.has(label));
    const stale = tcLabels.length > 0 && !inExcel;
    const hasDeprecatedLabels = DEPRECATE_LABELS.some((label) => labels.includes(label));
    const storyLinks = findStoryLinks(issue);
    const item = {
      issueKey: issue.key,
      summary: issue.fields?.summary || '',
      status: issue.fields?.status?.name || '',
      tcLabels,
      tcId: tcLabels.map((label) => label.slice(3)).join(', '),
      inExcel,
      dryRun: DRY_RUN,
      action: 'active_keep',
      addedLabels: [],
      removedLabels: [],
      unlinkAction: UNLINK_STALE ? 'none' : 'disabled',
      storyLinkIds: storyLinks.map((link) => link.id).filter(Boolean),
      error: '',
    };

    if (tcLabels.length === 0) {
      item.action = 'skipped_no_tc_label';
      results.push(item);
      continue;
    }

    if (stale) {
      await processStaleIssue(issue, labels, storyLinks, item);
      results.push(item);
      continue;
    }

    if (RESTORE_ACTIVE && hasDeprecatedLabels) {
      await processActiveRestore(issue, labels, item);
      results.push(item);
      continue;
    }

    results.push(item);
  }

  writeReports({
    excelFiles,
    currentTcIds: Array.from(currentTcIds).sort(),
    totalRows: testcases.length,
    totalPublished: allPublishedIssues.length,
    selectedPublished: publishedIssues.length,
    results,
  });

  const counts = countBy(results, 'action');
  const unlinkCounts = countBy(results, 'unlinkAction');
  const errors = results.filter((item) => item.action === 'error');

  console.log(`Xray testcase cleanup ${DRY_RUN ? 'dry-run' : 'apply'} complete.`);
  console.log(`Excel files: ${excelFiles.length}`);
  console.log(`Excel testcases: ${testcases.length}`);
  console.log(`Published Xray Tests scanned: ${publishedIssues.length}/${allPublishedIssues.length}`);
  console.log(`Planned deprecate: ${counts.planned_deprecate || 0}, Deprecated: ${counts.deprecated || 0}, Already deprecated: ${counts.already_deprecated || 0}`);
  console.log(`Planned restore: ${counts.planned_restore || 0}, Restored: ${counts.restored || 0}, Active keep: ${counts.active_keep || 0}`);
  console.log(`Unlink: planned=${unlinkCounts.planned_unlink || 0}, unlinked=${unlinkCounts.unlinked || 0}, disabled=${unlinkCounts.disabled || 0}`);
  console.log(`Errors: ${errors.length}`);
  console.log(`Report: ${path.join(REPORT_DIR, 'jira-testcase-cleanup-summary.md')}`);

  if (errors.length > 0) process.exitCode = 1;
}

async function processStaleIssue(issue, labels, storyLinks, item) {
  const labelsToAdd = DEPRECATE_LABELS.filter((label) => !labels.includes(label));
  item.addedLabels = labelsToAdd;
  item.action = labelsToAdd.length > 0 ? 'planned_deprecate' : 'already_deprecated';

  if (UNLINK_STALE) {
    item.unlinkAction = storyLinks.length > 0 ? 'planned_unlink' : 'no_story_link';
  }

  if (DRY_RUN) return;

  try {
    if (labelsToAdd.length > 0) {
      await updateIssueLabels(issue.key, labelsToAdd, []);
      item.action = 'deprecated';
    }

    if (UNLINK_STALE) {
      if (storyLinks.length === 0) {
        item.unlinkAction = 'no_story_link';
      } else {
        for (const link of storyLinks) {
          await deleteIssueLink(link.id);
        }
        item.unlinkAction = 'unlinked';
      }
    }
  } catch (error) {
    item.action = 'error';
    item.error = error.message;
  }
}

async function processActiveRestore(issue, labels, item) {
  const labelsToRemove = DEPRECATE_LABELS.filter((label) => labels.includes(label));
  item.removedLabels = labelsToRemove;
  item.action = labelsToRemove.length > 0 ? 'planned_restore' : 'active_keep';

  if (DRY_RUN || labelsToRemove.length === 0) return;

  try {
    await updateIssueLabels(issue.key, [], labelsToRemove);
    item.action = 'restored';
  } catch (error) {
    item.action = 'error';
    item.error = error.message;
  }
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
        title: indexes.title >= 0 ? cells[indexes.title] || '' : '',
        sourceExcel: excelFile,
      };

      if (!byTcId.has(testcase.tcId)) byTcId.set(testcase.tcId, testcase);
    });
  }

  return Array.from(byTcId.values());
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
    if (indexes.tcId >= 0) return { headerRowNumber: rowNumber, headers, indexes };
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
    title: findHeader(normalized, ['truong hop kiem thu', 'test case', 'scenario', 'test title']),
  };
}

function findHeader(normalizedHeaders, candidates) {
  return normalizedHeaders.findIndex((header) => candidates.some((candidate) => header === candidate || header.includes(candidate)));
}

function validateForCleanup() {
  if (!PROJECT_KEY) throw new Error('Missing Jira project key. Set JIRA_PROJECT_KEY or pass --project <KEY>.');
  if (!TASK_KEY) throw new Error('Missing TASK_KEY or --task <TASK_KEY>.');
  if (!JIRA_BASE_URL) throw new Error('Missing JIRA_BASE_URL or JIRA_URL.');
  if (!JIRA_PAT && (!JIRA_EMAIL || !JIRA_API_TOKEN)) {
    throw new Error('Missing Jira auth. Set JIRA_EMAIL + JIRA_API_TOKEN, or JIRA_PAT.');
  }
  if (!DRY_RUN && !QA_APPROVED) {
    throw new Error('Missing QA approval. Pass --qa-approved or set XRAY_CLEANUP_QA_APPROVED=1 before applying Xray lifecycle cleanup.');
  }
  if (!DRY_RUN && DEPRECATE_LABELS.length === 0) {
    throw new Error('No deprecate labels configured. Set XRAY_CLEANUP_DEPRECATE_LABELS or pass --deprecate-labels.');
  }
}

async function searchPublishedTests() {
  const jqlParts = [
    `project = ${PROJECT_KEY}`,
    `issuetype = "${escapeJql(ISSUE_TYPE)}"`,
    `labels = "${escapeJql(AUTOMATION_LABEL)}"`,
    `labels = "${escapeJql(TASK_LABEL)}"`,
  ];
  const jql = `${jqlParts.join(' AND ')} ORDER BY created DESC`;
  const issues = [];
  let startAt = 0;
  const maxResults = 100;

  while (true) {
    const apiPath = `/rest/api/3/search?jql=${encodeURIComponent(jql)}&fields=summary,labels,issuelinks,status&startAt=${startAt}&maxResults=${maxResults}`;
    const response = await requestJson('GET', apiPath);
    const page = response.issues || [];
    issues.push(...page);

    if (page.length === 0) break;
    if (typeof response.total === 'number' && issues.length >= response.total) break;
    startAt += page.length;
  }

  return issues;
}

function findStoryLinks(issue) {
  if (!STORY_KEY) return [];

  const links = issue.fields?.issuelinks || [];
  return links.filter((link) => {
    if (XRAY_REQUIREMENT_LINK_TYPE && link.type?.name !== XRAY_REQUIREMENT_LINK_TYPE) return false;
    const inwardKey = normalizeIssueKey(link.inwardIssue?.key || '');
    const outwardKey = normalizeIssueKey(link.outwardIssue?.key || '');
    return inwardKey === STORY_KEY || outwardKey === STORY_KEY;
  });
}

function isTcLabel(label) {
  return /^tc-[a-z0-9_-]+$/i.test(String(label || ''));
}

async function updateIssueLabels(issueKey, addLabels, removeLabels) {
  const updates = [
    ...addLabels.map((label) => ({ add: label })),
    ...removeLabels.map((label) => ({ remove: label })),
  ];

  if (updates.length === 0) return {};
  return requestJson('PUT', `/rest/api/3/issue/${encodeURIComponent(issueKey)}`, {
    update: {
      labels: updates,
    },
  });
}

async function deleteIssueLink(linkId) {
  if (!linkId) return {};
  return requestJson('DELETE', `/rest/api/3/issueLink/${encodeURIComponent(linkId)}`);
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

function escapeJql(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function writeReports(context) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const jsonPath = path.join(REPORT_DIR, 'jira-testcase-cleanup.json');
  const mdPath = path.join(REPORT_DIR, 'jira-testcase-cleanup-summary.md');
  const json = {
    generatedAt: new Date().toISOString(),
    projectOutputDir: relativeToRepo(PROJECT_OUTPUT_DIR),
    taskKey: TASK_KEY,
    taskOutputDir: relativeToRepo(TASK_OUTPUT_DIR),
    storyKey: STORY_KEY,
    projectKey: PROJECT_KEY,
    issueType: ISSUE_TYPE,
    taskLabel: TASK_LABEL,
    automationLabel: AUTOMATION_LABEL,
    requirementLinkType: XRAY_REQUIREMENT_LINK_TYPE,
    dryRun: DRY_RUN,
    qaApproved: QA_APPROVED,
    unlinkStale: UNLINK_STALE,
    restoreActive: RESTORE_ACTIVE,
    deprecateLabels: DEPRECATE_LABELS,
    excelFiles: context.excelFiles.map(relativeToRepo),
    currentTcIds: context.currentTcIds,
    totalRows: context.totalRows,
    totalPublished: context.totalPublished,
    selectedPublished: context.selectedPublished,
    results: context.results,
  };

  fs.writeFileSync(jsonPath, JSON.stringify(json, null, 2), 'utf8');
  fs.writeFileSync(mdPath, renderMarkdownSummary(json), 'utf8');
}

function renderMarkdownSummary(report) {
  const counts = countBy(report.results, 'action');
  const unlinkCounts = countBy(report.results, 'unlinkAction');
  const lines = [
    '# Jira Testcase Cleanup Summary',
    '',
    `- Task key: ${report.taskKey}`,
    `- Jira story: ${report.storyKey || '-'}`,
    `- Jira project: ${report.projectKey}`,
    `- Issue type: ${report.issueType}`,
    `- Mode: ${report.dryRun ? 'dry-run' : 'apply'}`,
    `- QA approved: ${report.qaApproved ? 'yes' : 'no'}`,
    `- Excel source of truth: ${report.excelFiles.join(', ')}`,
    `- Excel testcases: ${report.totalRows}`,
    `- Published Xray Tests scanned: ${report.selectedPublished}/${report.totalPublished}`,
    `- Deprecate labels: ${report.deprecateLabels.join(', ') || '-'}`,
    `- Restore active from deprecated: ${report.restoreActive ? 'enabled' : 'disabled'}`,
    `- Unlink stale from story: ${report.unlinkStale ? 'enabled' : 'disabled'}`,
    `- Planned deprecate: ${counts.planned_deprecate || 0}`,
    `- Deprecated: ${counts.deprecated || 0}`,
    `- Already deprecated: ${counts.already_deprecated || 0}`,
    `- Planned restore: ${counts.planned_restore || 0}`,
    `- Restored: ${counts.restored || 0}`,
    `- Active keep: ${counts.active_keep || 0}`,
    `- Skipped no TC label: ${counts.skipped_no_tc_label || 0}`,
    `- Errors: ${counts.error || 0}`,
    `- Unlink: planned=${unlinkCounts.planned_unlink || 0}, unlinked=${unlinkCounts.unlinked || 0}, no_story_link=${unlinkCounts.no_story_link || 0}, disabled=${unlinkCounts.disabled || 0}`,
    '',
    '| Issue | TC Label | In Excel | Action | Label Changes | Story Link | Error |',
    '|---|---|---:|---|---|---|---|',
  ];

  for (const item of report.results) {
    const labelChanges = [
      item.addedLabels?.length ? `add: ${item.addedLabels.join(', ')}` : '',
      item.removedLabels?.length ? `remove: ${item.removedLabels.join(', ')}` : '',
    ].filter(Boolean).join('<br>') || '-';
    lines.push(`| ${escapeMd(item.issueKey)} | ${escapeMd(item.tcLabels.join(', ') || '-')} | ${item.inExcel ? 'yes' : 'no'} | ${escapeMd(item.action)} | ${escapeMd(labelChanges)} | ${escapeMd(item.unlinkAction || '-')} | ${escapeMd(item.error || '-')} |`);
  }

  lines.push('');
  lines.push('Excel remains the source of truth. Cleanup never hard-deletes Xray Test issues; it only labels stale tests and optionally unlinks them from the story.');
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
