#!/usr/bin/env node
/**
 * Tạo profile task từ template: profiles/task.env.example -> profiles/<TASK_KEY>/task.env
 * Prefill TASK_KEY + JIRA_STORY_KEY (+ PROJECT_OUTPUT_DIR nếu truyền). KHÔNG ghi đè nếu đã tồn tại.
 *
 * Dùng:
 *   node scripts/utils/create_profile.js <TASK_KEY> [--project-output outputs/<YOUR_PROJECT>] [--force]
 *   npm run profile:create -- <TASK_KEY> [--project-output outputs/<YOUR_PROJECT>]
 */
const fs = require('fs');
const path = require('path');

const REPO = process.cwd();
const TEMPLATE = path.join(REPO, 'profiles', 'task.env.example');

function argVal(name) { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : ''; }
const FORCE = process.argv.includes('--force');
const TASK_KEY = (process.argv[2] || '').trim();
const PROJECT_OUTPUT = argVal('project-output').trim();

if (!TASK_KEY || TASK_KEY.startsWith('--')) {
  console.error('Thiếu TASK_KEY. Dùng: node scripts/utils/create_profile.js <TASK_KEY> [--project-output outputs/<YOUR_PROJECT>]');
  process.exit(1);
}
if (!/^[A-Z][A-Z0-9]+-\d+$/i.test(TASK_KEY)) {
  console.error(`TASK_KEY "${TASK_KEY}" không đúng dạng (vd SAPP-24395).`);
  process.exit(1);
}
if (!fs.existsSync(TEMPLATE)) { console.error(`Không thấy template: ${TEMPLATE}`); process.exit(1); }

const targetDir = path.join(REPO, 'profiles', TASK_KEY);
const target = path.join(targetDir, 'task.env');
if (fs.existsSync(target) && !FORCE) {
  console.error(`Đã tồn tại: profiles/${TASK_KEY}/task.env — KHÔNG ghi đè (tránh mất credential). Thêm --force nếu chắc chắn muốn thay.`);
  process.exit(1);
}

let content = fs.readFileSync(TEMPLATE, 'utf8');
// prefill giá trị suy ra được
content = content.replace(/<TASK_KEY>/g, TASK_KEY);
if (PROJECT_OUTPUT) content = content.replace(/outputs\/<YOUR_PROJECT>/g, PROJECT_OUTPUT);
// dọn header cho hợp file profile thật (không còn chữ "TEMPLATE"/hướng dẫn copy)
let ls = content.split(/\r?\n/);
ls = ls.map((l) => l.replace(/^# TASK PROFILE TEMPLATE\s*$/, `# TASK PROFILE - ${TASK_KEY} (chỉ GIÁ TRỊ ĐỘNG)`)
                    .replace(/^# Copy file .*$/, '# Sinh từ template profiles/task.env.example — điền tiếp credential + link.'));
// bỏ khối "# Tạo nhanh ..." (từ dòng đó tới ngay trước "# Chạy:")
const startI = ls.findIndex((l) => l.startsWith('# Tạo nhanh'));
if (startI >= 0) {
  const endI = ls.findIndex((l, i) => i > startI && l.startsWith('# Chạy:'));
  if (endI > startI) ls.splice(startI, endI - startI);
}
content = ls.join('\n');

fs.mkdirSync(targetDir, { recursive: true });
fs.writeFileSync(target, content, 'utf8');

console.log(`✅ Đã tạo profiles/${TASK_KEY}/task.env (prefill TASK_KEY=${TASK_KEY}, JIRA_STORY_KEY=${TASK_KEY}${PROJECT_OUTPUT ? `, PROJECT_OUTPUT_DIR=${PROJECT_OUTPUT}` : ''}).`);
console.log('👉 QA điền tiếp: JIRA_STORY_URL, CONFLUENCE_*, FIGMA_FILE_URL, GOOGLE_DOCUMENT_ID, GOOGLE_SHEET_URL, LMS_*/OPS_* username/password/token.');
console.log('   File này KHÔNG commit (đã gitignore). Giá trị tĩnh (base URL/API key Figma/Confluence/Jira/Xray/HubSpot) để ở .env chung.');
