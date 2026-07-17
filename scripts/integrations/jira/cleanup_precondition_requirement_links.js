/** Gỡ issue-link từ Precondition → requirement (Story/Task/Epic) trong project SAPP.
 *  GIỮ NGUYÊN association Test↔Precondition (native Xray, không phải issue-link).
 *  Chạy: node cleanup_precondition_requirement_links.js         (dry-run: chỉ liệt kê)
 *        node cleanup_precondition_requirement_links.js --apply (gỡ link)
 *  Backup danh sách link đã gỡ ra file trước khi xóa. */
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { loadEnv, buildJiraHeaders } = require('./utils.js');
loadEnv();
const APPLY = process.argv.includes('--apply');
const BASE = process.env.JIRA_BASE_URL.replace(/\/+$/, '');
const H = buildJiraHeaders();
const REQUIREMENT_TYPES = new Set(['Story', 'Task', 'Epic', 'Sub-task', 'Bug']); // "task cha" = requirement (không phải Test/Test Set/Test Plan/Test Execution/Precondition)

(async () => {
  // Lấy mọi Precondition + issuelinks
  const pres = []; let token;
  do {
    const body = { jql: 'project = SAPP AND issuetype = Precondition', maxResults: 100, fields: ['issuelinks', 'labels'] };
    if (token) body.nextPageToken = token;
    const r = await axios.post(`${BASE}/rest/api/3/search/jql`, body, { headers: H });
    for (const it of (r.data.issues || [])) pres.push({ key: it.key, links: (it.fields && it.fields.issuelinks) || [], labels: (it.fields && it.fields.labels) || [] });
    token = r.data.nextPageToken;
  } while (token);
  console.log(`Tổng Precondition: ${pres.length}`);

  // Tìm link tới requirement (Story/Task/Epic...)
  const toRemove = []; // {preKey, linkId, linkType, otherKey, otherType, taskLabel}
  for (const p of pres) {
    const taskLabel = (p.labels.find((l) => /^task-/.test(l)) || '');
    for (const l of p.links) {
      const other = l.inwardIssue || l.outwardIssue;
      if (!other) continue;
      const otype = other.fields && other.fields.issuetype && other.fields.issuetype.name;
      if (REQUIREMENT_TYPES.has(otype)) {
        toRemove.push({ preKey: p.key, linkId: l.id, linkType: l.type && l.type.name, otherKey: other.key, otherType: otype, taskLabel });
      }
    }
  }
  // Nhóm theo task label để báo cáo
  const byTask = {};
  for (const x of toRemove) (byTask[x.taskLabel || '(no-label)'] = byTask[x.taskLabel || '(no-label)'] || []).push(x);
  console.log(`\nSố Precondition→requirement link sẽ gỡ: ${toRemove.length}`);
  for (const t of Object.keys(byTask).sort()) {
    const arr = byTask[t];
    console.log(`  [${t}] ${arr.length} link → vd: ${arr.slice(0, 3).map((x) => `${x.preKey}--(${x.linkType})-->${x.otherKey}[${x.otherType}]`).join(' ; ')}`);
  }
  if (!toRemove.length) { console.log('\nKhông có link nào cần gỡ.'); return; }

  // Backup
  const backup = path.join(__dirname, `precondition_link_backup_${APPLY ? 'applied' : 'dryrun'}.json`);
  fs.writeFileSync(backup, JSON.stringify(toRemove, null, 2), 'utf8');
  console.log(`\nBackup danh sách link: ${backup}`);

  if (!APPLY) { console.log('\n[DRY-RUN] Chưa gỡ. Thêm --apply để gỡ link.'); return; }

  let ok = 0, err = 0;
  for (const x of toRemove) {
    try { await axios.delete(`${BASE}/rest/api/3/issueLink/${x.linkId}`, { headers: H }); ok += 1; }
    catch (e) { err += 1; console.log(`  LỖI gỡ ${x.preKey}--${x.otherKey}: ${e.response ? e.response.status : e.message}`); }
  }
  console.log(`\n✅ Đã gỡ ${ok} link (lỗi ${err}). Association Test↔Precondition (native Xray) KHÔNG bị ảnh hưởng.`);
})().catch((e) => { console.error('ERROR:', e.response ? `${e.response.status} ${JSON.stringify(e.response.data).slice(0, 300)}` : e.message); process.exit(1); });
