#!/usr/bin/env node
/**
 * Tạo (find-or-create) Xray Test Plan cho sprint hiện tại của một Story/Task.
 *
 * CHẠY THỦ CÔNG mỗi đầu sprint — KHÔNG thuộc phase nào, KHÔNG tự động trong Phase 1/2/re-run.
 * Idempotent: nếu Test Plan "[Test Plan] <sprint>" đã tồn tại → dùng lại, KHÔNG tạo trùng.
 * Khi tạo: điền Sprint + Start date (=sprint.start) + "SAPP - Due date" (=sprint.end) + Fix versions
 * (theo Story) + required field project (vd SAPP: customfield_10037/10039, copy từ Story).
 *
 * Mặc định --dry-run (chỉ preview); phải --write mới tạo issue thật.
 *
 * Usage:
 *   TASK_ENV=profiles/<KEY>/task.env node scripts/integrations/jira/create_test_plan.js --story <STORY_KEY> --dry-run
 *   TASK_ENV=profiles/<KEY>/task.env node scripts/integrations/jira/create_test_plan.js --story <STORY_KEY> --write
 *   node scripts/integrations/jira/create_test_plan.js --story <STORY_KEY> --sprint "OPs Sprint 47" --write   # chỉ định sprint thủ công
 */
const axios = require('axios');
const { loadEnv, buildJiraHeaders, log, resolveJiraAccountId } = require('./utils');
require('../../utils/runtime_config'); // nạp root .env + TASK_ENV (nếu set)
loadEnv();

const args = parseArgs(process.argv.slice(2));
const argStr = (k) => (typeof args[k] === 'string' ? args[k].trim() : '');
const argFlag = (k) => args[k] === true || args[k] === 'true';

const JIRA_BASE_URL = (process.env.JIRA_BASE_URL || process.env.JIRA_URL || '').replace(/\/+$/, '');
const STORY_KEY = normKey(argStr('story') || process.env.JIRA_STORY_KEY || process.env.TASK_KEY || '');
const PROJECT_KEY = normProj(argStr('project') || process.env.JIRA_PROJECT_KEY || deriveProject(STORY_KEY));
const TEST_PLAN_ISSUE_TYPE = argStr('test-plan-issue-type') || process.env.JIRA_TEST_PLAN_ISSUE_TYPE || 'Test Plan';
// Assignee cho Test Plan (QA điền tên/email vào JIRA_XRAY_ASSIGNEE ở task.env). Bỏ trống = không gán.
const ASSIGNEE = argStr('assignee') || process.env.JIRA_XRAY_ASSIGNEE || '';
const SPRINT_OVERRIDE = argStr('sprint');
const JIRA_SPRINT_FIELD_ID = argStr('sprint-field') || process.env.JIRA_SPRINT_FIELD_ID || '';
const REQUIRED_FIELD_IDS = ['customfield_10039', 'customfield_10037']; // required on create (SAPP)
const DO_WRITE = argFlag('write') || argFlag('no-dry-run');
const DRY_RUN = !DO_WRITE;

let _fieldIds = null;

main().catch((e) => { console.error(`ERROR: ${e.message}`); process.exit(1); });

async function main() {
  if (!JIRA_BASE_URL) throw new Error('Thiếu JIRA_BASE_URL/JIRA_URL.');
  if (!STORY_KEY) throw new Error('Thiếu Story/Task key. Truyền --story <KEY> hoặc set JIRA_STORY_KEY (qua TASK_ENV).');
  if (!PROJECT_KEY) throw new Error('Thiếu project key. Truyền --project hoặc để suy từ story key.');
  console.log(`Scope: story=${STORY_KEY} · project=${PROJECT_KEY} · issuetype="${TEST_PLAN_ISSUE_TYPE}" · mode=${DRY_RUN ? 'DRY-RUN' : 'WRITE'}`);

  const ids = await resolveFieldIds();

  // 1. Resolve sprint (từ Story hoặc --sprint thủ công)
  const sprint = await resolveSprint(ids);
  if (!sprint || !sprint.name) throw new Error(`Không xác định được sprint từ ${STORY_KEY}. Dùng --sprint "<tên sprint>" để chỉ định thủ công.`);
  const planName = `[Test Plan] ${sprint.name}`;
  log('LOG', `Sprint: "${sprint.name}"${sprint.startDate ? ` (start=${dt(sprint.startDate)}, end=${dt(sprint.endDate)})` : ' (không có ngày — chỉ đặt tên)'} → Test Plan: "${planName}"`);

  // 2. Find-or-create: nếu đã có → dừng, KHÔNG tạo trùng
  const existing = await findTestPlan(sprint.name);
  if (existing) {
    console.log(`\n[ĐÃ CÓ] Test Plan cho sprint này đã tồn tại — KHÔNG tạo trùng:`);
    console.log(`  ${existing.key} — "${existing.summary}"  ${JIRA_BASE_URL}/browse/${existing.key}`);
    return;
  }

  // 3. Payload tạo + field điền sau (tránh field ngoài create-screen)
  const createFields = { project: { key: PROJECT_KEY }, issuetype: { name: TEST_PLAN_ISSUE_TYPE }, summary: planName };
  const assigneeId = ASSIGNEE ? await resolveJiraAccountId(ASSIGNEE) : null;
  if (assigneeId) createFields.assignee = { accountId: assigneeId };
  else if (ASSIGNEE) log('WARN', `Không resolve được assignee "${ASSIGNEE}" → tạo Test Plan không gán người.`);
  const story = await jiraGet(`/rest/api/3/issue/${encodeURIComponent(STORY_KEY)}`, { fields: [...REQUIRED_FIELD_IDS, 'fixVersions'].join(',') });
  const sf = (story && story.fields) || {};
  for (const id of REQUIRED_FIELD_IDS) { const v = sf[id]; if (v != null && !(Array.isArray(v) && !v.length)) createFields[id] = sanitize(v); }

  const postFill = {};
  if (ids.sprint && sprint.id != null) postFill[ids.sprint] = Number(sprint.id);
  if (ids.startDate && sprint.startDate) postFill[ids.startDate] = dt(sprint.startDate);
  if (ids.dueDate && sprint.endDate) postFill[ids.dueDate] = dt(sprint.endDate);
  if (Array.isArray(sf.fixVersions) && sf.fixVersions.length) postFill.fixVersions = sf.fixVersions.map((v) => ({ id: String(v.id) }));

  if (DRY_RUN) {
    console.log('\n--- [DRY-RUN] Sẽ tạo Test Plan ---');
    console.log('  createFields:', JSON.stringify(createFields));
    console.log('  fill sau tạo:', JSON.stringify(postFill));
    console.log('\nChưa tạo gì. Thêm --write để tạo thật.');
    return;
  }

  // 4. Create (retry nếu project báo thiếu required field khác)
  const key = await createWithRetry(createFields);
  console.log(`\n[OK] Đã tạo Test Plan: ${key}  ${JIRA_BASE_URL}/browse/${key}`);

  // 5. Điền Sprint/Start/Due/fixVersions
  const done = await safePutFields(key, postFill);
  log('LOG', `Điền field theo sprint: ${done.join(', ') || '(không set được field nào)'}`);
  console.log(`\nXong. Từ giờ push_test_execution sẽ tự dò & link execution vào "${planName}".`);
}

// ---------- resolve ----------
async function resolveFieldIds() {
  if (_fieldIds) return _fieldIds;
  const m = { sprint: JIRA_SPRINT_FIELD_ID || 'customfield_10020', startDate: '', dueDate: '', fixVersions: 'fixVersions' };
  try {
    const fields = await jiraGet('/rest/api/3/field');
    for (const f of (fields || [])) {
      const n = String(f.name || '').trim().toLowerCase();
      if (!JIRA_SPRINT_FIELD_ID && n === 'sprint') m.sprint = f.id;
      else if (n === 'start date') m.startDate = f.id;
      else if (n === 'sapp - due date') m.dueDate = f.id;
    }
  } catch (e) { /* dùng default */ }
  _fieldIds = m;
  return m;
}

async function resolveSprint(ids) {
  if (SPRINT_OVERRIDE) return { name: SPRINT_OVERRIDE, id: null, startDate: null, endDate: null };
  try {
    const d = await jiraGet(`/rest/api/3/issue/${encodeURIComponent(STORY_KEY)}`, { fields: ids.sprint });
    const v = ((d.fields || {})[ids.sprint]) || [];
    const arr = (Array.isArray(v) ? v : [v]).filter((s) => s && typeof s === 'object' && s.name);
    if (!arr.length) return null;
    const active = arr.find((s) => s.state === 'active') || arr[arr.length - 1];
    return { name: active.name, id: active.id, startDate: active.startDate, endDate: active.endDate };
  } catch (e) {
    log('WARN', `Không lấy được sprint của ${STORY_KEY}: ${e.message.slice(0, 120)}`);
    return null;
  }
}

async function findTestPlan(sprintName) {
  const jql = `project = "${PROJECT_KEY}" AND issuetype = "${TEST_PLAN_ISSUE_TYPE}" AND summary ~ "${sprintName.replace(/"/g, '\\"')}"`;
  const d = await jiraSearch(jql, 'summary', 20);
  const hit = (d.issues || []).find((i) => String((i.fields || {}).summary || '').toLowerCase().includes(sprintName.toLowerCase()));
  return hit ? { key: hit.key, summary: hit.fields.summary } : null;
}

// ---------- create ----------
async function createWithRetry(baseFields, maxTry = 3) {
  let fields = { ...baseFields };
  for (let attempt = 1; attempt <= maxTry; attempt += 1) {
    try {
      const r = await axios.post(`${JIRA_BASE_URL}/rest/api/3/issue`, { fields }, { headers: buildJiraHeaders() });
      return r.data.key;
    } catch (error) {
      const data = error.response && error.response.data;
      const msg = JSON.stringify((data && (data.errors || data.errorMessages)) || error.message);
      const missing = (msg.match(/customfield_\d+/g) || []).filter((id) => !(id in fields));
      if (!missing.length || attempt === maxTry) throw new Error(`Tạo Test Plan lỗi: ${msg.slice(0, 300)}`);
      log('WARN', `Thiếu required field (${missing.join(', ')}) → copy từ ${STORY_KEY} rồi thử lại.`);
      const story = await jiraGet(`/rest/api/3/issue/${encodeURIComponent(STORY_KEY)}`, { fields: missing.join(',') });
      const sf = (story && story.fields) || {};
      for (const id of missing) { if (sf[id] != null) fields[id] = sanitize(sf[id]); }
    }
  }
  throw new Error('Tạo Test Plan thất bại sau nhiều lần thử.');
}

// PUT fields: thử cả cụm; lỗi thì thử từng field.
async function safePutFields(key, fields) {
  if (!Object.keys(fields).length) return [];
  const put = async (f) => {
    try { await axios.put(`${JIRA_BASE_URL}/rest/api/3/issue/${encodeURIComponent(key)}`, { fields: f }, { headers: buildJiraHeaders() }); return true; }
    catch (e) { return e; }
  };
  if ((await put(fields)) === true) return Object.keys(fields);
  const done = [];
  for (const [k, v] of Object.entries(fields)) {
    const r = await put({ [k]: v });
    if (r === true) done.push(k);
    else log('WARN', `  field ${k} không set được: ${((r.response && JSON.stringify(r.response.data)) || r.message || '').slice(0, 120)}`);
  }
  return done;
}

// ---------- jira helpers ----------
async function jiraGet(pathname, params) {
  const r = await axios.get(`${JIRA_BASE_URL}${pathname}`, { headers: buildJiraHeaders(), params });
  return r.data;
}
async function jiraSearch(jql, fields = 'key', maxResults = 20) {
  try { return (await axios.get(`${JIRA_BASE_URL}/rest/api/3/search/jql`, { headers: buildJiraHeaders(), params: { jql, maxResults, fields } })).data; }
  catch (e) { return (await axios.get(`${JIRA_BASE_URL}/rest/api/3/search`, { headers: buildJiraHeaders(), params: { jql, maxResults, fields } })).data; }
}

// ---------- util ----------
function sanitize(v) {
  if (Array.isArray(v)) return v.map((x) => (x && x.id != null ? { id: String(x.id) } : (x && x.value != null ? { value: x.value } : x)));
  if (v && typeof v === 'object') { if (v.id != null) return { id: String(v.id) }; if (v.value != null) return { value: v.value }; }
  return v;
}
function dt(iso) { return String(iso || '').slice(0, 10); }
function normKey(v) { return String(v || '').trim().toUpperCase(); }
function normProj(v) { return String(v || '').trim().toUpperCase(); }
function deriveProject(key) { const m = String(key || '').match(/^([A-Z][A-Z0-9]+)-\d+$/i); return m ? m[1].toUpperCase() : ''; }
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i]; if (!t.startsWith('--')) continue;
    const [k, inline] = t.slice(2).split('=', 2);
    if (inline !== undefined) { out[k] = inline; continue; }
    const next = argv[i + 1]; out[k] = next && !next.startsWith('--') ? argv[++i] : true;
  }
  return out;
}
