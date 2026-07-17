const https = require('https');
const fs = require('fs');
const path = require('path');
const {
  getProjectOutputDir,
  getTaskKey,
  getTaskOutputDir,
  loadEnv,
} = require('./utils');

loadEnv();

const FIGMA_TOKEN = process.env.FIGMA_API_KEY;
const FILE_KEY = process.env.FIGMA_FILE_KEY || parseFigmaFileKey(process.env.FIGMA_FILE_URL || '');
const NODE_ID = process.env.FIGMA_NODE_ID || parseFigmaNodeId(process.env.FIGMA_FILE_URL || '');
const TASK_KEY = getTaskKey();
const PROJECT_OUTPUT_DIR = getProjectOutputDir();
const TASK_OUTPUT_DIR = getTaskOutputDir({ projectOutputDir: PROJECT_OUTPUT_DIR, taskKey: TASK_KEY });
const OUT_DIR = process.env.FIGMA_OUTPUT_DIR
  ? path.resolve(process.env.FIGMA_OUTPUT_DIR)
  : path.resolve(__dirname, '..', '..', '..', TASK_OUTPUT_DIR, 'requirements', 'figma');

if (!FIGMA_TOKEN || !FILE_KEY || !NODE_ID) {
  console.error('ERROR: Missing FIGMA_API_KEY, FIGMA_FILE_KEY/FIGMA_FILE_URL, or FIGMA_NODE_ID.');
  process.exit(1);
}

function parseFigmaFileKey(fileUrl) {
  const match = String(fileUrl).match(/figma\.com\/(?:file|design)\/([^/?#]+)/i);
  return match ? match[1] : '';
}

function parseFigmaNodeId(fileUrl) {
  try {
    const url = new URL(fileUrl);
    return (url.searchParams.get('node-id') || '').replace(/-/g, ':');
  } catch {
    return '';
  }
}

function httpsGet(opts) {
  return new Promise((resolve, reject) => {
    let data = '';
    const req = https.get(opts, (res) => {
      console.log('  HTTP status:', res.statusCode);
      res.on('data', (d) => {
        data += d;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          resolve({ _raw: data.substring(0, 500) });
        }
      });
    });
    req.on('error', reject);
  });
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log(`\n--- Test 1: GET /v1/files/${FILE_KEY}?depth=1 ---`);
  const fileResponse = await httpsGet({
    hostname: 'api.figma.com',
    path: `/v1/files/${FILE_KEY}?depth=1`,
    headers: { 'X-Figma-Token': FIGMA_TOKEN },
  });

  if (fileResponse.name) {
    console.log('  File name:', fileResponse.name);
    console.log('  Last modified:', fileResponse.lastModified);
    const pages = (fileResponse.document && fileResponse.document.children) || [];
    console.log(`  Pages (${pages.length}):`);
    pages.forEach((page) => console.log('    -', page.id, page.name));
    fs.writeFileSync(
      path.join(OUT_DIR, 'figma_file_meta.json'),
      JSON.stringify(
        {
          name: fileResponse.name,
          lastModified: fileResponse.lastModified,
          pages: pages.map((page) => ({ id: page.id, name: page.name })),
        },
        null,
        2
      ),
      'utf8'
    );
  } else {
    console.log('  Response:', JSON.stringify(fileResponse).substring(0, 200));
  }

  console.log('\n--- Test 2: GET /v1/images/:key?ids=<node> ---');
  const imageResponse = await httpsGet({
    hostname: 'api.figma.com',
    path: `/v1/images/${FILE_KEY}?ids=${encodeURIComponent(NODE_ID)}&format=png&scale=1`,
    headers: { 'X-Figma-Token': FIGMA_TOKEN },
  });
  console.log('  Response:', JSON.stringify(imageResponse).substring(0, 400));
  if (imageResponse.images) {
    fs.writeFileSync(path.join(OUT_DIR, 'figma_images.json'), JSON.stringify(imageResponse, null, 2), 'utf8');
    console.log('  Image URLs saved.');
  }
}

main().catch((error) => {
  console.error('ERROR:', error.message);
  process.exit(1);
});
