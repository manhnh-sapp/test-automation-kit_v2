const fs = require('fs');
const https = require('https');
const path = require('path');
const {
  getProjectOutputDir,
  getTaskKey,
  loadEnv,
} = require('../integrations/jira/utils');

loadEnv();

const pageId = process.argv[2];
if (!pageId) {
  console.error('Usage: node scripts/phase1/fetch_confluence_children.js <pageId>');
  process.exit(1);
}

const baseUrl = (process.env.CONFLUENCE_URL || `${process.env.JIRA_BASE_URL}/wiki`).replace(/\/+$/, '');
const username = process.env.CONFLUENCE_USERNAME || process.env.JIRA_EMAIL || process.env.JIRA_USERNAME;
const token = process.env.CONFLUENCE_API_TOKEN;
const taskKey = getTaskKey();
const projectOutputDir = getProjectOutputDir();
const outputDir = path.resolve(projectOutputDir, 'tasks', taskKey, 'requirements', 'confluence', `children_${pageId}`);

if (!baseUrl || !username || !token) {
  console.error('Missing CONFLUENCE_URL/JIRA_BASE_URL, CONFLUENCE_USERNAME/JIRA_EMAIL, or CONFLUENCE_API_TOKEN.');
  process.exit(1);
}

const base = new URL(baseUrl);
const auth = Buffer.from(`${username}:${token}`).toString('base64');

function decodeHtml(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, ' ')
    .trim();
}

function getJson(apiPath) {
  return new Promise((resolve, reject) => {
    let data = '';
    https
      .get(
        {
          hostname: base.hostname,
          path: `${base.pathname.replace(/\/+$/, '')}${apiPath}`,
          headers: {
            Authorization: `Basic ${auth}`,
            Accept: 'application/json',
          },
        },
        (res) => {
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch {
              reject(new Error(data.slice(0, 500)));
            }
          });
        },
      )
      .on('error', reject);
  });
}

function safeName(name) {
  return String(name || 'untitled').replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  const data = await getJson(`/rest/api/content/${pageId}/child/page?limit=100&expand=body.storage`);
  const pages = data.results || [];
  const index = [];

  for (const page of pages) {
    const text = decodeHtml(page.body?.storage?.value || '');
    const filename = `${page.id}_${safeName(page.title)}.md`;
    const filePath = path.join(outputDir, filename);
    fs.writeFileSync(filePath, `# ${page.title}\n\n## Page ID: ${page.id}\n\n${text}\n`, 'utf8');
    index.push({ id: page.id, title: page.title, file: filePath });
  }

  fs.writeFileSync(path.join(outputDir, 'index.json'), JSON.stringify(index, null, 2), 'utf8');
  console.log(`Fetched child pages: ${pages.length}`);
  for (const page of index) console.log(`${page.id} ${page.title}`);
  console.log(`Output: ${outputDir}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
