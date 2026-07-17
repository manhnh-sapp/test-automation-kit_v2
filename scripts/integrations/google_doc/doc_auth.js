/**
 * Google Docs Auth - Kiểm tra và xác minh kết nối Google Docs
 *
 * Hỗ trợ:
 *   - Service Account (khuyến nghị cho automation / CI-CD)
 *
 * Sử dụng:
 *   node doc_auth.js --verify                          Kiểm tra kết nối Document (GOOGLE_DOCUMENT_ID)
 *   node doc_auth.js --verify --doc "<ID hoặc URL>"    Verify một document cụ thể
 *   node doc_auth.js --setup                           Hướng dẫn cài đặt credentials
 *   node doc_auth.js                                   Hiển thị hướng dẫn
 */

const path = require('path');
const fs = require('fs');
const {
  loadEnv,
  buildDocsClient,
  extractDocId,
  log,
  handleApiError,
} = require('./utils');

function initEnv() {
  loadEnv();
}

/**
 * Verify kết nối và quyền truy cập Document
 * @param {string|null} docInput - Doc ID hoặc URL (tuỳ chọn, mặc định lấy từ env)
 */
async function verifyConnection(docInput = null) {
  initEnv();

  const rawId = docInput || process.env.GOOGLE_DOCUMENT_ID;
  if (!rawId || rawId === 'your-document-id-here') {
    log('ERROR', 'Chưa có Document ID. Cấu hình GOOGLE_DOCUMENT_ID trong .env hoặc truyền --doc "<ID/URL>".');
    process.exit(1);
  }
  const documentId = extractDocId(rawId);

  log('LOG', 'Đang kiểm tra kết nối Google Docs API...');

  try {
    const docs = await buildDocsClient();
    const res = await docs.documents.get({ documentId });
    const doc = res.data;

    const bodyLen = (doc.body && doc.body.content && doc.body.content.length) || 0;

    log('LOG', `✅ Kết nối thành công!`);
    log('LOG', `📄 Document: "${doc.title}"`);
    log('LOG', `🆔 Document ID: ${doc.documentId}`);
    log('LOG', `🔗 URL: https://docs.google.com/document/d/${doc.documentId}/edit`);
    log('LOG', `🧱 Số structural element: ${bodyLen}`);

    const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
    if (keyPath) {
      const resolvedPath = path.resolve(__dirname, keyPath);
      const keyData = JSON.parse(fs.readFileSync(resolvedPath, 'utf-8'));
      log('LOG', `🔑 Auth: Service Account (${keyData.client_email})`);
    } else {
      log('LOG', `🔑 Auth: API Key (Docs API có thể không hỗ trợ — nên dùng Service Account)`);
    }

    return true;
  } catch (error) {
    handleApiError(error, 'Verify Connection');
    return false;
  }
}

function printSetupGuide() {
  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║           GOOGLE DOCS INTEGRATION - Hướng Dẫn Cài Đặt              ║
╚══════════════════════════════════════════════════════════════════════╝

📌 Service Account (Khuyến nghị — đọc được cả Doc riêng tư đã share)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Bước 1: Tạo Google Cloud Project
  → Truy cập: https://console.cloud.google.com/
  → Tạo project mới hoặc chọn project hiện có

Bước 2: Bật Google Docs API (và Google Drive API)
  → APIs & Services → Library → tìm "Google Docs API" → Enable
  → (Tuỳ chọn) Enable thêm "Google Drive API"

Bước 3: Tạo Service Account
  → APIs & Services → Credentials → Create Credentials → Service Account
  → Đặt tên → Create
  → Vào Service Account vừa tạo → Keys → Add Key → JSON → Download

Bước 4: Cấu hình .env
  → Sao chép file JSON vào thư mục này (VD: service-account.json)
  → Mở .env → GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./service-account.json

Bước 5: Share Document cho Service Account
  → Mở Google Doc → Share
  → Nhập email của Service Account (client_email trong file JSON)
  → Cấp quyền tối thiểu "Viewer" → Share

Bước 6: Lấy Document ID
  → URL của Google Doc:
    https://docs.google.com/document/d/<DOCUMENT_ID>/edit
  → Copy <DOCUMENT_ID> → dán vào GOOGLE_DOCUMENT_ID trong .env
    (hoặc truyền trực tiếp --doc "<URL/ID>" khi chạy reader)

Bước 7: Verify kết nối
  → node doc_auth.js --verify

LƯU Ý: KHÔNG commit file service-account.json hoặc .env vào Git.
`);
}

// ============ CLI ============

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.replace('--', '');
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.verify) {
    const docInput = typeof args.doc === 'string' ? args.doc : null;
    const ok = await verifyConnection(docInput);
    process.exit(ok ? 0 : 1);
  }

  if (args.setup) {
    printSetupGuide();
    return;
  }

  console.log(`
╔═══════════════════════════════════════════════════════════╗
║          GOOGLE DOCS AUTH - Test Automation Kit           ║
╚═══════════════════════════════════════════════════════════╝

Cách sử dụng:
  node doc_auth.js [options]

Options:
  --verify                 Kiểm tra kết nối (dùng GOOGLE_DOCUMENT_ID trong .env)
  --verify --doc "<ID/URL>"  Verify một document cụ thể
  --setup                  Hiển thị hướng dẫn cài đặt credentials chi tiết

Ví dụ:
  node doc_auth.js --verify
  node doc_auth.js --verify --doc "https://docs.google.com/document/d/XXXX/edit"
  node doc_auth.js --setup
  `);
}

if (require.main === module) {
  main().catch((err) => {
    log('ERROR', `Unexpected error: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { verifyConnection };
