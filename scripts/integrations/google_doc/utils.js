/**
 * Google Docs Integration - Utility Functions
 * Các hàm xử lý chung cho việc tích hợp Google Docs (đọc tài liệu).
 *
 * Xác thực:
 *   - Service Account (khuyến nghị cho automation / CI-CD) — đọc được cả Doc riêng tư
 *     miễn là đã share Doc cho email của Service Account.
 *   - API Key: Docs API thường KHÔNG chấp nhận API key cho documents.get
 *     (khác với Sheets). Ưu tiên dùng Service Account.
 */

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { isUsableValue, loadEnvFiles } = require('../../utils/runtime_config');

/**
 * Load biến môi trường từ file .env
 * File .env nằm cùng thư mục scripts/integrations/google_doc/
 */
function loadEnv() {
  loadEnvFiles([
    path.resolve(__dirname, '.env.local'),
    path.resolve(__dirname, '.env'),
  ]);
}

/**
 * Validate các biến môi trường bắt buộc
 * @param {string[]} requiredVars - Danh sách tên biến cần kiểm tra
 */
function validateEnvVars(requiredVars) {
  const missing = requiredVars.filter((v) => !isUsableValue(process.env[v]));
  if (missing.length > 0) {
    console.error(`[ERROR] Thiếu biến môi trường: ${missing.join(', ')}`);
    console.error('Hãy kiểm tra file .env và bổ sung đầy đủ.');
    process.exit(1);
  }
}

/**
 * Tạo Google Auth client từ Service Account hoặc API Key
 * @returns {object} { type, auth } hoặc { type, apiKey }
 */
function buildGoogleAuth() {
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  const apiKey = process.env.GOOGLE_API_KEY;

  // OAuth (tài khoản người dùng) — ưu tiên nếu đã đăng nhập 1 lần (có token.json).
  // Đọc được mọi doc mà tài khoản Google của bạn có quyền, không cần share từng doc.
  const oauthTokenPath = path.resolve(__dirname, process.env.GOOGLE_OAUTH_TOKEN_PATH || './token.json');
  const oauthCredPath = path.resolve(__dirname, process.env.GOOGLE_OAUTH_CREDENTIALS_PATH || './oauth-credentials.json');
  if (fs.existsSync(oauthTokenPath) && fs.existsSync(oauthCredPath)) {
    const credRaw = JSON.parse(fs.readFileSync(oauthCredPath, 'utf-8'));
    const conf = credRaw.installed || credRaw.web;
    if (conf && conf.client_id) {
      const redirectUri = (conf.redirect_uris && conf.redirect_uris[0]) || `http://localhost:${process.env.GOOGLE_OAUTH_PORT || 8088}`;
      const oauth = new google.auth.OAuth2(conf.client_id, conf.client_secret, redirectUri);
      oauth.setCredentials(JSON.parse(fs.readFileSync(oauthTokenPath, 'utf-8')));
      return { type: 'oauth', auth: oauth };
    }
  }

  if (keyPath) {
    const resolvedPath = path.resolve(__dirname, keyPath);
    if (!fs.existsSync(resolvedPath)) {
      console.error(`[ERROR] Không tìm thấy file Service Account key: ${resolvedPath}`);
      console.error('Hãy tải file JSON credentials từ Google Cloud Console.');
      process.exit(1);
    }
    const auth = new google.auth.GoogleAuth({
      keyFile: resolvedPath,
      scopes: [
        'https://www.googleapis.com/auth/documents.readonly',
        'https://www.googleapis.com/auth/drive.readonly',
      ],
    });
    return { type: 'serviceAccount', auth };
  }

  if (apiKey) {
    return { type: 'apiKey', apiKey };
  }

  console.error('[ERROR] Thiếu thông tin xác thực Google.');
  console.error('Cần GOOGLE_SERVICE_ACCOUNT_KEY_PATH (Service Account) — khuyến nghị cho Docs.');
  process.exit(1);
}

/**
 * Tạo Google Docs API client (v1)
 * @returns {object} docs API client
 */
async function buildDocsClient() {
  const authInfo = buildGoogleAuth();

  if (authInfo.type === 'oauth') {
    return google.docs({ version: 'v1', auth: authInfo.auth });
  }

  if (authInfo.type === 'serviceAccount') {
    const authClient = await authInfo.auth.getClient();
    return google.docs({ version: 'v1', auth: authClient });
  }

  if (authInfo.type === 'apiKey') {
    log('WARN', 'Docs API thường không chấp nhận API key cho tài liệu. Nếu lỗi 401/403, hãy dùng Service Account.');
    return google.docs({ version: 'v1', auth: authInfo.apiKey });
  }
}

/**
 * Trích Document ID từ ID thuần hoặc URL Google Docs
 * VD: https://docs.google.com/document/d/<DOC_ID>/edit  ->  <DOC_ID>
 * @param {string} input - Doc ID hoặc URL
 * @returns {string} Document ID
 */
function extractDocId(input) {
  if (!input) return '';
  const value = String(input).trim();
  const urlMatch = value.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (urlMatch) return urlMatch[1];
  // fallback: nếu là URL dạng ...?id=<DOC_ID>
  const queryMatch = value.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (queryMatch) return queryMatch[1];
  return value;
}

// ============ Docs -> Markdown ============

/**
 * Map namedStyleType của paragraph sang tiền tố Markdown heading.
 * Trả về '' cho paragraph thường.
 */
function headingPrefix(namedStyleType) {
  switch (namedStyleType) {
    case 'TITLE':
      return '# ';
    case 'HEADING_1':
      return '# ';
    case 'HEADING_2':
      return '## ';
    case 'HEADING_3':
      return '### ';
    case 'HEADING_4':
      return '#### ';
    case 'HEADING_5':
      return '##### ';
    case 'HEADING_6':
      return '###### ';
    default:
      return '';
  }
}

/**
 * Áp dụng định dạng inline (bold/italic/link) cho một textRun.
 * @param {object} textRun
 * @returns {string}
 */
function formatTextRun(textRun) {
  const raw = textRun.content || '';
  // Bỏ ký tự xuống dòng cuối paragraph (được xử lý ở cấp paragraph)
  let text = raw.replace(/\n/g, '');
  if (text.length === 0) return '';

  // Giữ khoảng trắng đầu/cuối tách riêng để không phá cú pháp markdown
  const leading = text.match(/^\s*/)[0];
  const trailing = text.match(/\s*$/)[0];
  let core = text.slice(leading.length, text.length - trailing.length);
  if (core.length === 0) return text;

  const style = textRun.textStyle || {};
  if (style.bold && style.italic) {
    core = `***${core}***`;
  } else if (style.bold) {
    core = `**${core}**`;
  } else if (style.italic) {
    core = `*${core}*`;
  }

  const url = style.link && style.link.url;
  if (url) {
    core = `[${core}](${url})`;
  }

  return `${leading}${core}${trailing}`;
}

/**
 * Trích text đã format của một paragraph (không gồm heading/bullet prefix).
 * @param {object} paragraph
 * @returns {string}
 */
function paragraphInlineText(paragraph) {
  const elements = paragraph.elements || [];
  let out = '';
  for (const el of elements) {
    if (el.textRun) {
      out += formatTextRun(el.textRun);
    } else if (el.horizontalRule) {
      out += '---';
    }
    // inlineObjectElement (ảnh), pageBreak, columnBreak... bỏ qua nội dung text.
  }
  return out.trim();
}

/**
 * Xác định bullet là ordered (đánh số) hay unordered dựa vào glyphType của list.
 * @param {object} doc - document object
 * @param {object} bullet - paragraph.bullet
 * @returns {boolean} true nếu ordered
 */
function isOrderedBullet(doc, bullet) {
  const lists = doc.lists || {};
  const list = lists[bullet.listId];
  const level = bullet.nestingLevel || 0;
  const nestingLevels = list && list.listProperties && list.listProperties.nestingLevels;
  const glyph = nestingLevels && nestingLevels[level] && nestingLevels[level].glyphType;
  if (!glyph) return false;
  return /DECIMAL|ALPHA|ROMAN/.test(glyph);
}

/**
 * Trích text thuần của một cell (dùng cho table).
 * @param {object} cell - tableCell
 * @returns {string}
 */
function cellText(cell) {
  const content = cell.content || [];
  const parts = [];
  for (const el of content) {
    if (el.paragraph) {
      const t = paragraphInlineText(el.paragraph);
      if (t) parts.push(t);
    }
  }
  // Escape pipe và gộp xuống dòng thành khoảng trắng cho markdown table
  return parts.join(' ').replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();
}

/**
 * Chuyển một table structural element thành markdown table.
 * @param {object} table
 * @returns {string}
 */
function tableToMarkdown(table) {
  const rows = table.tableRows || [];
  if (rows.length === 0) return '';

  const matrix = rows.map((r) => (r.tableCells || []).map((c) => cellText(c)));
  const colCount = Math.max(...matrix.map((r) => r.length));

  const pad = (r) => {
    const copy = r.slice();
    while (copy.length < colCount) copy.push('');
    return copy;
  };

  const header = pad(matrix[0]);
  let md = `| ${header.join(' | ')} |\n`;
  md += `| ${header.map(() => '---').join(' | ')} |\n`;
  for (let i = 1; i < matrix.length; i++) {
    md += `| ${pad(matrix[i]).join(' | ')} |\n`;
  }
  return md;
}

/**
 * Chuyển toàn bộ Google Doc sang Markdown.
 * @param {object} doc - document object trả về từ Docs API
 * @returns {string} Markdown content
 */
function docToMarkdown(doc) {
  const title = doc.title || '(Untitled)';
  let md = `# ${title}\n\n`;
  md += `> Document ID: \`${doc.documentId}\` | Ngày đọc: ${new Date().toISOString()}\n\n`;

  const content = (doc.body && doc.body.content) || [];

  for (const element of content) {
    if (element.table) {
      md += `\n${tableToMarkdown(element.table)}\n`;
      continue;
    }

    if (element.tableOfContents) {
      // Bỏ qua mục lục (thường trùng lặp heading)
      continue;
    }

    if (!element.paragraph) continue;

    const paragraph = element.paragraph;
    const text = paragraphInlineText(paragraph);

    // Bullet list
    if (paragraph.bullet) {
      const level = paragraph.bullet.nestingLevel || 0;
      const indent = '  '.repeat(level);
      const marker = isOrderedBullet(doc, paragraph.bullet) ? '1.' : '-';
      if (text) md += `${indent}${marker} ${text}\n`;
      continue;
    }

    const styleType = (paragraph.paragraphStyle && paragraph.paragraphStyle.namedStyleType) || 'NORMAL_TEXT';
    const prefix = headingPrefix(styleType);

    if (prefix) {
      // Không lặp lại TITLE nếu trùng chính xác với tiêu đề tài liệu ở đầu
      if (styleType === 'TITLE' && text === title) continue;
      md += `\n${prefix}${text}\n\n`;
    } else if (styleType === 'SUBTITLE') {
      if (text) md += `_${text}_\n\n`;
    } else if (text) {
      md += `${text}\n\n`;
    } else {
      // Paragraph rỗng -> giữ 1 dòng trống (đã có sẵn), bỏ qua
    }
  }

  // Gọn khoảng trống thừa
  return md.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

/**
 * Trích plain text (không markdown) từ Google Doc.
 * @param {object} doc
 * @returns {string}
 */
function docToPlainText(doc) {
  const content = (doc.body && doc.body.content) || [];
  let out = '';
  for (const element of content) {
    if (element.paragraph) {
      const elements = element.paragraph.elements || [];
      for (const el of elements) {
        if (el.textRun) out += el.textRun.content || '';
      }
    } else if (element.table) {
      const rows = element.table.tableRows || [];
      for (const r of rows) {
        const cells = (r.tableCells || []).map((c) => cellText(c));
        out += cells.join('\t') + '\n';
      }
    }
  }
  return out;
}

// ============ File helpers ============

function saveJsonToFile(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`[OK] Đã lưu file: ${filePath}`);
}

function saveTextToFile(filePath, content) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log(`[OK] Đã lưu file: ${filePath}`);
}

function getTimestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function log(level, message) {
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [${level}]`;
  if (level === 'ERROR') {
    console.error(`${prefix} ${message}`);
  } else if (level === 'WARN') {
    console.warn(`${prefix} ${message}`);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

function handleApiError(error, context) {
  const status = error?.response?.status || error?.code;
  const message = error?.response?.data?.error?.message || error?.message;

  log('ERROR', `[${context}] ${status ? `HTTP ${status}: ` : ''}${message}`);

  if (status === 401 || status === 403) {
    log('ERROR', 'Lỗi xác thực. Kiểm tra Service Account có quyền truy cập vào Document.');
    log('ERROR', 'Đảm bảo đã share Document cho email của Service Account (client_email trong file JSON).');
  } else if (status === 404) {
    log('ERROR', 'Không tìm thấy Document. Kiểm tra GOOGLE_DOCUMENT_ID hoặc URL/ID truyền vào.');
  }
}

module.exports = {
  loadEnv,
  validateEnvVars,
  buildGoogleAuth,
  buildDocsClient,
  extractDocId,
  docToMarkdown,
  docToPlainText,
  tableToMarkdown,
  saveJsonToFile,
  saveTextToFile,
  getTimestamp,
  log,
  handleApiError,
};
