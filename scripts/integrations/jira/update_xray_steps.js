/**
 * UPDATE-ONLY: đồng bộ lại step (Action / Expected Result) của các Xray Test ĐÃ TỒN TẠI,
 * lấy nội dung từ file testcase Markdown. KHÔNG tạo test mới, KHÔNG đụng requirement link,
 * assignee, Test Repository folder, precondition hay description — CHỈ syncManualSteps.
 *
 * Khớp test theo label: tc-<tcId> AND task-<TASK_KEY> (giống publish_testcases.js).
 * Ghép step theo số: "Các bước thực hiện" #N  <->  "Kết quả mong đợi" #N.
 *
 * Dùng:
 *   node update_xray_steps.js --task SAPP-26523 --md <file.md>            (dry-run: liệt kê, KHÔNG gọi API)
 *   node update_xray_steps.js --task SAPP-26523 --md <file.md> --apply    (đồng bộ step thật)
 */
const fs = require('fs');
const axios = require('axios');
const { loadEnv, buildJiraHeaders } = require('./utils.js');
const { XrayCloudClient, isUsableCreds } = require('./xray_cloud.js');
loadEnv();

function argString(name) { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : ''; }
function argFlag(name) { return process.argv.includes(`--${name}`); }

const APPLY = argFlag('apply');
const TASK_KEY = argString('task');
const MD_PATH = argString('md');
const ONLY = (argString('only') || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean); // --only TC1,TC2 -> chỉ sync các TC này
const PROJECT_KEY = process.env.JIRA_PROJECT_KEY || 'SAPP';
const XRAY_TEST_TYPE = argString('xray-test-type') || process.env.XRAY_TEST_TYPE || 'Manual';
const BASE = (process.env.JIRA_BASE_URL || '').replace(/\/+$/, '');
const H = buildJiraHeaders();

if (!TASK_KEY || !MD_PATH) { console.error('Cần --task <KEY> và --md <file.md>'); process.exit(1); }
if (!fs.existsSync(MD_PATH)) { console.error(`Không thấy file md: ${MD_PATH}`); process.exit(1); }

function labelFor(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 255);
}
function escapeJql(s) { return String(s || '').replace(/"/g, '\\"'); }

// Tách "1. foo<br>2. bar" -> [{num:1,text:'foo'},{num:2,text:'bar'}]. Dòng không đánh số nối vào mục trước.
function splitNumberedItems(text) {
  const raw = String(text || '').replace(/<br\s*\/?>/gi, '\n').replace(/\r/g, '');
  if (!raw.trim()) return [];
  const items = []; let current = null;
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*(\d+)[.)]\s*(.*)$/);
    if (m) { if (current) items.push(current); current = { num: Number.parseInt(m[1], 10), text: m[2] }; }
    else if (current) { if (line.trim()) current.text += `\n${line.trim()}`; }
    else if (line.trim()) { current = { num: null, text: line.trim() }; }
  }
  if (current) items.push(current);
  return items.map((it) => ({ num: it.num, text: it.text.trim() })).filter((it) => it.text);
}

// Ghép action#N với result#N (giống publish_testcases.buildXraySteps).
function buildXraySteps(steps, expected) {
  const actions = splitNumberedItems(steps);
  const results = splitNumberedItems(expected);
  if (actions.length === 0) {
    return [{ action: String(steps || '-').trim() || '-', data: '', result: results.map((r) => r.text).join('\n') }];
  }
  const actionNums = new Set(actions.map((a) => a.num).filter((n) => n != null));
  const resultByNum = new Map(); const unmatched = [];
  for (const r of results) {
    if (r.num != null && actionNums.has(r.num) && !resultByNum.has(r.num)) resultByNum.set(r.num, r.text);
    else unmatched.push(r.text);
  }
  const built = actions.map((a) => ({ action: a.text, data: '', result: a.num != null && resultByNum.has(a.num) ? resultByNum.get(a.num) : '' }));
  if (unmatched.length) { const last = built[built.length - 1]; last.result = [last.result, ...unmatched].filter(Boolean).join('\n'); }
  return built;
}

// Split 1 dòng bảng md, tôn trọng escaped pipe "\|".
function splitRow(line) {
  const parts = []; let cur = '';
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '\\' && i + 1 < line.length) { cur += ch + line[i + 1]; i += 1; continue; }
    if (ch === '|') { parts.push(cur); cur = ''; } else cur += ch;
  }
  parts.push(cur);
  return parts.slice(1, -1).map((c) => c.trim());
}

function parseTestcases(mdPath) {
  const lines = fs.readFileSync(mdPath, 'utf8').split(/\r?\n/);
  let header = null; const rows = [];
  for (const l of lines) {
    if (!l.trim().startsWith('|')) { if (header && rows.length) break; continue; }
    const cells = splitRow(l);
    if (!header) { if (cells.includes('TC ID') && cells.some((c) => /Kết quả mong đợi/.test(c))) header = cells; continue; }
    if (/^[-:\s|]+$/.test(l.replace(/\|/g, ''))) continue; // separator
    rows.push(cells);
  }
  if (!header) throw new Error('Không tìm thấy header bảng testcase (TC ID / Kết quả mong đợi).');
  const idx = {
    id: header.indexOf('TC ID'),
    steps: header.findIndex((h) => /Các bước thực hiện/.test(h)),
    expected: header.findIndex((h) => /Kết quả mong đợi/.test(h)),
  };
  return rows
    .filter((c) => c[idx.id])
    .map((c) => ({ tcId: c[idx.id], steps: c[idx.steps] || '', expected: c[idx.expected] || '' }));
}

async function findExistingTest(tcId) {
  const jql = `project = ${PROJECT_KEY} AND issuetype = Test AND labels = "${escapeJql(labelFor(`tc-${tcId}`))}" AND labels = "${escapeJql(labelFor(`task-${TASK_KEY}`))}" ORDER BY created DESC`;
  const r = await axios.post(`${BASE}/rest/api/3/search/jql`, { jql, fields: ['summary'], maxResults: 1 }, { headers: H });
  const it = r.data.issues && r.data.issues[0];
  return it ? { id: String(it.id), key: it.key } : null;
}

(async () => {
  let testcases = parseTestcases(MD_PATH);
  if (ONLY.length) testcases = testcases.filter((t) => ONLY.includes(String(t.tcId).toLowerCase()));
  console.log(`File: ${MD_PATH}${ONLY.length ? ` | --only ${ONLY.length} TC` : ''}`);
  console.log(`Task: ${TASK_KEY} | Project: ${PROJECT_KEY} | Testcase trong file: ${testcases.length} | Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);

  if (APPLY && !isUsableCreds(XRAY_CLIENT_ID_ENV(), XRAY_CLIENT_SECRET_ENV())) {
    console.error('Cần XRAY_CLIENT_ID/XRAY_CLIENT_SECRET hợp lệ để sync step.');
    process.exit(1);
  }
  const client = APPLY ? new XrayCloudClient({
    clientId: XRAY_CLIENT_ID_ENV(),
    clientSecret: XRAY_CLIENT_SECRET_ENV(),
    baseUrl: process.env.XRAY_CLOUD_BASE_URL || process.env.XRAY_API_BASE_URL || 'https://xray.cloud.getxray.app',
  }) : null;

  const notFound = []; const planned = []; let updated = 0; const errors = [];
  for (const tc of testcases) {
    let issue;
    try { issue = await findExistingTest(tc.tcId); }
    catch (e) { errors.push(`${tc.tcId}: tìm test lỗi (${e.response ? e.response.status : e.message})`); continue; }
    if (!issue) { notFound.push(tc.tcId); continue; }
    const steps = buildXraySteps(tc.steps, tc.expected);
    planned.push({ tcId: tc.tcId, key: issue.key, stepCount: steps.length });
    if (!APPLY) continue;
    try {
      const res = await client.syncManualSteps(issue.id, steps, { testType: XRAY_TEST_TYPE });
      updated += 1;
      if (updated % 10 === 0) console.log(`  ...đã cập nhật ${updated}`);
      planned[planned.length - 1].removed = res.removed; planned[planned.length - 1].added = res.added;
    } catch (e) { errors.push(`${tc.tcId} (${issue.key}): sync lỗi (${e.message})`); }
  }

  console.log(`\nKhớp test trên Xray: ${planned.length}/${testcases.length}`);
  if (notFound.length) console.log(`KHÔNG thấy trên Xray (bỏ qua, KHÔNG tạo): ${notFound.length} -> ${notFound.slice(0, 8).join(', ')}${notFound.length > 8 ? ' ...' : ''}`);
  // Xem trước mapping của testcase đầu tiên
  if (planned.length) {
    const first = testcases.find((t) => t.tcId === planned[0].tcId);
    const s = buildXraySteps(first.steps, first.expected);
    console.log(`\nVí dụ mapping [${planned[0].tcId} -> ${planned[0].key}] (${s.length} step):`);
    s.forEach((st, i) => console.log(`  Step ${i + 1}: ACTION="${st.action.replace(/\n/g, ' / ')}"\n           RESULT="${st.result.replace(/\n/g, ' | ')}"`));
  }
  if (APPLY) console.log(`\n✅ Đã sync step: ${updated}/${planned.length} test (lỗi ${errors.length}).`);
  else console.log(`\n[DRY-RUN] Chưa gọi API. Thêm --apply để đồng bộ step (clear + add lại) cho ${planned.length} test.`);
  if (errors.length) { console.log('Lỗi:'); errors.slice(0, 15).forEach((e) => console.log('  - ' + e)); }
  if (errors.length) process.exitCode = 1;
})().catch((e) => { console.error('ERROR:', e.response ? `${e.response.status} ${JSON.stringify(e.response.data).slice(0, 300)}` : e.message); process.exit(1); });

function XRAY_CLIENT_ID_ENV() { return process.env.XRAY_CLIENT_ID || ''; }
function XRAY_CLIENT_SECRET_ENV() { return process.env.XRAY_CLIENT_SECRET || ''; }
