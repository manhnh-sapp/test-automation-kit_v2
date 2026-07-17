#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const {
  loadEnv,
  validateEnvVars,
  buildSheetsClient,
  objectsToRows,
  readJsonFile,
  log,
  handleApiError,
} = require('./utils');

let SPREADSHEET_ID = '';

function initEnv() {
  loadEnv();
  validateEnvVars(['GOOGLE_SPREADSHEET_ID']);
  SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;
}

async function ensureSheetExists(sheetName) {
  const sheets = await buildSheetsClient();
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: 'sheets.properties.title',
  });

  const exists = (meta.data.sheets || []).some((sheet) => sheet.properties?.title === sheetName);
  if (exists) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [{ addSheet: { properties: { title: sheetName } } }],
    },
  });
}

async function clearRange(sheetName, range = 'A2:Z10000') {
  const sheets = await buildSheetsClient();
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!${range}`,
  });
}

async function writeRange(sheetName, startCell, rows) {
  const sheets = await buildSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!${startCell}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows },
  });
}

async function appendRows(sheetName, rows) {
  const sheets = await buildSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

async function writeHeaders(sheetName, headers) {
  await writeRange(sheetName, 'A1', [headers]);
}

function normalizeStatus(status) {
  const value = String(status || '').toLowerCase();
  if (['passed', 'pass', 'ok'].includes(value)) return 'PASS';
  if (['failed', 'timedout', 'timedOut', 'interrupted', 'fail'].includes(status) || ['failed', 'timedout', 'interrupted', 'fail'].includes(value)) return 'FAIL';
  if (['skipped', 'skip'].includes(value)) return 'SKIP';
  return String(status || '').toUpperCase();
}

function errorToText(errors = [], error = null) {
  const messages = [];
  if (error?.message) messages.push(error.message);
  for (const item of errors || []) {
    if (item?.message) messages.push(item.message);
  }
  return messages.join('\n').slice(0, 2000);
}

function flattenPlaywrightReport(report) {
  const rows = [];

  function walkSuite(suite, parents = []) {
    const suitePath = [...parents, suite.title].filter(Boolean);

    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        const results = test.results?.length ? test.results : [{ status: test.status }];
        const lastResult = results[results.length - 1] || {};
        rows.push({
          id: test.testId || test.id || spec.id || '',
          title: spec.title || test.title || '',
          status: normalizeStatus(lastResult.status || test.status),
          duration: lastResult.duration || '',
          error: errorToText(lastResult.errors, lastResult.error),
          suite: suitePath.join(' > '),
          file: spec.file || suite.file || '',
          runAt: new Date().toISOString(),
          retries: Math.max(0, results.length - 1),
          annotations: (test.annotations || spec.annotations || []).map((item) => `${item.type || ''}:${item.description || ''}`).join('; '),
        });
      }
    }

    for (const child of suite.suites || []) walkSuite(child, suitePath);
  }

  for (const suite of report.suites || []) walkSuite(suite);
  return rows;
}

function convertPlaywrightReport(report) {
  const rows = flattenPlaywrightReport(report);
  const headers = ['Test ID', 'Title', 'Status', 'Duration (ms)', 'Error', 'Suite', 'File', 'Run At', 'Retries', 'Annotations'];
  const values = rows.map((row) => [
    row.id,
    row.title,
    row.status,
    row.duration,
    row.error,
    row.suite,
    row.file,
    row.runAt,
    row.retries,
    row.annotations,
  ]);
  return { headers, rows: values };
}

async function importPlaywrightResults(reportPath, sheetName = 'Test Results', options = {}) {
  const report = readJsonFile(reportPath);
  if (!report) process.exit(1);

  const { headers, rows } = convertPlaywrightReport(report);
  await ensureSheetExists(sheetName);

  if (options.clearFirst) {
    await writeRange(sheetName, 'A1', [headers, ...rows]);
  } else {
    await writeHeaders(sheetName, headers);
    if (rows.length > 0) await appendRows(sheetName, rows);
  }

  log('LOG', `Imported ${rows.length} Playwright result row(s) to "${sheetName}".`);
}

function excelCellToString(cell) {
  const value = cell && cell.value !== undefined ? cell.value : cell;
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'object') return String(value);
  if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || '').join('');
  if (value.text !== undefined) return String(value.text || '');
  if (value.result !== undefined) return String(value.result || '');
  if (value.hyperlink && value.text) return String(value.text);
  return String(value);
}

async function importExcel(excelPath, sheetName, options = {}) {
  const { sheetIndex = 0, clearFirst = true, newlineReplacement = ' | ' } = options;

  let ExcelJS;
  try {
    ExcelJS = require('exceljs');
  } catch {
    log('ERROR', 'Missing dependency: exceljs. Run `npm install` at the repo root.');
    process.exit(1);
  }

  if (!fs.existsSync(excelPath)) {
    log('ERROR', `File not found: ${excelPath}`);
    process.exit(1);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(excelPath);
  if (sheetIndex >= workbook.worksheets.length) {
    log('ERROR', `Excel file has only ${workbook.worksheets.length} sheet(s).`);
    process.exit(1);
  }

  const worksheet = workbook.worksheets[sheetIndex];
  const rows = [];
  worksheet.eachRow({ includeEmpty: true }, (row) => {
    rows.push(row.values.slice(1).map((cell) => excelCellToString(cell).replace(/\r\n|\r|\n/g, newlineReplacement)));
  });

  await ensureSheetExists(sheetName);
  if (clearFirst) await writeRange(sheetName, 'A1', rows);
  else await appendRows(sheetName, rows);

  log('LOG', `Imported ${rows.length} Excel row(s) from "${worksheet.name}" to "${sheetName}".`);
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      index++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function printUsage() {
  console.log(`
Google Sheets Writer

Usage:
  node scripts/integrations/google_sheet/sheet_writer.js --results <results.json> [--sheet "Results"] [--clear-first]
  node scripts/integrations/google_sheet/sheet_writer.js --excel <file.xlsx> --sheet "TC_UI" [--sheet-index 0] [--no-clear]
  node scripts/integrations/google_sheet/sheet_writer.js --append <SHEET> --data '[{"Name":"John"}]'
  node scripts/integrations/google_sheet/sheet_writer.js --clear <SHEET> [--range A2:Z1000]
  node scripts/integrations/google_sheet/sheet_writer.js --create <SHEET>
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || Object.keys(args).length === 0) {
    printUsage();
    return;
  }

  initEnv();

  if (args.results) {
    await importPlaywrightResults(path.resolve(process.cwd(), args.results), args.sheet || 'Test Results', {
      clearFirst: !!args['clear-first'],
    });
    return;
  }

  if (args.excel) {
    if (!args.sheet || args.sheet === true) {
      log('ERROR', '--sheet is required with --excel.');
      process.exit(1);
    }
    await importExcel(path.resolve(process.cwd(), args.excel), args.sheet, {
      sheetIndex: Number(args['sheet-index'] || 0),
      clearFirst: !args['no-clear'],
    });
    return;
  }

  if (args.append && args.data) {
    const data = JSON.parse(args.data);
    if (!Array.isArray(data)) {
      log('ERROR', '--data must be a JSON array.');
      process.exit(1);
    }
    await ensureSheetExists(args.append);
    const { headers, rows } = objectsToRows(data);
    await appendRows(args.append, [headers, ...rows]);
    return;
  }

  if (args.clear) {
    await clearRange(args.clear, args.range || 'A2:Z10000');
    return;
  }

  if (args.create) {
    await ensureSheetExists(args.create);
    return;
  }

  printUsage();
}

module.exports = {
  ensureSheetExists,
  clearRange,
  appendRows,
  writeHeaders,
  writeRange,
  importPlaywrightResults,
  convertPlaywrightReport,
  importExcel,
};

if (require.main === module) {
  main().catch((error) => {
    handleApiError(error, 'Google Sheet Writer');
    process.exit(1);
  });
}
