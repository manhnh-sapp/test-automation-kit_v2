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

const CONFLUENCE_URL = (process.env.CONFLUENCE_URL || '').replace(/\/+$/, '');
const CONFLUENCE_USERNAME = process.env.CONFLUENCE_USERNAME || process.env.JIRA_EMAIL;
const CONFLUENCE_API_TOKEN = process.env.CONFLUENCE_API_TOKEN;
const PAGE_ID = process.env.CONFLUENCE_PAGE_ID;
const TASK_KEY = getTaskKey();
const PROJECT_OUTPUT_DIR = getProjectOutputDir();
const TASK_OUTPUT_DIR = getTaskOutputDir({ projectOutputDir: PROJECT_OUTPUT_DIR, taskKey: TASK_KEY });
const OUT_DIR = process.env.CONFLUENCE_OUTPUT_DIR
  ? path.resolve(process.env.CONFLUENCE_OUTPUT_DIR)
  : path.resolve(__dirname, '..', '..', '..', TASK_OUTPUT_DIR, 'requirements', 'confluence');

if (!CONFLUENCE_URL || !CONFLUENCE_USERNAME || !CONFLUENCE_API_TOKEN || !PAGE_ID) {
  console.error('ERROR: Missing CONFLUENCE_URL, CONFLUENCE_USERNAME, CONFLUENCE_API_TOKEN, or CONFLUENCE_PAGE_ID.');
  process.exit(1);
}

const confluence = new URL(CONFLUENCE_URL);
const basePath = confluence.pathname.replace(/\/+$/, '');
const auth = Buffer.from(`${CONFLUENCE_USERNAME}:${CONFLUENCE_API_TOKEN}`).toString('base64');

const options = {
  hostname: confluence.hostname,
  path: `${basePath}/rest/api/content/${PAGE_ID}?expand=body.storage`,
  headers: {
    Authorization: `Basic ${auth}`,
    Accept: 'application/json',
  },
};

function decodeHtmlEntities(value) {
  const named = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    mdash: '-',
    ndash: '-',
    agrave: 'à',
    aacute: 'á',
    acirc: 'â',
    atilde: 'ã',
    egrave: 'è',
    eacute: 'é',
    ecirc: 'ê',
    igrave: 'ì',
    iacute: 'í',
    ograve: 'ò',
    oacute: 'ó',
    ocirc: 'ô',
    otilde: 'õ',
    ugrave: 'ù',
    uacute: 'ú',
    yacute: 'ý',
    Agrave: 'À',
    Aacute: 'Á',
    Acirc: 'Â',
    Atilde: 'Ã',
    Egrave: 'È',
    Eacute: 'É',
    Ecirc: 'Ê',
    Igrave: 'Ì',
    Iacute: 'Í',
    Ograve: 'Ò',
    Oacute: 'Ó',
    Ocirc: 'Ô',
    Otilde: 'Õ',
    Ugrave: 'Ù',
    Uacute: 'Ú',
    Yacute: 'Ý',
  };

  return String(value || '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([A-Za-z]+);/g, (match, name) => named[name] || match);
}

let data = '';
const req = https.get(options, (res) => {
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    try {
      const payload = JSON.parse(data);
      const title = payload.title || 'No title';
      const bodyRaw = payload.body?.storage?.value || '';
      const bodyText = decodeHtmlEntities(bodyRaw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
      const output = `# ${title}\n\n## Page ID: ${PAGE_ID}\n\n${bodyText}`;

      if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
      const outFile = path.join(OUT_DIR, `confluence_${PAGE_ID}.md`);
      fs.writeFileSync(outFile, output, 'utf8');

      console.log('TITLE:', title);
      console.log('SAVED:', outFile);
      console.log('PREVIEW:', bodyText.substring(0, 500));
    } catch (error) {
      console.error('Parse error:', error.message);
      console.error('Raw response:', data.substring(0, 500));
      process.exit(1);
    }
  });
});

req.on('error', (error) => {
  console.error('Request error:', error.message);
  process.exit(1);
});
