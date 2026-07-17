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
const safeNodeId = NODE_ID.replace(/[^a-zA-Z0-9_-]/g, '-');
const OUT_FILE = path.join(OUT_DIR, `figma_node_${safeNodeId}.json`);
const OUT_SUMMARY = path.join(OUT_DIR, 'figma_ui_summary.md');

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
      res.on('data', (d) => {
        data += d;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(new Error('Parse error: ' + data.substring(0, 300)));
        }
      });
    });
    req.on('error', reject);
  });
}

function flattenNode(node, depth, lines) {
  const indent = '  '.repeat(depth);
  lines.push(`${indent}[${node.type}] ${node.name || ''}`);
  if (node.children && depth < 4) {
    for (const child of node.children) {
      flattenNode(child, depth + 1, lines);
    }
  }
}

function extractTexts(node, texts) {
  if (node.type === 'TEXT' && node.characters) {
    texts.push(node.characters.trim());
  }
  if (node.children) {
    for (const child of node.children) extractTexts(child, texts);
  }
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log('[1/3] Fetching Figma file metadata...');
  const meta = await httpsGet({
    hostname: 'api.figma.com',
    path: `/v1/files/${FILE_KEY}?depth=1`,
    headers: { 'X-Figma-Token': FIGMA_TOKEN },
  });
  console.log('File name:', meta.name);
  console.log('Pages:', ((meta.document && meta.document.children) || []).map((p) => p.name).join(', '));

  console.log('\n[2/3] Fetching node', NODE_ID, '...');
  const nodeData = await httpsGet({
    hostname: 'api.figma.com',
    path: `/v1/files/${FILE_KEY}/nodes?ids=${encodeURIComponent(NODE_ID)}&depth=5`,
    headers: { 'X-Figma-Token': FIGMA_TOKEN },
  });

  fs.writeFileSync(OUT_FILE, JSON.stringify(nodeData, null, 2), 'utf8');
  console.log('Raw JSON saved:', OUT_FILE);

  const nodeKeys = Object.keys(nodeData.nodes || {});
  const lines = [
    '# Figma UI Analysis',
    '',
    `- **File**: ${meta.name || FILE_KEY}`,
    `- **Node ID**: ${NODE_ID}`,
    `- **URL**: https://www.figma.com/design/${FILE_KEY}?node-id=${NODE_ID}`,
    `- **Fetched**: ${new Date().toISOString()}`,
    '',
    '---',
    '',
    '## Component Tree',
    '',
  ];

  for (const key of nodeKeys) {
    const rootNode = nodeData.nodes[key];
    if (rootNode && rootNode.document) {
      lines.push(`### Root: ${rootNode.document.name} (${rootNode.document.type})`);
      lines.push('');
      const treeLines = [];
      flattenNode(rootNode.document, 0, treeLines);
      lines.push(...treeLines);
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');
  lines.push('## UI Text Labels Found');
  lines.push('');
  const allTexts = [];
  for (const key of nodeKeys) {
    const rootNode = nodeData.nodes[key];
    if (rootNode && rootNode.document) {
      extractTexts(rootNode.document, allTexts);
    }
  }
  const uniqueTexts = [...new Set(allTexts)].filter((text) => text.length > 0);
  uniqueTexts.forEach((text) => lines.push(`- ${text}`));

  fs.writeFileSync(OUT_SUMMARY, lines.join('\n'), 'utf8');
  console.log('\n[3/3] Summary saved:', OUT_SUMMARY);
  console.log('Total unique text labels:', uniqueTexts.length);
  console.log('\nPreview (first 30 labels):');
  uniqueTexts.slice(0, 30).forEach((text, index) => console.log(`  ${index + 1}. ${text}`));
}

main().catch((error) => {
  console.error('ERROR:', error.message);
  process.exit(1);
});
