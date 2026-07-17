/** Hủy assignee TOÀN BỘ Xray Test (issuetype=Test) đang có assignee trong project SAPP.
 *  Backup mapping key→assignee ra file TRƯỚC khi xóa (để khôi phục nếu cần).
 *  Chạy: node unassign_all_tests.js          (dry-run: liệt kê + backup, KHÔNG xóa)
 *        node unassign_all_tests.js --apply   (hủy assignee)
 *  Khôi phục: dùng file backup + PUT lại accountId. */
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { loadEnv, buildJiraHeaders } = require('./utils.js');
loadEnv();
const APPLY = process.argv.includes('--apply');
const BASE = process.env.JIRA_BASE_URL.replace(/\/+$/, '');
const H = buildJiraHeaders();

(async () => {
  const tests = []; let token;
  do {
    const body = { jql: 'project = SAPP AND issuetype = Test AND assignee IS NOT EMPTY', maxResults: 100, fields: ['assignee', 'labels'] };
    if (token) body.nextPageToken = token;
    const r = await axios.post(`${BASE}/rest/api/3/search/jql`, body, { headers: H });
    for (const it of (r.data.issues || [])) {
      const a = it.fields && it.fields.assignee;
      tests.push({ id: String(it.id), key: it.key, accountId: a ? a.accountId : null, displayName: a ? a.displayName : null, taskLabel: ((it.fields.labels || []).find((l) => /^task-/.test(l)) || '') });
    }
    token = r.data.nextPageToken;
  } while (token);
  console.log(`Test có assignee: ${tests.length}`);
  const byTask = {};
  for (const t of tests) byTask[t.taskLabel || '(no-label)'] = (byTask[t.taskLabel || '(no-label)'] || 0) + 1;
  console.log('Theo task label:', JSON.stringify(byTask, null, 1));
  const byAssignee = {};
  for (const t of tests) byAssignee[t.displayName || '(?)'] = (byAssignee[t.displayName || '(?)'] || 0) + 1;
  console.log('Theo người đang gán:', JSON.stringify(byAssignee, null, 1));

  const backup = path.join(__dirname, 'unassign_tests_backup.json');
  fs.writeFileSync(backup, JSON.stringify({ generatedAt: new Date().toISOString(), tests }, null, 2), 'utf8');
  console.log(`\nBackup mapping key→assignee: ${backup}`);
  if (!tests.length) { console.log('Không có Test nào để hủy.'); return; }

  if (!APPLY) { console.log('\n[DRY-RUN] Chưa hủy. Thêm --apply để hủy assignee toàn bộ.'); return; }

  let ok = 0, err = 0;
  for (let i = 0; i < tests.length; i += 1) {
    const t = tests[i];
    try {
      await axios.put(`${BASE}/rest/api/3/issue/${t.id}/assignee`, { accountId: null }, { headers: H });
      ok += 1;
    } catch (e) { err += 1; if (err <= 10) console.log(`  LỖI ${t.key}: ${e.response ? e.response.status : e.message}`); }
    if ((i + 1) % 50 === 0) console.log(`  ...đã xử lý ${i + 1}/${tests.length} (ok=${ok}, err=${err})`);
  }
  console.log(`\n✅ Đã hủy assignee: ${ok}/${tests.length} Test (lỗi ${err}). Backup: ${path.basename(backup)}`);
})().catch((e) => { console.error('ERROR:', e.response ? `${e.response.status} ${JSON.stringify(e.response.data).slice(0, 300)}` : e.message); process.exit(1); });
