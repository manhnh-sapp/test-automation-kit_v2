const fs = require('fs');
const FormData = require('form-data');
const https = require('https');
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
const SOURCE_MD = process.env.CONFLUENCE_SOURCE_MD || 'USER_GUIDE.md';
const PAGE_TITLE = process.env.CONFLUENCE_PAGE_TITLE;
const CONFLUENCE_IMAGE_WIDTH = process.env.CONFLUENCE_IMAGE_WIDTH || '760';
const PRESERVE_EXISTING_IMAGES = process.env.CONFLUENCE_PRESERVE_EXISTING_IMAGES !== '0';
const PRESERVED_IMAGES_HEADING = process.env.CONFLUENCE_PRESERVED_IMAGES_HEADING || 'Hình ảnh hiện có';
function getDefaultBackupDir() {
  const projectOutputDir = getProjectOutputDir();
  const taskKey = getTaskKey();
  const taskOutputDir = getTaskOutputDir({ projectOutputDir, taskKey });
  return path.resolve(taskOutputDir, 'reports', 'confluence-publish');
}
const BACKUP_DIR = process.env.CONFLUENCE_BACKUP_DIR
  ? path.resolve(process.env.CONFLUENCE_BACKUP_DIR)
  : getDefaultBackupDir();
const DRY_RUN = process.argv.includes('--dry-run') || process.env.CONFLUENCE_DRY_RUN === '1';

if (!CONFLUENCE_URL || !CONFLUENCE_USERNAME || !CONFLUENCE_API_TOKEN || !PAGE_ID) {
  console.error('ERROR: Missing CONFLUENCE_URL, CONFLUENCE_USERNAME, CONFLUENCE_API_TOKEN, or CONFLUENCE_PAGE_ID.');
  process.exit(1);
}

if (!fs.existsSync(SOURCE_MD)) {
  console.error(`ERROR: Source Markdown not found: ${SOURCE_MD}`);
  process.exit(1);
}

const confluence = new URL(CONFLUENCE_URL);
const basePath = confluence.pathname.replace(/\/+$/, '');
const auth = Buffer.from(`${CONFLUENCE_USERNAME}:${CONFLUENCE_API_TOKEN}`).toString('base64');

function requestJson(method, apiPath, payload) {
  return new Promise((resolve, reject) => {
    const data = payload ? JSON.stringify(payload) : '';
    const req = https.request(
      {
        hostname: confluence.hostname,
        method,
        path: `${basePath}${apiPath}`,
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          let parsed;
          try {
            parsed = body ? JSON.parse(body) : {};
          } catch (error) {
            reject(new Error(`Invalid JSON response (${res.statusCode}): ${body.substring(0, 500)}`));
            return;
          }

          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`Confluence API ${method} ${apiPath} failed (${res.statusCode}): ${body.substring(0, 1000)}`));
            return;
          }

          resolve(parsed);
        });
      }
    );

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function requestForm(method, apiPath, form) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: confluence.hostname,
        method,
        path: `${basePath}${apiPath}`,
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: 'application/json',
          'X-Atlassian-Token': 'no-check',
          ...form.getHeaders(),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          let parsed;
          try {
            parsed = body ? JSON.parse(body) : {};
          } catch (error) {
            reject(new Error(`Invalid JSON response (${res.statusCode}): ${body.substring(0, 500)}`));
            return;
          }

          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`Confluence form API ${method} ${apiPath} failed (${res.statusCode}): ${body.substring(0, 1000)}`));
            return;
          }

          resolve(parsed);
        });
      }
    );

    req.on('error', reject);
    form.pipe(req);
  });
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeInline(text) {
  return String(text || '');
}

function cdata(value) {
  return String(value || '').replace(/\]\]>/g, ']]]]><![CDATA[>');
}

function anchorSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[`*_~]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function confluenceAnchorMacro(anchor) {
  return `<ac:structured-macro ac:name="anchor" ac:schema-version="1"><ac:parameter ac:name="">${escapeHtml(anchor)}</ac:parameter></ac:structured-macro>`;
}

function inlineHtml(text) {
  const source = normalizeInline(text);
  const chunks = [];
  const pattern = /(\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let match;

  while ((match = pattern.exec(source))) {
    if (match.index > last) chunks.push(escapeHtml(source.slice(last, match.index)));
    const token = match[0];
    if (token.startsWith('[')) {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (!link) {
        chunks.push(escapeHtml(token));
      } else {
        const label = link[1];
        const href = link[2];
        if (href.startsWith('#')) {
          chunks.push(`<ac:link ac:anchor="${escapeHtml(href.slice(1))}"><ac:plain-text-link-body><![CDATA[${cdata(label)}]]></ac:plain-text-link-body></ac:link>`);
        } else {
          chunks.push(`${escapeHtml(label)} (${escapeHtml(href)})`);
        }
      }
    } else if (token.startsWith('`')) {
      chunks.push(`<code>${escapeHtml(token.slice(1, -1))}</code>`);
    } else if (token.startsWith('**')) {
      chunks.push(`<strong>${escapeHtml(token.slice(2, -2))}</strong>`);
    } else if (token.startsWith('*')) {
      chunks.push(`<em>${escapeHtml(token.slice(1, -1))}</em>`);
    }
    last = match.index + token.length;
  }

  if (last < source.length) chunks.push(escapeHtml(source.slice(last)));
  return chunks.join('');
}

function splitMarkdownRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function isTableSeparator(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function tableHtml(rows) {
  const trs = rows
    .map((cells, rowIndex) => {
      const tag = rowIndex === 0 ? 'th' : 'td';
      return `<tr>${cells.map((cell) => `<${tag}>${inlineHtml(cell)}</${tag}>`).join('')}</tr>`;
    })
    .join('\n');
  return `<table><tbody>${trs}</tbody></table>`;
}

function markdownToConfluenceStorage(markdown, context) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let inCode = false;
  let codeLines = [];
  let listType = null;
  let listItems = [];

  function flushList() {
    if (!listType) return;
    blocks.push(`<${listType}>${listItems.map((item) => `<li>${inlineHtml(item)}</li>`).join('')}</${listType}>`);
    listType = null;
    listItems = [];
  }

  function flushCode() {
    if (!codeLines.length) return;
    blocks.push(`<pre>${escapeHtml(codeLines.join('\n'))}</pre>`);
    codeLines = [];
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();

    if (/^```/.test(trimmed)) {
      if (inCode) {
        flushCode();
        inCode = false;
      } else {
        flushList();
        inCode = true;
        codeLines = [];
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (!trimmed) {
      flushList();
      continue;
    }

    const image = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/.exec(trimmed);
    if (image) {
      flushList();
      const attachmentPath = path.resolve(context.baseDir, image[2]);
      const filename = path.basename(image[2]);
      context.attachments.set(filename, attachmentPath);
      blocks.push(`<p><ac:image ac:alt="${escapeHtml(image[1] || filename)}" ac:width="${escapeHtml(CONFLUENCE_IMAGE_WIDTH)}"><ri:attachment ri:filename="${escapeHtml(filename)}" /></ac:image></p>`);
      continue;
    }

    if (/^\|/.test(trimmed) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      flushList();
      const rows = [splitMarkdownRow(trimmed)];
      i += 2;
      while (i < lines.length && /^\|/.test(lines[i].trim())) {
        rows.push(splitMarkdownRow(lines[i]));
        i += 1;
      }
      i -= 1;
      blocks.push(tableHtml(rows));
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(trimmed);
    if (heading) {
      flushList();
      const level = Math.min(heading[1].length, 6);
      const headingText = heading[2].trim();
      const anchor = anchorSlug(headingText);
      if (anchor) blocks.push(confluenceAnchorMacro(anchor));
      blocks.push(`<h${level}>${inlineHtml(headingText)}</h${level}>`);
      continue;
    }

    const quote = /^>\s*(.+)$/.exec(trimmed);
    if (quote) {
      flushList();
      blocks.push(`<blockquote><p>${inlineHtml(quote[1])}</p></blockquote>`);
      continue;
    }

    const bullet = /^[-*]\s+(.+)$/.exec(trimmed);
    if (bullet) {
      if (listType !== 'ul') flushList();
      listType = 'ul';
      listItems.push(bullet[1]);
      continue;
    }

    const numbered = /^\d+\.\s+(.+)$/.exec(trimmed);
    if (numbered) {
      if (listType !== 'ol') flushList();
      listType = 'ol';
      listItems.push(numbered[1]);
      continue;
    }

    flushList();
    blocks.push(`<p>${inlineHtml(trimmed)}</p>`);
  }

  flushList();
  if (inCode) flushCode();
  return blocks.join('\n');
}

function pageTitleFromMarkdown(markdown) {
  const title = markdown.split(/\r?\n/).find((line) => line.startsWith('# '));
  return title ? title.replace(/^#\s+/, '').trim() : 'User Guide';
}

function stripHtml(value) {
  return String(value || '').replace(/<[^>]+>/g, ' ');
}

function decodeBasicHtmlEntities(value) {
  const entityBase = {
    amp: 'and',
    lt: ' ',
    gt: ' ',
    quot: ' ',
    apos: ' ',
    nbsp: ' ',
    aacute: 'a',
    agrave: 'a',
    acirc: 'a',
    atilde: 'a',
    eacute: 'e',
    egrave: 'e',
    ecirc: 'e',
    iacute: 'i',
    igrave: 'i',
    oacute: 'o',
    ograve: 'o',
    ocirc: 'o',
    otilde: 'o',
    uacute: 'u',
    ugrave: 'u',
    yacute: 'y',
    ccedil: 'c',
    ntilde: 'n',
  };

  return String(value || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(parseInt(decimal, 10)))
    .replace(/&([a-z]+);/gi, (_, entity) => entityBase[entity.toLowerCase()] || ' ');
}

function normalizeHeadingText(value) {
  return decodeBasicHtmlEntities(stripHtml(value))
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function extractHeadings(storage) {
  const headings = [];
  const pattern = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/g;
  let match;

  while ((match = pattern.exec(storage || ''))) {
    headings.push({
      level: Number(match[1]),
      rawText: match[2],
      normalizedText: normalizeHeadingText(match[2]),
      start: match.index,
      end: pattern.lastIndex,
    });
  }

  return headings;
}

function extractImageEntries(storage) {
  const entries = [];
  const seen = new Set();
  const pattern = /(?:<p[^>]*>\s*)?<ac:image\b[\s\S]*?<\/ac:image>(?:\s*<\/p>)?/g;
  const headings = extractHeadings(storage);
  let match;

  while ((match = pattern.exec(storage || ''))) {
    const block = match[0].trim();
    if (!block || seen.has(block)) continue;
    seen.add(block);
    const previousHeading = [...headings].reverse().find((heading) => heading.end <= match.index);

    entries.push({
      block,
      filename: imageBlockFilename(block),
      key: imageBlockKey(block),
      previousHeading: previousHeading?.rawText || '',
      previousHeadingNormalized: previousHeading?.normalizedText || '',
    });
  }

  return entries;
}

function extractImageBlocks(storage) {
  return extractImageEntries(storage).map((entry) => entry.block);
}

function imageBlockFilename(block) {
  const attachment = /<ri:attachment\b[^>]*\bri:filename="([^"]+)"/.exec(block);
  return attachment?.[1] || '';
}

function imageBlockKey(block) {
  const filename = imageBlockFilename(block);
  if (filename) return `attachment:${filename}`;

  const url = /<ri:url\b[^>]*\bri:value="([^"]+)"/.exec(block);
  if (url) return `url:${url[1]}`;

  return `block:${block}`;
}

function inferredHeadingForImage(filename) {
  const targets = {
    'main-flow.png': '1.2 Main Flow của kit',
    'qa-environment.png': '3.1 Bộ công cụ cần cài',
    'output-structure.png': '4.2 Output của từng story/task',
    'phase1-quality-gate.png': '5.3 Review sau Phase 1',
    'phase2-execution-loop.png': '5.5 Phase 2 - Execute automation',
    'jira-bug-evidence.png': '5.7 Log Jira bug',
    'partial-rerun-flow.png': '6.2 Các bước của Partial Rerun',
    'phase-selection.png': '9. Prompt và command thường dùng',
  };

  return targets[filename] || '';
}

function appendPreservedImageBlocks(storage, currentStorage) {
  if (!PRESERVE_EXISTING_IMAGES) {
    return { storage, preservedImages: [] };
  }

  const currentImages = extractImageEntries(currentStorage);
  if (!currentImages.length) {
    return { storage, preservedImages: [] };
  }

  const generatedImageKeys = new Set(extractImageEntries(storage).map((entry) => entry.key));
  const preservedImages = currentImages.filter((entry) => !generatedImageKeys.has(entry.key));
  if (!preservedImages.length) {
    return { storage, preservedImages: [] };
  }

  const generatedHeadings = extractHeadings(storage);
  const insertions = new Map();
  const appended = [];

  for (const image of preservedImages) {
    const inferredHeading = inferredHeadingForImage(image.filename);
    const targetHeading = inferredHeading
      ? normalizeHeadingText(inferredHeading)
      : image.previousHeadingNormalized;
    const heading = generatedHeadings.find((item) => item.normalizedText === targetHeading);

    if (!heading) {
      appended.push(image.block);
      continue;
    }

    if (!insertions.has(heading.end)) insertions.set(heading.end, []);
    insertions.get(heading.end).push(image.block);
  }

  let finalStorage = storage;
  const sortedInsertions = Array.from(insertions.entries()).sort((a, b) => b[0] - a[0]);
  for (const [index, blocks] of sortedInsertions) {
    finalStorage = `${finalStorage.slice(0, index)}\n${blocks.join('\n')}${finalStorage.slice(index)}`;
  }

  if (appended.length) {
    finalStorage = [
      finalStorage,
      `<h2>${inlineHtml(PRESERVED_IMAGES_HEADING)}</h2>`,
      ...appended,
    ].join('\n');
  }

  return { storage: finalStorage, preservedImages: preservedImages.map((entry) => entry.block) };
}

async function uploadAttachment(pageId, filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn(`WARN: Attachment file not found: ${filePath}`);
    return false;
  }

  const filename = path.basename(filePath);
  const lookup = await requestJson(
    'GET',
    `/rest/api/content/${pageId}/child/attachment?filename=${encodeURIComponent(filename)}&expand=version`
  );
  const existing = lookup.results?.[0];
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath), {
    filename,
    contentType: 'image/png',
  });

  if (existing?.id) {
    await requestForm('POST', `/rest/api/content/${pageId}/child/attachment/${existing.id}/data`, form);
    return true;
  }

  await requestForm('POST', `/rest/api/content/${pageId}/child/attachment`, form);
  return true;
}

async function main() {
  const markdown = fs.readFileSync(SOURCE_MD, 'utf8');
  const generatedTitle = PAGE_TITLE || pageTitleFromMarkdown(markdown);
  const context = {
    baseDir: path.dirname(path.resolve(SOURCE_MD)),
    attachments: new Map(),
  };
  let storage = markdownToConfluenceStorage(markdown, context);

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.writeFileSync(path.join(BACKUP_DIR, `page-${PAGE_ID}-generated-storage.html`), storage, 'utf8');

  let current;
  let targetStatus = 'current';
  try {
    current = await requestJson(
      'GET',
      `/rest/api/content/${PAGE_ID}?expand=version,space,body.storage`
    );
  } catch (error) {
    if (!String(error.message || '').includes('status [current, archived]')) {
      throw error;
    }
    current = await requestJson(
      'GET',
      `/rest/api/content/${PAGE_ID}?status=draft&expand=version,space,body.storage`
    );
    targetStatus = 'draft';
  }

  fs.writeFileSync(
    path.join(BACKUP_DIR, `page-${PAGE_ID}-before.json`),
    JSON.stringify(current, null, 2),
    'utf8'
  );
  fs.writeFileSync(
    path.join(BACKUP_DIR, `page-${PAGE_ID}-before-storage.html`),
    current.body?.storage?.value || '',
    'utf8'
  );

  const preserveResult = appendPreservedImageBlocks(storage, current.body?.storage?.value || '');
  storage = preserveResult.storage;
  fs.writeFileSync(path.join(BACKUP_DIR, `page-${PAGE_ID}-final-storage.html`), storage, 'utf8');
  if (preserveResult.preservedImages.length) {
    fs.writeFileSync(
      path.join(BACKUP_DIR, `page-${PAGE_ID}-preserved-images.html`),
      preserveResult.preservedImages.join('\n'),
      'utf8'
    );
  }

  const currentTitle = String(current.title || '').trim();
  const title = currentTitle && currentTitle !== 'No title' ? currentTitle : generatedTitle;
  const currentVersionNumber = Number(current.version?.number || 1);
  const versionNumber = targetStatus === 'draft' ? currentVersionNumber : currentVersionNumber + 1;

  const payload = {
    id: String(PAGE_ID),
    type: current.type || 'page',
    status: targetStatus,
    title,
    version: {
      number: versionNumber,
      message: `Publish ${path.basename(SOURCE_MD)} from Test Automation Kit`,
    },
    body: {
      storage: {
        value: storage,
        representation: 'storage',
      },
    },
  };

  if (current.space?.key) {
    payload.space = { key: current.space.key };
  }

  fs.writeFileSync(
    path.join(BACKUP_DIR, `page-${PAGE_ID}-payload-preview.json`),
    JSON.stringify({ ...payload, body: { storage: { value: `[${storage.length} chars]`, representation: 'storage' } } }, null, 2),
    'utf8'
  );

  if (DRY_RUN) {
    console.log('DRY_RUN: generated Confluence storage and backup only.');
    console.log('PAGE_ID:', PAGE_ID);
    console.log('TITLE:', title);
    console.log('CURRENT_VERSION:', current.version?.number || 'unknown');
    console.log('NEXT_VERSION:', versionNumber);
    console.log('BACKUP_DIR:', BACKUP_DIR);
    console.log('ATTACHMENTS:', Array.from(context.attachments.keys()).join(', ') || 'N/A');
    console.log('PRESERVED_EXISTING_IMAGES:', preserveResult.preservedImages.length);
    return;
  }

  for (const [filename, filePath] of context.attachments.entries()) {
    const uploaded = await uploadAttachment(PAGE_ID, filePath);
    console.log(`ATTACHMENT ${filename}: ${uploaded ? 'OK' : 'WARN'}`);
  }

  const updatePath = targetStatus === 'draft'
    ? `/rest/api/content/${PAGE_ID}?status=draft`
    : `/rest/api/content/${PAGE_ID}`;
  const updated = await requestJson('PUT', updatePath, payload);
  fs.writeFileSync(
    path.join(BACKUP_DIR, `page-${PAGE_ID}-after.json`),
    JSON.stringify(updated, null, 2),
    'utf8'
  );

  console.log('UPDATED:', updated._links?.webui || `/wiki/spaces/${current.space?.key || ''}/pages/${PAGE_ID}`);
  console.log('PAGE_ID:', PAGE_ID);
  console.log('TITLE:', title);
  console.log('STATUS:', targetStatus);
  console.log('VERSION:', updated.version?.number || versionNumber);
  console.log('BACKUP_DIR:', BACKUP_DIR);
  console.log('PRESERVED_EXISTING_IMAGES:', preserveResult.preservedImages.length);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
