/**
 * Google OAuth login (chạy MỘT LẦN) — kết nối bằng TÀI KHOẢN GOOGLE của bạn (không phải service account).
 * Sau khi đăng nhập, token (kèm refresh_token) được lưu vào token.json và tự gia hạn về sau.
 * Đọc được MỌI Google Doc mà tài khoản của bạn có quyền — không cần share từng doc.
 *
 * Chuẩn bị 1 lần:
 *   1) Google Cloud Console → APIs & Services → Credentials → Create Credentials → OAuth client ID
 *      → Application type: "Desktop app" → Create → Download JSON.
 *   2) Lưu file JSON đó thành: scripts/integrations/google_doc/oauth-credentials.json
 *   3) Đảm bảo đã bật "Google Docs API" (và nên bật cả "Google Drive API") trong project.
 *
 * Chạy:  node scripts/integrations/google_doc/google_oauth_login.js
 *   → Mở URL in ra trong trình duyệt, đăng nhập tài khoản có quyền vào FSD, bấm Allow.
 *   → Google redirect về http://localhost:<PORT>, script tự đổi code → lưu token.json.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const DIR = __dirname;
const CRED_PATH = path.resolve(DIR, process.env.GOOGLE_OAUTH_CREDENTIALS_PATH || 'oauth-credentials.json');
const TOKEN_PATH = path.resolve(DIR, process.env.GOOGLE_OAUTH_TOKEN_PATH || 'token.json');
const PORT = Number(process.env.GOOGLE_OAUTH_PORT || 8088);
const SCOPES = [
  'https://www.googleapis.com/auth/documents.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
];

function fail(msg) { console.error('[ERROR] ' + msg); process.exit(1); }

if (!fs.existsSync(CRED_PATH)) {
  fail(`Chưa có file OAuth credentials: ${CRED_PATH}\n` +
    'Tạo OAuth client ID (Desktop app) ở Google Cloud Console → tải JSON → lưu vào đường dẫn trên.');
}
const credRaw = JSON.parse(fs.readFileSync(CRED_PATH, 'utf-8'));
const conf = credRaw.installed || credRaw.web;
if (!conf || !conf.client_id) fail('File credentials không đúng định dạng (thiếu "installed"/"web" hoặc client_id).');

const redirectUri = `http://localhost:${PORT}`;
const oAuth2 = new google.auth.OAuth2(conf.client_id, conf.client_secret, redirectUri);
const authUrl = oAuth2.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES });

const server = http.createServer(async (req, res) => {
  if (!req.url || req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  try {
    const u = new URL(req.url, redirectUri);
    const err = u.searchParams.get('error');
    if (err) { res.end('Bị từ chối: ' + err); console.error('[ERROR] OAuth bị từ chối:', err); setTimeout(() => process.exit(1), 300); return; }
    const code = u.searchParams.get('code');
    if (!code) { res.end('Đang chờ code...'); return; }
    const { tokens } = await oAuth2.getToken(code);
    let existing = {};
    try { existing = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8')); } catch (_) {}
    const merged = { ...existing, ...tokens }; // giữ refresh_token cũ nếu lần này Google không trả lại
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged, null, 2), 'utf-8');
    res.end('✅ Đăng nhập Google thành công! Token đã được lưu. Có thể đóng tab này và quay lại terminal.');
    console.log(`\n✅ Đã lưu token vào: ${TOKEN_PATH}`);
    console.log(`   refresh_token: ${merged.refresh_token ? 'CÓ (sẽ tự gia hạn, không cần đăng nhập lại)' : 'KHÔNG — xoá token.json rồi chạy lại (prompt=consent) để lấy refresh_token'}`);
    setTimeout(() => { server.close(); process.exit(0); }, 400);
  } catch (e) {
    res.end('Lỗi: ' + e.message);
    console.error('[ERROR]', e.message);
    setTimeout(() => process.exit(1), 300);
  }
});

server.listen(PORT, () => {
  console.log('\n============================================================');
  console.log('GOOGLE OAUTH LOGIN — chạy một lần');
  console.log('============================================================');
  console.log('\n1) Mở URL sau trong trình duyệt (đăng nhập tài khoản Google CÓ QUYỀN vào doc FSD):\n');
  console.log(authUrl);
  console.log(`\n2) Bấm Allow. Google sẽ redirect về ${redirectUri} và token tự lưu.`);
  console.log(`\n(Đang lắng nghe ở cổng ${PORT}... Nhấn Ctrl+C để huỷ.)`);
});
