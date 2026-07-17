#!/usr/bin/env node
/**
 * Create Jira Sub-bug issues for failed Playwright test cases.
 *
 * Default artifact paths are resolved from:
 *   <PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/test-results/results.json
 *   <PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/test-results/artifacts/
 *   <PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/test-cases/
 *   With RUN_ID:
 *   <PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/test-results/runs/<RUN_ID>/results.json
 *   <PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/test-results/runs/<RUN_ID>/artifacts/
 *
 * Usage:
 *   node scripts/integrations/jira/bug_reporter.js --task <TASK_KEY> --story <JIRA_STORY_KEY> --dry-run
 *   node scripts/integrations/jira/bug_reporter.js --task <TASK_KEY> --story <JIRA_STORY_KEY>
 *   node scripts/integrations/jira/bug_reporter.js --task <TASK_KEY> --story <JIRA_STORY_KEY> --tc-id <TC_ID>
 *   node scripts/integrations/jira/bug_reporter.js --task <TASK_KEY> --story <JIRA_STORY_KEY> --run-id <RUN_ID>
 */

const fs = require('fs');
const path = require('path');
const {
  getProjectOutputDir,
  getRunId,
  getTaskKey,
  getTaskOutputDir,
  getTestResultsDir,
  loadEnvFiles,
} = require('../../utils/runtime_config');

const SCRIPT_DIR = __dirname;
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..', '..');
const ASSIGNEE_CACHE_PATH = path.join(REPO_ROOT, '.agent', 'config', '.assignee_cache.json');

loadEnvFiles([
  path.join(SCRIPT_DIR, '.env.local'),
  path.join(SCRIPT_DIR, '.env'),
]);

const args = parseArgs(process.argv.slice(2));
const argString = (key) => (typeof args[key] === 'string' ? args[key].trim() : '');
const argFlag = (key) => args[key] === true || args[key] === 'true';

const PROJECT_OUTPUT_DIR = resolvePath(
  argString('project-output') || getProjectOutputDir(),
);
const TASK_KEY = getTaskKey({ task: argString('task') });
const TASK_OUTPUT_DIR = resolvePath(
  argString('task-output') || getTaskOutputDir({ projectOutputDir: PROJECT_OUTPUT_DIR, taskKey: TASK_KEY }),
);
const RUN_ID = getRunId(argString('run-id') || process.env.RUN_ID);
const TEST_RESULTS_DIR = resolvePath(getTestResultsDir({ taskOutputDir: TASK_OUTPUT_DIR, runId: RUN_ID }));

const RESULTS_FILE = resolvePath(
  argString('results') || path.join(TEST_RESULTS_DIR, 'results.json'),
);
const SELECTION_FILE = resolvePath(
  argString('selection') || path.join(TEST_RESULTS_DIR, 'selected-testcases.json'),
);
const ARTIFACTS_DIR = resolvePath(
  argString('artifacts') || path.join(TEST_RESULTS_DIR, 'artifacts'),
);
const TESTCASES_DIR = resolvePath(
  argString('testcases') || path.join(TASK_OUTPUT_DIR, 'test-cases'),
);
const STORY_KEY = argString('story') || process.env.JIRA_STORY_KEY || TASK_KEY;
const PROJECT_KEY = argString('project') || process.env.JIRA_PROJECT_KEY || deriveProjectKey(STORY_KEY);
const DRY_RUN = argFlag('dry-run');
const WRITE_LOG = argFlag('write-log') || (!DRY_RUN && !argFlag('no-write-log'));

const JIRA_BASE_URL = stripTrailingSlash(process.env.JIRA_BASE_URL || process.env.JIRA_URL || '');
const JIRA_EMAIL = process.env.JIRA_EMAIL || process.env.JIRA_USERNAME || '';
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN || '';
const JIRA_PAT = process.env.JIRA_PAT || '';
const DEV_ASSIGNEE = process.env.JIRA_DEV_ASSIGNEE || '';
const FE_DEV_ASSIGNEE = process.env.JIRA_FE_ASSIGNEE || '';
const BE_DEV_ASSIGNEE = process.env.JIRA_BE_ASSIGNEE || '';
const ISSUE_TYPE = process.env.JIRA_BUG_ISSUE_TYPE || 'Sub-bug';
const JIRA_SPRINT_FIELD_ID = argString('sprint-field') || process.env.JIRA_SPRINT_FIELD_ID || '';
const BUG_LAYER_OVERRIDE = normalizeBugLayer(argString('layer') || process.env.JIRA_BUG_LAYER || '');
const TC_ID_FILTER = normalizeTcId(argString('tc-id') || argString('tc') || process.env.JIRA_BUG_TC_ID || '');
const UPDATE_ISSUE_KEY = normalizeIssueKey(argString('update-issue') || argString('issue') || '');
const REQUIRED_PARENT_FIELD_IDS = ['customfield_10039', 'customfield_10037'];
const STANDARD_PARENT_COPY_FIELD_IDS = ['fixVersions'];
const JIRA_PRIORITY_NAMES = ['Highest', 'High', 'Medium', 'Low', 'Lowest'];
const JIRA_PRIORITY_ALIASES = {
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

function resolvePath(inputPath) {
  if (!inputPath) return inputPath;
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(REPO_ROOT, inputPath);
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

function deriveProjectKey(issueKey) {
  const match = String(issueKey || '').match(/^([A-Z][A-Z0-9]+)-\d+$/i);
  return match ? match[1].toUpperCase() : '';
}

function normalizeIssueKey(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeBugLayer(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (['FE', 'FRONTEND', 'UI', 'E2E'].includes(normalized)) return 'FE';
  if (['BE', 'BACKEND', 'API'].includes(normalized)) return 'BE';
  return '';
}

function normalizeJiraPriority(value) {
  const normalized = normalizeForMatch(
    String(value || '')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[*_]/g, ' '),
  );
  if (!normalized) return '';

  const compact = normalized.replace(/\s+/g, '');
  if (JIRA_PRIORITY_ALIASES[compact]) return JIRA_PRIORITY_ALIASES[compact];

  const words = normalized.split(/\s+/).filter(Boolean);
  for (const priorityName of JIRA_PRIORITY_NAMES) {
    if (words.includes(normalizeForMatch(priorityName))) return priorityName;
  }
  for (const word of words) {
    if (JIRA_PRIORITY_ALIASES[word]) return JIRA_PRIORITY_ALIASES[word];
  }

  return '';
}

function isChildIssueType(issueType) {
  return /sub|child/i.test(String(issueType || ''));
}

function validate() {
  if (!STORY_KEY) {
    fail('Missing story key. Set JIRA_STORY_KEY or pass --story <KEY>.');
  }
  if (!RESULTS_FILE || !fs.existsSync(RESULTS_FILE)) {
    fail(`results.json not found: ${RESULTS_FILE}`);
  }
  if (!PROJECT_KEY) {
    fail('Missing Jira project key. Set JIRA_PROJECT_KEY or pass --project <KEY>.');
  }

  if (DRY_RUN) return;

  if (!JIRA_BASE_URL) fail('Missing JIRA_BASE_URL or JIRA_URL.');
  if (!JIRA_PAT && (!JIRA_EMAIL || !JIRA_API_TOKEN)) {
    fail('Missing Jira auth. Set JIRA_EMAIL + JIRA_API_TOKEN, or JIRA_PAT.');
  }
  if (!/^sub-bug$/i.test(String(ISSUE_TYPE || '').trim())) {
    fail('Jira bug work type must be Sub-bug. Do not use Sub-task for bug reports.');
  }
  if (!isChildIssueType(ISSUE_TYPE)) {
    fail('Jira bug must be a child issue type.');
  }
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function jiraHeaders(extra = {}, options = {}) {
  const includeJsonContentType = options.json !== false;
  const headers = {
    Accept: 'application/json',
    ...extra,
  };

  if (includeJsonContentType) headers['Content-Type'] = 'application/json';

  if (JIRA_PAT) {
    headers.Authorization = `Bearer ${JIRA_PAT}`;
  } else {
    const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64');
    headers.Authorization = `Basic ${auth}`;
  }

  return headers;
}

async function jiraRequest(method, endpoint, options = {}) {
  const url = new URL(`${JIRA_BASE_URL}${endpoint}`);
  for (const [key, value] of Object.entries(options.params || {})) {
    if (value !== undefined && value !== null) url.searchParams.set(key, value);
  }

  const controller = new AbortController();
  const timeoutMs = options.timeout || 30000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const isFormData = Boolean(options.formData);
    const response = await fetch(url, {
      method,
      headers: jiraHeaders(options.headers || {}, { json: !isFormData }),
      body: isFormData ? options.formData : options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });

    const text = await response.text();
    const data = parseJsonOrText(text);
    if (!response.ok) throw buildApiError(response, data);

    return {
      data,
      status: response.status,
      headers: headersToObject(response.headers),
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error(`Request timeout after ${timeoutMs}ms`);
      timeoutError.response = null;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function parseJsonOrText(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function headersToObject(headers) {
  const out = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

function buildApiError(response, data) {
  const error = new Error(`Jira API ${response.status}`);
  error.response = {
    status: response.status,
    data,
    headers: headersToObject(response.headers),
  };
  return error;
}

async function withRetry(fn, retries = 3) {
  let lastError;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const status = error.response?.status;

      if (status === 429 && attempt < retries - 1) {
        const retryAfter = Number(error.response.headers?.['retry-after'] || 5);
        await sleep(retryAfter * 1000);
        continue;
      }

      if ((!status || status >= 500) && attempt < retries - 1) {
        await sleep(1000 * (attempt + 1));
        continue;
      }

      throw error;
    }
  }
  throw lastError;
}

async function resolveAssigneeAccountId(emailOrAccountId) {
  if (!emailOrAccountId) return null;
  if (/^[a-f0-9]{24,}$/i.test(emailOrAccountId)) return emailOrAccountId;

  const cache = readJson(ASSIGNEE_CACHE_PATH, {});
  if (cache[emailOrAccountId]) return cache[emailOrAccountId];

  try {
    const response = await withRetry(() =>
      jiraRequest('GET', '/rest/api/3/user/search', {
        params: { query: emailOrAccountId },
      }),
    );
    const accountId = response.data?.[0]?.accountId;
    if (!accountId) return null;

    cache[emailOrAccountId] = accountId;
    fs.mkdirSync(path.dirname(ASSIGNEE_CACHE_PATH), { recursive: true });
    fs.writeFileSync(ASSIGNEE_CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
    return accountId;
  } catch (error) {
    console.warn(`WARN: Could not resolve assignee "${emailOrAccountId}": ${formatApiError(error)}`);
    return null;
  }
}

async function resolveBugAssigneeAccountId(layer, parentIssue, cache) {
  const normalizedLayer = normalizeBugLayer(layer) || 'FE';
  const configuredAssignee =
    DEV_ASSIGNEE ||
    (normalizedLayer === 'BE' ? BE_DEV_ASSIGNEE : FE_DEV_ASSIGNEE);

  if (configuredAssignee) {
    const cacheKey = `${normalizedLayer}:${configuredAssignee}`;
    if (!cache[cacheKey]) cache[cacheKey] = await resolveAssigneeAccountId(configuredAssignee);
    if (cache[cacheKey]) {
      console.log(`Assignee: ${normalizedLayer} bug assigned by project rule.`);
      return cache[cacheKey];
    }
  }

  const parentAssigneeId = parentIssue?.fields?.assignee?.accountId || null;
  if (parentAssigneeId) {
    console.log('Assignee: using parent Story/Task assignee as fallback.');
    return parentAssigneeId;
  }

  return null;
}

async function searchExistingBug(tcId) {
  const jql = `project = "${PROJECT_KEY}" AND parent = "${STORY_KEY}" AND labels = "${tcId}" AND labels = "auto-bug" AND statusCategory != Done`;
  try {
    const response = await withRetry(() =>
      jiraRequest('GET', '/rest/api/3/search/jql', {
        params: {
          jql,
          maxResults: 1,
          fields: 'key,summary,status',
        },
      }),
    );
    return response.data?.issues?.[0] || null;
  } catch (error) {
    try {
      const response = await withRetry(() =>
        jiraRequest('GET', '/rest/api/3/search', {
          params: {
            jql,
            maxResults: 1,
            fields: 'key,summary,status',
          },
        }),
      );
      return response.data?.issues?.[0] || null;
    } catch (fallbackError) {
      console.warn(`WARN: Duplicate check failed for ${tcId}: ${formatApiError(fallbackError)}`);
      return null;
    }
  }
}

async function assertParentIssue() {
  try {
    const parentCopyFieldIds = await getParentCopyFieldIds();
    const response = await withRetry(() =>
      jiraRequest('GET', `/rest/api/3/issue/${encodeURIComponent(STORY_KEY)}`, {
        params: {
          fields: ['key', 'summary', 'issuetype', 'status', 'assignee', ...parentCopyFieldIds].join(','),
        },
      }),
    );

    const issue = response.data;
    if (!issue?.key) fail(`Parent Story/Task not found: ${STORY_KEY}`);
    issue.parentCopyFieldIds = parentCopyFieldIds;
    console.log(`Parent Story/Task verified: ${issue.key} - ${issue.fields?.summary || ''}`);
    return issue;
  } catch (error) {
    fail(`Cannot verify parent Story/Task "${STORY_KEY}": ${formatApiError(error)}`);
  }
}

async function getParentCopyFieldIds() {
  const sprintFieldId = await resolveSprintFieldId();
  return uniqueLabels([...REQUIRED_PARENT_FIELD_IDS, ...STANDARD_PARENT_COPY_FIELD_IDS, sprintFieldId].filter(Boolean));
}

async function resolveSprintFieldId() {
  if (JIRA_SPRINT_FIELD_ID) return JIRA_SPRINT_FIELD_ID;

  try {
    const response = await withRetry(() => jiraRequest('GET', '/rest/api/3/field'));
    const sprintField = (response.data || []).find((field) => /^Sprint$/i.test(field.name || ''));
    return sprintField?.id || '';
  } catch (error) {
    console.warn(`WARN: Could not resolve Jira Sprint field: ${formatApiError(error)}`);
    return '';
  }
}

async function createIssue({ tcId, summary, description, assigneeId, layer, priority, parentIssue }) {
  const fields = {
    project: { key: PROJECT_KEY },
    issuetype: { name: ISSUE_TYPE },
    summary,
    description: buildAdfDescription(description),
    parent: { key: STORY_KEY },
    labels: uniqueLabels(['auto-bug', tcId, String(layer || '').toLowerCase()]),
  };

  if (assigneeId) {
    fields.assignee = { accountId: assigneeId };
  }

  const jiraPriority = normalizeJiraPriority(priority);
  if (jiraPriority) {
    fields.priority = { name: jiraPriority };
  }

  copyRequiredParentFields(fields, parentIssue);

  const response = await withRetry(() => jiraRequest('POST', '/rest/api/3/issue', { body: { fields } }));
  return response.data.key;
}

async function updateIssue(issueKey, { summary, description, priority, parentIssue }) {
  const fields = {
    summary,
    description: buildAdfDescription(description),
  };

  const jiraPriority = normalizeJiraPriority(priority);
  if (jiraPriority) {
    fields.priority = { name: jiraPriority };
  }

  copyRequiredParentFields(fields, parentIssue);

  await withRetry(() =>
    jiraRequest('PUT', `/rest/api/3/issue/${encodeURIComponent(issueKey)}`, {
      body: { fields },
    }),
  );
  return issueKey;
}

function copyRequiredParentFields(fields, parentIssue) {
  const fieldIds = parentIssue?.parentCopyFieldIds || [...REQUIRED_PARENT_FIELD_IDS, ...STANDARD_PARENT_COPY_FIELD_IDS];
  for (const fieldId of fieldIds) {
    const value = parentIssue?.fields?.[fieldId];
    if (!hasParentFieldValue(value)) continue;

    fields[fieldId] = normalizeCopiedParentFieldValue(fieldId, value, parentIssue);
  }
}

function hasParentFieldValue(value) {
  if (value === undefined || value === null || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function normalizeCopiedParentFieldValue(fieldId, value, parentIssue) {
  if (fieldId === 'fixVersions' && Array.isArray(value)) {
    return value
      .map((version) => {
        if (version?.id) return { id: String(version.id) };
        if (version?.name) return { name: version.name };
        return null;
      })
      .filter(Boolean);
  }

  const sprintFieldId = parentIssue?.parentCopyFieldIds?.find((id) => id === fieldId && !REQUIRED_PARENT_FIELD_IDS.includes(id) && id !== 'fixVersions');
  if (sprintFieldId) {
    const sprintValues = Array.isArray(value) ? value : [value];
    const sprintIds = sprintValues
      .map((item) => {
        if (typeof item === 'number') return item;
        if (typeof item === 'string' && /^\d+$/.test(item)) return Number(item);
        if (item?.id !== undefined && item.id !== null) return Number(item.id);
        return null;
      })
      .filter((item) => Number.isFinite(item));
    if (sprintIds.length) return sprintIds;
  }

  return value;
}

async function uploadAttachment(issueKey, filePath) {
  if (!filePath || !fs.existsSync(filePath)) return false;
  if (!isJiraEvidenceAttachment(filePath)) {
    console.warn(`WARN: Skipped non-visual Jira evidence attachment: ${path.basename(filePath)}`);
    return false;
  }

  const form = new FormData();
  form.append('file', await fs.openAsBlob(filePath), path.basename(filePath));

  try {
    await withRetry(() =>
      jiraRequest('POST', `/rest/api/3/issue/${issueKey}/attachments`, {
        formData: form,
        headers: {
          'X-Atlassian-Token': 'no-check',
        },
        timeout: 60000,
      }),
    );
    return true;
  } catch (error) {
    console.warn(`WARN: Attachment upload failed for ${path.basename(filePath)}: ${formatApiError(error)}`);
    return false;
  }
}

function isJiraEvidenceAttachment(filePath) {
  return /\.(png|jpe?g|webp|gif|mp4|webm)$/i.test(String(filePath || ''));
}

function uniqueLabels(labels) {
  return [...new Set(labels.filter(Boolean).map((label) => label.replace(/[^A-Za-z0-9_-]/g, '_')))];
}

function buildAdfDescription(payload) {
  const content = [];

  addHeading(content, 'Tiền điều kiện:');
  addParagraph(content, payload.preconditions || '(không có thông tin)');
  addHeading(content, 'Bước:');
  addListOrParagraph(content, payload.steps, '(xem file test case gốc)');
  addHeading(content, 'Kết quả hiện tại:');
  addBulletListOrParagraph(content, payload.actualResult, '(không có thông tin)');
  addHeading(content, 'Kết quả mong muốn:');
  addBulletListOrParagraph(content, payload.expectedResult, '(xem file test case gốc)');

  return { type: 'doc', version: 1, content };
}

function addHeading(content, text) {
  content.push({
    type: 'heading',
    attrs: { level: 3 },
    content: [{ type: 'text', text }],
  });
}

function addParagraph(content, text) {
  const safeText = String(text || '').slice(0, 30000);
  content.push({
    type: 'paragraph',
    content: [{ type: 'text', text: safeText }],
  });
}

function addListOrParagraph(content, value, fallback) {
  const items = Array.isArray(value)
    ? value.filter(Boolean).map(String)
    : String(value || '')
        .split(/\r?\n/)
        .map((line) => line.replace(/^\d+[.)]\s*/, '').trim())
        .filter(Boolean);

  if (!items.length) {
    addParagraph(content, fallback);
    return;
  }

  content.push({
    type: 'orderedList',
    content: items.map((item) => ({
      type: 'listItem',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: item.slice(0, 3000) }],
        },
      ],
    })),
  });
}

// Kết quả hiện tại / mong muốn: mỗi ý một bullet cho dễ đọc. Nhận string (tách theo dòng, hỗ trợ <br>)
// hoặc mảng ý. 1 ý -> paragraph; >=2 ý -> bulletList.
function splitIdeas(value) {
  return (Array.isArray(value)
    ? value.filter(Boolean).map(String)
    : String(value || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .split(/\r?\n/))
    .map((line) => line.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, '').trim())
    .filter(Boolean);
}

function addBulletListOrParagraph(content, value, fallback) {
  const items = splitIdeas(value);
  if (!items.length) {
    addParagraph(content, fallback);
    return;
  }
  if (items.length === 1) {
    addParagraph(content, items[0]);
    return;
  }
  content.push({
    type: 'bulletList',
    content: items.map((item) => ({
      type: 'listItem',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: item.slice(0, 3000) }],
        },
      ],
    })),
  });
}

function extractFailedTests(resultsPath) {
  const raw = readJson(resultsPath);
  const failed = [];

  function walkSuites(suites = [], inheritedFile = '') {
    for (const suite of suites) {
      const suiteFile = suite.file || inheritedFile;
      walkSuites(suite.suites || [], suiteFile);

      for (const spec of suite.specs || []) {
        for (const test of spec.tests || []) {
          const lastResult = (test.results || [])[test.results.length - 1];
          const status = lastResult?.status || test.status;
          if (!['failed', 'timedOut', 'interrupted'].includes(status)) continue;

          const title = [...(spec.titlePath || []), spec.title].filter(Boolean).join(' > ');
          const tcId = extractTcId(title || spec.title || test.title || test.id);

          failed.push({
            tcId,
            title: spec.title || test.title || tcId,
            status,
            sourceFile: spec.file || suiteFile,
            error: normalizeError(lastResult?.error || lastResult?.errors?.[0]),
            steps: extractResultSteps(lastResult),
          });
        }
      }
    }
  }

  walkSuites(raw.suites || []);
  return failed;
}

function extractTcId(text) {
  const source = String(text || '');
  const full = source.match(/[A-Z0-9]+(?:[-_][A-Z0-9]+)*[-_]TC[-_]?\d+/i);
  if (full) return normalizeTcId(full[0]);

  const generated = source.match(/\b(?:UI|API|E2E)[-_]\d+\b/i);
  if (generated) return normalizeTcId(generated[0]);

  const short = source.match(/\bTC[-_]?\d+\b/i);
  if (short) return normalizeTcId(short[0]);

  return normalizeTcId(source.slice(0, 60) || 'UNKNOWN_TC');
}

function normalizeTcId(value) {
  return String(value)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function extractResultSteps(result) {
  const steps = [];

  function walk(stepList = []) {
    for (const step of stepList) {
      if (step.title) steps.push(step.title);
      walk(step.steps || []);
    }
  }

  walk(result?.steps || []);
  return [...new Set(steps)].slice(0, 30);
}

function normalizeError(error) {
  if (!error) return 'No error message in Playwright results.json';
  return stripAnsi(String(error.message || error.value || error.stack || JSON.stringify(error))).slice(0, 4000);
}

function determineBugLayer(testCase, tcInfo = {}) {
  if (BUG_LAYER_OVERRIDE) return BUG_LAYER_OVERRIDE;

  const source = [
    testCase.sourceFile,
    tcInfo.source,
    testCase.tcId,
    testCase.title,
  ].filter(Boolean).join(' ').toLowerCase();

  if (/\b(api|be|backend|contract|request|response)\b/.test(source)) return 'BE';
  if (/\b(fe|frontend|ui|e2e|browser|page|screen)\b/.test(source)) return 'FE';
  return 'FE';
}

function buildBugSummary(layer, title, actualResult, tcId = '') {
  const rawTitle = stripPositiveNegativePrefix(String(title || '').replace(/\s+/g, ' ').trim());
  const rawActual = stripAnsi(String(actualResult || '').replace(/\s+/g, ' ').trim());
  const isTcOnlyTitle = normalizeTcId(rawTitle) === normalizeTcId(tcId);
  let bugName = '';

  const missingHeaders = rawActual.match(/Missing headers:\s*([^]+?)(?:\s+expect\(|\s+Expected:|$)/i);
  if (missingHeaders) {
    bugName = `Khong hien thi du cot nghiep vu bat buoc: ${missingHeaders[1].trim()}`;
  }

  if (!bugName && !isTcOnlyTitle) bugName = rawTitle;
  if (!bugName) bugName = rawActual || 'Loi phat hien khi execute automation';
  return `[${layer}] ${bugName}`.slice(0, 255);
}

function stripPositiveNegativePrefix(value) {
  return String(value || '').replace(/^\[(Positive|Negative|Boundary|Edge)\]\s*/i, '').trim();
}

function stripAnsi(value) {
  return String(value || '').replace(/\u001b\[[0-9;]*m/g, '');
}

function buildActualResult(testCase, artifactInfo, displayTitle = '') {
  const error = stripAnsi(testCase.error || '').trim();
  const context = stripAnsi(artifactInfo.actualResult || '').trim();
  const title = stripAnsi(displayTitle || testCase.title || '').trim();
  const missingHeaders = error.match(/Missing headers:\s*([^\n]+)/i);

  if (missingHeaders) {
    const headerText = missingHeaders[1].replace(/\s+/g, ' ').trim();
    const expected = error.match(/Expected:\s*>=\s*(\d+)/i)?.[1] || '';
    const received = error.match(/Received:\s*(\d+)/i)?.[1] || '';
    const countText = expected && received ? ` Automation kỳ vọng tối thiểu ${expected} header nhưng chỉ nhận ${received}.` : '';
    return `Màn danh sách mở thành công nhưng bảng không hiển thị đủ các cột nghiệp vụ theo testcase. Thiếu: ${headerText}.${countText}`;
  }

  const apiStatusInArray = error.match(/Expected value:\s*(\d+)[\s\S]*?Received array:\s*\[([^\]]+)\]/i);
  if (apiStatusInArray) {
    const actualStatus = apiStatusInArray[1];
    const expectedStatuses = apiStatusInArray[2].replace(/\s+/g, ' ').trim();
    return [
      `API trả HTTP ${actualStatus}, không khớp contract/expected status của testcase (${expectedStatuses}).`,
      title ? `Case liên quan: ${stripPositiveNegativePrefix(title)}.` : '',
      'Response đã được ghi nhận trong Playwright result/evidence local và không được paste nguyên văn nếu có dữ liệu nhạy cảm.',
    ].filter(Boolean).join('\n');
  }

  const statusToBe = error.match(/Expected:\s*(\d+)[\s\S]*?Received:\s*(\d+)/i);
  if (statusToBe) {
    return [
      `Hệ thống trả kết quả thực tế là ${statusToBe[2]}, trong khi testcase mong muốn ${statusToBe[1]}.`,
      title ? `Case liên quan: ${stripPositiveNegativePrefix(title)}.` : '',
    ].filter(Boolean).join('\n');
  }

  const retainedInvalidValue = error.match(/Expected:\s*not\s*"([^"]+)"/i);
  if (retainedInvalidValue) {
    return [
      `Sau khi thực hiện flow, hệ thống vẫn giữ giá trị không còn hợp lệ: "${retainedInvalidValue[1]}".`,
      'Theo testcase, giá trị này phải được reset, bị invalid hoặc bị chặn trước khi người dùng lưu dữ liệu.',
      title ? `Case liên quan: ${stripPositiveNegativePrefix(title)}.` : '',
    ].filter(Boolean).join('\n');
  }

  if (/Received:\s*false/i.test(error)) {
    const firstLine = error.split(/\r?\n/).map((line) => line.trim()).find((line) => line && !/^Error:\s*$/i.test(line));
    return [
      `Điều kiện nghiệp vụ mong muốn không được đảm bảo khi execute testcase.${firstLine ? ` Chi tiết quan sát được: ${firstLine.replace(/^Error:\s*/i, '')}.` : ''}`,
      title ? `Case liên quan: ${stripPositiveNegativePrefix(title)}.` : '',
    ].filter(Boolean).join('\n');
  }

  const subjectSetup = error.match(/Unable to load\s+(.+?)\s+subjects.*status=(\d+)/i);
  if (subjectSetup) {
    return `Không thể chuẩn bị dữ liệu automation vì API danh sách môn học của ${subjectSetup[1]} trả HTTP ${subjectSetup[2]}. Đây là blocker setup/environment, không đủ điều kiện log product bug nếu chưa có evidence nghiệp vụ khác.`;
  }

  if (/Ops UI login did not leave login page/i.test(error)) {
    return 'Không thể đi qua bước đăng nhập Operations trong lần chạy hiện tại. Đây là blocker auth/login flow của môi trường execute, cần re-validation trước khi kết luận product bug.';
  }

  const missingFixture = error.match(/No\s+(.+?)\s+fixture(?:\s+for\s+(.+?))?\s+was found in Ops data/i);
  if (missingFixture) {
    return `Không tìm thấy dữ liệu fixture bắt buộc trong Ops data (${missingFixture[1]}${missingFixture[2] ? ` cho ${missingFixture[2]}` : ''}). Đây là blocker test data/setup, cần bổ sung dữ liệu hoặc re-validation trước khi kết luận product bug.`;
  }

  if (context && !/^Following Playwright test failed\.?$/i.test(context)) {
    return context;
  }

  const firstErrorLines = error
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^\s*(at\s+|>|expect\(|Received array:|Expected value:|Expected:|Received:)/i.test(line))
    .slice(0, 4);
  if (firstErrorLines.length) {
    return `Khi execute testcase, hệ thống trả kết quả không đúng expected. Chi tiết đã sanitize:\n${firstErrorLines.join('\n')}`;
  }

  return 'Khi execute testcase, hệ thống trả kết quả không đúng expected. Xem evidence ảnh/video và Playwright result local để đối chiếu chi tiết.';
}

function findTestCaseInfo(tcId, testcasesDir) {
  if (!testcasesDir || !fs.existsSync(testcasesDir)) return {};

  const mdFiles = listFiles(testcasesDir, (filePath) => filePath.toLowerCase().endsWith('.md'));
  for (const filePath of mdFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    const tableInfo = findTableRowInfo(content, tcId);
    if (tableInfo) {
      return {
        ...tableInfo,
        source: path.relative(REPO_ROOT, filePath),
      };
    }

    const section = extractTcSection(content, tcId);
    if (!section) continue;

    return {
      preconditions: findField(section, [
        'precondition',
        'pre-condition',
        'tien dieu kien',
        'tiền điều kiện',
      ]),
      steps: findSteps(section),
      expectedResult: findField(section, [
        'expected result',
        'expected',
        'ket qua mong muon',
        'kết quả mong muốn',
      ]),
      priority: normalizeJiraPriority(findField(section, [
        'priority',
        'uu tien',
        'ưu tiên',
        'muc do uu tien',
        'mức độ ưu tiên',
      ])),
      source: path.relative(REPO_ROOT, filePath),
    };
  }

  return {};
}

function findSelectedTestCaseInfo(tcId) {
  if (!SELECTION_FILE || !fs.existsSync(SELECTION_FILE)) return {};
  const selection = readJson(SELECTION_FILE, {});
  const normalizedTcId = normalizeTcId(tcId);
  const selected = (selection.items || []).find((item) => normalizeTcId(item.id) === normalizedTcId);
  if (!selected) return {};
  return {
    title: selected.scenario || '',
    priority: normalizeJiraPriority(selected.priority),
    source: path.relative(REPO_ROOT, SELECTION_FILE),
  };
}

function findTableRowInfo(content, tcId) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const variants = [tcId, tcId.replace(/_/g, '-'), tcId.replace(/_/g, ' ')]
    .map((value) => value.toUpperCase());

  for (let i = 0; i < lines.length; i += 1) {
    if (!/^\s*\|/.test(lines[i])) continue;
    const header = splitMarkdownRow(lines[i]);
    const normalizedHeader = header.map(normalizeForMatch);
    const tcIndex = normalizedHeader.findIndex((cell) => cell === 'tc id' || cell.includes('tc id'));
    if (tcIndex === -1) continue;

    for (let j = i + 1; j < lines.length; j += 1) {
      if (!/^\s*\|/.test(lines[j])) break;
      if (/^\s*\|?\s*:?-{3,}:?\s*\|/.test(lines[j])) continue;

      const cells = splitMarkdownRow(lines[j]);
      const rowTcId = normalizeTcId(cells[tcIndex] || '');
      if (!variants.includes(rowTcId) && !variants.includes(String(cells[tcIndex] || '').toUpperCase())) continue;

      const title = pickByHeader(cells, normalizedHeader, [
        'truong hop kiem thu',
        'test case',
        'title',
        'summary',
      ]);
      const preconditions = pickByHeader(cells, normalizedHeader, [
        'tien dieu kien',
        'precondition',
        'pre condition',
      ]);
      const rawSteps = pickByHeader(cells, normalizedHeader, [
        'cac buoc thuc hien',
        'buoc thuc hien',
        'steps',
      ]);
      const expectedResult = pickByHeader(cells, normalizedHeader, [
        'ket qua mong doi',
        'ket qua mong muon',
        'expected result',
        'expected',
      ]);
      const priority = pickByHeader(cells, normalizedHeader, [
        'uu tien',
        'muc do uu tien',
        'priority',
        'priority level',
        'jira priority',
      ]);
      if (!title && !preconditions && !rawSteps && !expectedResult) continue;

      return {
        title: cellToText(title),
        preconditions: cellToText(preconditions),
        steps: cellToList(rawSteps),
        expectedResult: cellToText(expectedResult),
        priority: normalizeJiraPriority(priority),
      };
    }
  }

  return null;
}

function splitMarkdownRow(line) {
  return String(line || '')
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function pickByHeader(cells, normalizedHeader, names) {
  const normalizedNames = names.map(normalizeForMatch);
  const index = normalizedHeader.findIndex((header) =>
    normalizedNames.some((name) => header === name || header.includes(name)),
  );
  return index === -1 ? '' : cells[index] || '';
}

function cellToText(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/<[^>]+>/g, '')
    .split(/\n+/)
    .map(cleanField)
    .filter(Boolean)
    .join('\n');
}

function cellToList(value) {
  return cellToText(value)
    .split(/\n+/)
    .map(cleanField)
    .filter(Boolean);
}

function extractTcSection(content, tcId) {
  const normalizedContent = content.replace(/\r\n/g, '\n');
  const variants = [tcId, tcId.replace(/_/g, '-'), tcId.replace(/_/g, ' ')];
  const lines = normalizedContent.split('\n');
  let start = -1;

  for (let i = 0; i < lines.length; i += 1) {
    if (variants.some((variant) => lines[i].toUpperCase().includes(variant.toUpperCase()))) {
      start = i;
      break;
    }
  }
  if (start === -1) return '';

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/\b[A-Z0-9]+(?:[-_][A-Z0-9]+)*[-_]TC[-_]?\d+\b/i.test(lines[i])) {
      end = i;
      break;
    }
  }

  return lines.slice(start, end).join('\n');
}

function findField(section, labels) {
  const lines = section.split('\n');
  const labelPattern = labels.map(escapeRegex).join('|');
  const inline = new RegExp(`(?:${labelPattern})\\s*[:|]\\s*(.+)`, 'i');

  for (let i = 0; i < lines.length; i += 1) {
    const line = stripMarkdownTableCell(lines[i]);
    const match = line.match(inline);
    if (match?.[1]) return cleanField(match[1]);

    if (new RegExp(labelPattern, 'i').test(line)) {
      const next = stripMarkdownTableCell(lines[i + 1] || '');
      if (next && !new RegExp(labelPattern, 'i').test(next)) return cleanField(next);
    }
  }

  return '';
}

function findSteps(section) {
  const lines = section.split('\n').map(stripMarkdownTableCell);
  const stepLines = [];
  let capture = false;

  for (const line of lines) {
    if (/^(steps?|buoc thuc hien|bước thực hiện)\b/i.test(line)) {
      capture = true;
      const inline = line.replace(/^(steps?|buoc thuc hien|bước thực hiện)\s*[:|]?\s*/i, '').trim();
      if (inline) stepLines.push(inline);
      continue;
    }

    if (capture && /^(expected|actual|ket qua|kết quả|priority|uu tien|ưu tiên|muc do uu tien|mức độ ưu tiên|status|evidence)\b/i.test(line)) break;
    if (capture && line) stepLines.push(line);
  }

  return stepLines.map(cleanField).filter(Boolean).slice(0, 30);
}

function readArtifactInfo(artifactsDir, tcId) {
  const out = {
    actualResult: '',
    screenshotPath: null,
    videoPath: null,
    errorContextPath: null,
  };

  if (!artifactsDir || !fs.existsSync(artifactsDir)) return out;

  const artifactDir = findArtifactDir(artifactsDir, tcId);
  if (!artifactDir) return out;

  const files = listFiles(artifactDir);
  out.errorContextPath = files.find((file) => path.basename(file).toLowerCase() === 'error-context.md') || null;
  out.screenshotPath =
    files.find((file) => /test-failed.*\.png$/i.test(path.basename(file))) ||
    files.find((file) => /\.png$/i.test(file)) ||
    null;
  out.videoPath = files.find((file) => /\.(webm|mp4)$/i.test(file)) || null;

  if (out.errorContextPath) {
    const text = fs.readFileSync(out.errorContextPath, 'utf8').trim();
    out.actualResult = summarizeErrorContext(text);
  }

  return out;
}

function findArtifactDir(artifactsDir, tcId) {
  const variants = [
    tcId,
    tcId.replace(/_/g, '-'),
    tcId.replace(/_/g, '').toLowerCase(),
  ].map((value) => value.toLowerCase());

  const dirs = listDirectories(artifactsDir);
  const dirByName = dirs.find((dir) => {
    const normalized = path.basename(dir).toLowerCase();
    return variants.some((variant) => normalized.includes(variant));
  });
  if (dirByName) return dirByName;

  const tcTitlePattern = new RegExp(`\\bName:\\s*.*${escapeRegExp(tcId)}`, 'i');
  const dirByContextTitle = dirs.find((dir) => {
    const contextPath = path.join(dir, 'error-context.md');
    if (!fs.existsSync(contextPath)) return false;
    const context = fs.readFileSync(contextPath, 'utf8');
    return tcTitlePattern.test(context);
  });
  if (dirByContextTitle) return dirByContextTitle;

  return (
    dirs.find((dir) => {
      const contextPath = path.join(dir, 'error-context.md');
      if (!fs.existsSync(contextPath)) return false;
      const context = fs.readFileSync(contextPath, 'utf8').toLowerCase();
      return variants.some((variant) => context.includes(variant));
    }) || null
  );
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function summarizeErrorContext(text) {
  if (!text) return '';
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/^#+\s*/, '').trim())
    .filter(Boolean);

  const important = lines.find((line) => /(error|fail|timeout|expected|actual)/i.test(line) && line.length > 10);
  return (important || lines.slice(0, 6).join('\n')).slice(0, 2000);
}

function listFiles(dir, predicate = () => true) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(fullPath, predicate));
    else if (entry.isFile() && predicate(fullPath)) files.push(fullPath);
  }
  return files;
}

function listDirectories(dir) {
  const dirs = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (!entry.isDirectory()) continue;
    dirs.push(fullPath, ...listDirectories(fullPath));
  }
  return dirs;
}

function stripMarkdownTableCell(line) {
  return String(line || '')
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .replace(/\s*\|\s*/g, ' ')
    .trim();
}

function cleanField(value) {
  return String(value || '')
    .replace(/^[-*]\s*/, '')
    .replace(/^\d+[.)]\s*/, '')
    .replace(/^:+|:+$/g, '')
    .trim();
}

function normalizeForMatch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (fallback !== null) return fallback;
    throw error;
  }
}

function formatApiError(error) {
  const status = error.response?.status;
  const data = error.response?.data;
  if (status) return `${status} ${JSON.stringify(data?.errors || data?.errorMessages || data || error.message)}`;
  return error.message;
}

function buildSummary(rows) {
  const tableRows = rows
    .map((row) => `| ${row.tcId} | ${row.issueKey} | ${row.status} | ${row.url || '-'} |`)
    .join('\n');

  return [
    '## Jira Bug Report Log',
    '',
    '| TC ID | Jira Issue | Status | URL |',
    '|---|---|---|---|',
    tableRows,
    '',
  ].join('\n');
}

function writeSummary(summaryText) {
  const reportDir = RUN_ID
    ? path.join(TASK_OUTPUT_DIR, 'reports', 'runs', RUN_ID)
    : path.join(TASK_OUTPUT_DIR, 'reports');
  const preferred = path.join(reportDir, 'execution-summary.md');
  const fallback = path.join(reportDir, 'jira_bug_log.md');

  fs.mkdirSync(reportDir, { recursive: true });
  if (fs.existsSync(preferred)) {
    fs.appendFileSync(preferred, `\n${summaryText}`, 'utf8');
    return preferred;
  }

  fs.writeFileSync(fallback, summaryText, 'utf8');
  return fallback;
}

async function main() {
  validate();

  const timestamp = new Date().toISOString();
  console.log(`Reading Playwright results: ${path.relative(REPO_ROOT, RESULTS_FILE)}`);
  let failedTests = extractFailedTests(RESULTS_FILE);
  if (TC_ID_FILTER) {
    failedTests = failedTests.filter((testCase) => testCase.tcId === TC_ID_FILTER);
    if (failedTests.length === 0) {
      fail(`No failed test matched --tc-id ${TC_ID_FILTER}.`);
    }
  }

  if (failedTests.length === 0) {
    console.log('No failed tests found. Nothing to report.');
    return;
  }
  if (UPDATE_ISSUE_KEY && failedTests.length !== 1) {
    fail('--update-issue/--issue mode requires exactly one failed testcase. Pass --tc-id <TC_ID>.');
  }

  console.log(`Found ${failedTests.length} failed test(s). Story: ${STORY_KEY}. Project: ${PROJECT_KEY}.`);
  if (TC_ID_FILTER) console.log(`TC filter: ${TC_ID_FILTER}`);
  if (UPDATE_ISSUE_KEY) console.log(`Update existing issue: ${UPDATE_ISSUE_KEY}`);
  if (DRY_RUN) console.log('DRY RUN: Jira will not be changed.');

  let parentIssue = null;
  const assigneeCache = {};
  if (!DRY_RUN) {
    parentIssue = await assertParentIssue();
  }

  const rows = [];

  for (const testCase of failedTests) {
    const tcInfo = findTestCaseInfo(testCase.tcId, TESTCASES_DIR);
    const selectedTcInfo = findSelectedTestCaseInfo(testCase.tcId);
    const artifactInfo = readArtifactInfo(ARTIFACTS_DIR, testCase.tcId);
    const displayTitle = tcInfo.title || selectedTcInfo.title || testCase.title;
    const layer = determineBugLayer(testCase, tcInfo);
    const priority = normalizeJiraPriority(tcInfo.priority || selectedTcInfo.priority || testCase.priority);
    const actualResult = buildActualResult(testCase, artifactInfo, displayTitle);
    const summary = buildBugSummary(layer, displayTitle, actualResult, testCase.tcId);
    const prioritySuffix = priority ? ` (Priority: ${priority})` : '';

    console.log(`Processing ${testCase.tcId}: ${displayTitle}${prioritySuffix}`);

    if (DRY_RUN) {
      rows.push({
        tcId: testCase.tcId,
        issueKey: UPDATE_ISSUE_KEY || 'DRY-RUN',
        status: UPDATE_ISSUE_KEY
          ? `Would update existing ${layer} bug${prioritySuffix}`
          : `Would create child ${layer} bug${prioritySuffix}`,
        url: UPDATE_ISSUE_KEY ? `${JIRA_BASE_URL}/browse/${UPDATE_ISSUE_KEY}` : '-',
      });
      continue;
    }

    const description = {
      tcId: testCase.tcId,
      taskKey: TASK_KEY,
      timestamp,
      preconditions: tcInfo.preconditions || '(không có thông tin tiền điều kiện)',
      steps: tcInfo.steps?.length ? tcInfo.steps : testCase.steps,
      actualResult,
      expectedResult: tcInfo.expectedResult || '(xem file test case gốc)',
      source: tcInfo.source || selectedTcInfo.source || testCase.sourceFile || '',
    };

    if (UPDATE_ISSUE_KEY) {
      try {
        await updateIssue(UPDATE_ISSUE_KEY, { summary, description, priority, parentIssue });
        rows.push({
          tcId: testCase.tcId,
          issueKey: UPDATE_ISSUE_KEY,
          status: 'Updated',
          url: `${JIRA_BASE_URL}/browse/${UPDATE_ISSUE_KEY}`,
        });
      } catch (error) {
        const message = formatApiError(error);
        console.error(`  update failed: ${message}`);
        rows.push({ tcId: testCase.tcId, issueKey: UPDATE_ISSUE_KEY, status: `Error: ${message}`, url: '-' });
      }
      continue;
    }

    const assigneeId = await resolveBugAssigneeAccountId(layer, parentIssue, assigneeCache);
    if (!assigneeId) {
      fail('Missing assignee. Configure JIRA_FE_ASSIGNEE/JIRA_BE_ASSIGNEE or assign the parent Story/Task.');
    }

    const existing = await searchExistingBug(testCase.tcId);
    if (existing) {
      rows.push({
        tcId: testCase.tcId,
        issueKey: existing.key,
        status: 'Skipped (duplicate)',
        url: `${JIRA_BASE_URL}/browse/${existing.key}`,
      });
      continue;
    }

    try {
      const issueKey = await createIssue({
        tcId: testCase.tcId,
        summary,
        description,
        assigneeId,
        layer,
        priority,
        parentIssue,
      });

      const attachments = [
        artifactInfo.screenshotPath,
        artifactInfo.videoPath,
      ].filter(isJiraEvidenceAttachment);

      for (const attachment of attachments) {
        const ok = await uploadAttachment(issueKey, attachment);
        console.log(`  attachment ${path.basename(attachment)}: ${ok ? 'OK' : 'WARN'}`);
      }

      rows.push({
        tcId: testCase.tcId,
        issueKey,
        status: 'Created',
        url: `${JIRA_BASE_URL}/browse/${issueKey}`,
      });
    } catch (error) {
      const message = formatApiError(error);
      console.error(`  create failed: ${message}`);
      rows.push({ tcId: testCase.tcId, issueKey: 'ERROR', status: `Error: ${message}`, url: '-' });
    }
  }

  const summaryText = buildSummary(rows);
  if (WRITE_LOG) {
    const summaryPath = writeSummary(summaryText);
    console.log(`Bug report log saved: ${path.relative(REPO_ROOT, summaryPath)}`);
  }

  const created = rows.filter((row) => row.status === 'Created').length;
  const duplicates = rows.filter((row) => row.status.startsWith('Skipped')).length;
  const errors = rows.filter((row) => row.status.startsWith('Error')).length;

  console.log('');
  console.log('Jira Bug Report complete');
  console.log(`  Story:      ${STORY_KEY}`);
  console.log(`  Failed TC:  ${failedTests.length}`);
  console.log(`  Created:    ${created}`);
  console.log(`  Duplicate:  ${duplicates}`);
  console.log(`  Errors:     ${errors}`);

  if (DRY_RUN) console.log(summaryText.trim());
  if (errors > 0) process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(`Fatal: ${formatApiError(error)}`);
  process.exit(1);
});
