'use strict';

/*
 * parseXlsx — adapter đọc .xlsx testcase → canonical TestCaseDoc (dùng cho consumer đọc xlsx:
 * publish_testcases/cleanup_xray). Tái dùng model.buildTestCase/buildSetup (cùng schema với parseMarkdown).
 * Cần ExcelJS (đã là dep). Bất đồng bộ (đọc file).
 */

const ExcelJS = require('exceljs');
const m = require('./model');

/** Trích text từ 1 cell ExcelJS (richText/hyperlink/formula/number/null). */
function cellText(cell) {
  const v = cell && cell.value;
  if (v == null) return '';
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('');
    if (v.text != null) return String(v.text);
    if (v.result != null) return String(v.result);
    return '';
  }
  return String(v);
}

/** Trong 1 worksheet, tìm dòng header (chứa cell 'TC ID') → { headerRow, headers[] }. */
function findHeader(ws, predicate) {
  let found = null;
  ws.eachRow((row, rn) => {
    if (found) return;
    const cells = [];
    row.eachCell({ includeEmpty: true }, (c) => cells.push(cellText(c).trim()));
    if (predicate(cells)) found = { headerRow: rn, headers: cells };
  });
  return found;
}

/**
 * Đọc .xlsx → TestCaseDoc. Ưu tiên sheet 'Test Cases'; fallback sheet đầu có header TC ID.
 * @param {string} filePath
 * @returns {Promise<import('./model').TestCaseDoc>}
 */
async function parseXlsx(filePath, opts = {}) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const warnings = [];

  // 1) sheet testcase
  const sheets = wb.worksheets;
  let tcSheet = wb.getWorksheet('Test Cases');
  let hdr = tcSheet ? findHeader(tcSheet, m.isTestCaseHeader) : null;
  if (!hdr) {
    for (const ws of sheets) { const h = findHeader(ws, m.isTestCaseHeader); if (h) { tcSheet = ws; hdr = h; break; } }
  }
  const tests = [];
  const groups = new Set();
  let headers = [];
  if (hdr) {
    headers = hdr.headers.filter((_, i, a) => !(i === a.length - 1 && a[i] === '')); // bỏ đuôi rỗng
    tcSheet.eachRow((row, rn) => {
      if (rn <= hdr.headerRow) return;
      const cells = headers.map((_, i) => cellText(row.getCell(i + 1)));
      const tcId = (cells[m.colIndex(headers, m.COL.tcId)] || '').trim();
      if (!tcId || m.normalizeHeader(tcId) === 'tc id') return;
      const tc = m.buildTestCase(headers, cells, opts.story || '');
      if (tc.group) groups.add(tc.group);
      tests.push(tc);
    });
  } else {
    warnings.push('Không thấy sheet/bảng testcase (header TC ID + Kết quả mong đợi) trong xlsx.');
  }

  // 2) setup contract (sheet 'Preconditions' nếu có)
  const setup = [];
  for (const ws of sheets) {
    const sh = findHeader(ws, m.isSetupContractHeader);
    if (!sh) continue;
    ws.eachRow((row, rn) => {
      if (rn <= sh.headerRow) return;
      const cells = sh.headers.map((_, i) => cellText(row.getCell(i + 1)));
      const s = m.buildSetup(sh.headers, cells);
      if (s.preId && !m.normalizeHeader(s.preId).includes('precondition id')) setup.push(s);
    });
    break;
  }

  return { source: 'xlsx', tests, setup, headers, groups: [...groups], warnings };
}

module.exports = { parseXlsx, cellText };
