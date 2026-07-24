'use strict';

/*
 * parseMarkdown — parser Markdown DUY NHẤT cho testcase (thay parseMdTables/parseTestcaseTable/
 * parseFullTable...). Quét bảng testcase 9-cột + bảng Setup Strategy contract → TestCaseDoc.
 * Logic quét bảng đồng bộ md_to_xlsx.parseTablesMatching để PARITY.
 */

const fs = require('fs');
const m = require('./model');

/** Quét mọi bảng markdown khớp predicate(headers) → [{headers, rows:[cells[]]}]. */
function parseTablesMatching(lines, predicate) {
  const tables = [];
  let cur = null;
  let expectSep = false;
  for (const line of lines) {
    const s = line.trim();
    if (!cur && s.startsWith('|')) {
      const headers = m.splitMarkdownRow(s);
      if (predicate(headers)) { cur = { headers, rows: [] }; expectSep = true; }
      continue;
    }
    if (cur && expectSep && /^\|[\s\-:|]+\|$/.test(s)) { expectSep = false; continue; }
    if (cur && s.startsWith('|')) { const cells = m.splitMarkdownRow(s); if (cells.length) cur.rows.push(cells); continue; }
    if (cur && cur.rows.length) tables.push(cur);
    cur = null; expectSep = false;
  }
  if (cur && cur.rows.length) tables.push(cur);
  return tables;
}

/**
 * Parse Markdown (chuỗi hoặc đường dẫn file) → TestCaseDoc.
 * @param {string} mdOrPath nội dung markdown, hoặc đường dẫn .md (tự đọc file).
 * @param {{ story?: string }} [opts] story/task key để gắn traceability.
 * @returns {import('./model').TestCaseDoc}
 */
function parseMarkdown(mdOrPath, opts = {}) {
  const md = (typeof mdOrPath === 'string' && mdOrPath.includes('\n')) || !fs.existsSync(mdOrPath)
    ? String(mdOrPath) : fs.readFileSync(mdOrPath, 'utf8');
  const lines = md.split(/\r?\n/);
  const warnings = [];

  const tcTables = parseTablesMatching(lines, m.isTestCaseHeader);
  const setupTables = parseTablesMatching(lines, m.isSetupContractHeader);

  const tests = [];
  let headers = [];
  const groups = new Set();
  for (const t of tcTables) {
    headers = t.headers;
    for (const cells of t.rows) {
      const tcId = (cells[m.colIndex(headers, m.COL.tcId)] || '').trim();
      // bỏ dòng rỗng / dòng lặp lại header
      if (!tcId || m.normalizeHeader(tcId) === 'tc id' || m.normalizeHeader(tcId) === 'id') continue;
      const tc = m.buildTestCase(headers, cells, opts.story || '');
      if (tc.group) groups.add(tc.group);
      tests.push(tc);
    }
  }
  const setup = [];
  for (const t of setupTables) {
    for (const cells of t.rows) {
      const s = m.buildSetup(t.headers, cells);
      if (!s.preId || m.normalizeHeader(s.preId).includes('precondition id')) continue;
      setup.push(s);
    }
  }
  if (!tests.length) warnings.push('Không thấy bảng testcase 9-cột (TC ID + Trường hợp/Bước/KQ mong đợi).');

  return { source: 'md', tests, setup, headers, groups: [...groups], warnings };
}

module.exports = { parseMarkdown, parseTablesMatching };
