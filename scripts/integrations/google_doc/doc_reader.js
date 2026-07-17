/**
 * Google Docs Reader - Đọc nội dung từ Google Docs
 *
 * Hỗ trợ:
 *   - Đọc document theo ID hoặc URL
 *   - Export ra Markdown (giữ heading, bullet, bảng, link, bold/italic) hoặc JSON
 *   - Lưu artifact dưới thư mục output của task
 *
 * Sử dụng:
 *   node doc_reader.js --doc "https://docs.google.com/document/d/XXXX/edit"
 *   node doc_reader.js --doc "<DOCUMENT_ID>" --format md
 *   node doc_reader.js --format json            # dùng GOOGLE_DOCUMENT_ID trong .env
 *   node doc_reader.js --doc "<ID>" --output ./requirements
 */

const path = require('path');
const {
  getProjectOutputDir,
  getTaskKey,
  getTaskOutputDir,
} = require('../../utils/runtime_config');
const {
  loadEnv,
  buildDocsClient,
  extractDocId,
  docToMarkdown,
  docToPlainText,
  saveJsonToFile,
  saveTextToFile,
  getTimestamp,
  log,
  handleApiError,
} = require('./utils');

function initEnv() {
  loadEnv();
}

/**
 * Đọc một Google Doc theo ID.
 * @param {string} documentId
 * @returns {object|null} document object
 */
async function readDoc(documentId) {
  log('LOG', `Đang đọc Document: ${documentId} ...`);
  try {
    const docs = await buildDocsClient();
    const res = await docs.documents.get({ documentId });
    log('LOG', `Đọc thành công: "${res.data.title}"`);
    return res.data;
  } catch (error) {
    handleApiError(error, `Read Document "${documentId}"`);
    return null;
  }
}

function safeName(str) {
  return String(str || 'document').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 60);
}

// ============ CLI ============

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage();
    return;
  }

  initEnv();

  const rawId = (typeof args.doc === 'string' && args.doc) || process.env.GOOGLE_DOCUMENT_ID;
  if (!rawId || rawId === 'your-document-id-here') {
    log('ERROR', 'Chưa có Document. Truyền --doc "<ID/URL>" hoặc cấu hình GOOGLE_DOCUMENT_ID trong .env.');
    printUsage();
    process.exit(1);
  }

  const documentId = extractDocId(rawId);
  const doc = await readDoc(documentId);
  if (!doc) {
    process.exit(1);
  }

  const timestamp = getTimestamp();
  let baseOutputDir;
  if (args.output) {
    baseOutputDir = path.resolve(process.cwd(), args.output);
  } else {
    const projectOutputDir = getProjectOutputDir();
    const taskKey = getTaskKey();
    const taskOutputDir = getTaskOutputDir({ projectOutputDir, taskKey });
    baseOutputDir = path.resolve(
      __dirname, '..', '..', '..',
      process.env.OUTPUT_DIR || path.join(taskOutputDir, 'requirements', 'google_doc'),
    );
  }

  const docFolder = `${safeName(doc.title)}_${timestamp}`;
  const outputDir = path.join(baseOutputDir, docFolder);

  const format = args.format || 'md';

  if (format === 'json') {
    const jsonFile = path.join(outputDir, `${safeName(doc.title)}.json`);
    saveJsonToFile(jsonFile, {
      readAt: new Date().toISOString(),
      documentId: doc.documentId,
      title: doc.title,
      plainText: docToPlainText(doc),
      raw: doc,
    });
  } else {
    const mdContent = docToMarkdown(doc);
    const mdFile = path.join(outputDir, `${safeName(doc.title)}.md`);
    saveTextToFile(mdFile, mdContent);

    console.log('\n--- Tóm tắt kết quả ---');
    console.log(`  Title: "${doc.title}"`);
    console.log(`  Document ID: ${doc.documentId}`);
    console.log(`  Markdown length: ${mdContent.length} ký tự`);
  }

  log('LOG', `Output: ${outputDir}`);
}

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

function printUsage() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║           GOOGLE DOCS READER - Test Automation Kit          ║
║        Đọc nội dung Google Docs cho Test Automation         ║
╚══════════════════════════════════════════════════════════════╝

Cách sử dụng:
  node doc_reader.js [options]

Options:
  --doc <ID|URL>          Document ID hoặc URL Google Docs cần đọc
                          (bỏ trống sẽ dùng GOOGLE_DOCUMENT_ID trong .env)
  --format <FMT>          Định dạng output: md (default) hoặc json
  --output <DIR>          Thư mục lưu file output
  --help                  Hiển thị hướng dẫn này

Ví dụ:
  node doc_reader.js --doc "https://docs.google.com/document/d/XXXX/edit"
  node doc_reader.js --doc "XXXX" --format md
  node doc_reader.js --format json
  node doc_reader.js --doc "XXXX" --output ./requirements
  `);
}

module.exports = {
  readDoc,
};

if (require.main === module) {
  main().catch((err) => {
    log('ERROR', `Unexpected error: ${err.message}`);
    process.exit(1);
  });
}
