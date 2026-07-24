#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const outputGate = require("../qa/output_gate"); // gate gen-testcase (RULE_GLOBAL §6: KQ khớp bước, cấm gộp range/chung chung)
const preflight = require("../qa/preflight_gate"); // G1: input/config bắt buộc đủ & parse được (miss-file/PARSE_FAILURE = CHẶN)

let ExcelJS;
try {
  ExcelJS = require("exceljs");
} catch {
  console.error("Missing dependency: exceljs. Run `npm install` at the repo root.");
  process.exit(1);
}

function stripEmoji(text) {
  return String(text || "").replace(/[\u{1F300}-\u{1FAFF}\u2700-\u27BF]/gu, "").trim();
}

function cleanCell(text) {
  return stripEmoji(String(text || "").replace(/<br\s*\/?>/gi, "\n").replace(/`([^`]*)`/g, "$1"));
}

function splitMarkdownRow(line) {
  return line
    .split(/(?<!\\)\|/)
    .slice(1, -1)
    .map((cell) => cell.replace(/\\\|/g, "|").trim());
}

function normalizeHeaderName(text) {
  return stripEmoji(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0111/g, "d")
    .replace(/\u0110/g, "D")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function isGroupHeader(header) {
  const name = normalizeHeaderName(header);
  return (
    name === "nhom chuc nang" ||
    name === "functional group" ||
    name === "test group" ||
    name === "group" ||
    name === "phan nhom"
  );
}

const FUNCTIONAL_GROUPS = [
  "Xem danh sách",
  "Xem chi tiết",
  "Tạo",
  "Sửa",
  "Xóa",
  "API",
  "E2E/Cross-app",
  "Permission/Security",
  "Import/Export",
  "Khác",
];

function groupFromModulePrefix(moduleValue) {
  const value = String(moduleValue || "");
  const explicitPrefix = value.split(" / ")[0]?.trim();
  if (explicitPrefix) return explicitPrefix;
  return FUNCTIONAL_GROUPS.find((group) => value.startsWith(`${group} / `)) || "";
}

function headerIndex(headers, matchers) {
  const normalized = headers.map(normalizeHeaderName);
  return normalized.findIndex((name) => matchers.some((matcher) => matcher(name)));
}

function inferFunctionalGroup(headers, row) {
  const moduleIndex = headerIndex(headers, [
    (name) => name === "module",
    (name) => name.includes("module"),
    (name) => name.includes("phan he"),
  ]);
  const scenarioIndex = headerIndex(headers, [
    (name) => name.includes("truong hop"),
    (name) => name.includes("scenario"),
    (name) => name.includes("test title"),
    (name) => name.includes("test case"),
  ]);

  const moduleValue = row[moduleIndex] || "";
  const prefixedGroup = groupFromModulePrefix(moduleValue);
  if (prefixedGroup) return prefixedGroup;

  const raw = [moduleValue, row[scenarioIndex] || ""].join(" ");
  const text = normalizeHeaderName(raw);

  if (/(^|[^a-z0-9])api([^a-z0-9]|$)/.test(text) || /\/api\/v\d+\//i.test(raw)) return "API";
  if (text.includes("cross app") || text.includes("cross-app") || text.includes("e2e") || text.includes("dong bo") || text.includes("sync")) {
    return "E2E/Cross-app";
  }
  if (text.includes("permission") || text.includes("security") || text.includes("authorization") || text.includes("unauthorized") || text.includes("forbidden") || text.includes("phan quyen")) {
    return "Permission/Security";
  }
  if (text.includes("us 05") || text.includes("delete") || text.includes("remove") || /\bxoa\b/.test(text)) return "Xóa";
  if (text.includes("us 04") || text.includes("edit") || text.includes("update") || /\bsua\b/.test(text) || text.includes("cap nhat") || text.includes("setting")) {
    return "Sửa";
  }
  if (text.includes("us 03") || text.includes("create") || /\btao\b/.test(text)) return "Tạo";
  if (text.includes("us 02") || text.includes("detail") || text.includes("chi tiet") || text.includes("overview") || text.includes("students tab")) {
    return "Xem chi tiết";
  }
  if (text.includes("us 01") || text.includes("list") || text.includes("danh sach") || text.includes("filter") || text.includes("sort") || text.includes("pagination")) {
    return "Xem danh sách";
  }

  return "Khác";
}

function sanitizeSheetName(name, usedNames) {
  const base = String(name || "Khác")
    .replace(/[\\/?*:[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 31) || "Khác";
  let candidate = base;
  let suffix = 2;
  while (usedNames.has(candidate)) {
    const marker = ` ${suffix}`;
    candidate = base.slice(0, 31 - marker.length) + marker;
    suffix += 1;
  }
  usedNames.add(candidate);
  return candidate;
}

function isTestCaseTableHeader(headers) {
  const normalized = headers.map(normalizeHeaderName);
  const hasId = normalized.some((name) => name === "id" || name === "tc id" || name.endsWith(" tc id"));
  const hasScenario = normalized.some((name) =>
    ["scenario", "test title", "test case", "truong hop kiem thu"].includes(name) ||
    name.includes("scenario") ||
    name.includes("steps") ||
    name.includes("expected") ||
    name.includes("ket qua") ||
    name.includes("truong hop"),
  );
  return hasId && hasScenario;
}

function isSetupContractHeader(headers) {
  const normalized = headers.map(normalizeHeaderName);
  const hasPreId = normalized.some((name) => name.includes("precondition id"));
  const hasStrategy = normalized.some((name) => name.includes("setup strategy"));
  return hasPreId && hasStrategy;
}

function getContractColumnWidth(header) {
  const name = normalizeHeaderName(header);
  if (name.includes("precondition id")) return 16;
  if (name.includes("mo ta") || name.includes("trang thai")) return 34;
  if (name.includes("precondition type") || name === "type") return 18;
  if (name.includes("setup strategy")) return 16;
  if (name.includes("setup source")) return 52;
  if (name.includes("verification")) return 42;
  if (name.includes("cleanup") || name.includes("rollback")) return 34;
  if (name.includes("readiness")) return 20;
  if (name.includes("linked")) return 28;
  return 24;
}

function getColumnWidth(header, index) {
  const name = normalizeHeaderName(header);
  if (isGroupHeader(header)) return 22;
  if (name === "id" || name === "tc id" || name.endsWith(" tc id")) return 18;
  if (name.includes("site") || name.includes("module")) return 20;
  if (name.includes("priority") || name.includes("uu tien") || name.includes("risk") || name.includes("rui ro")) return 14;
  if (name.includes("scenario") || name.includes("test title") || name.includes("test case") || name.includes("truong hop")) return 50;
  if (name.includes("precondition") || name.includes("pre condition") || name.includes("tien dieu kien")) return 42;
  if (name.includes("test data") || name.includes("du lieu")) return 42;
  if (name.includes("step") || name.includes("buoc")) return 62;
  if (name.includes("expected") || name.includes("ket qua")) return 62;
  return [18, 22, 14, 50, 42, 42, 62, 62, 14][index] || 24;
}

function estimateRowHeight(row, colWidths) {
  const maxLines = row.reduce((max, value, index) => {
    const width = colWidths[index] || 20;
    const text = String(value || "");
    const lines = text.split(/\n/).reduce((sum, line) => {
      return sum + Math.max(1, Math.ceil(line.length / Math.max(12, width)));
    }, 0);
    return Math.max(max, lines);
  }, 1);
  return Math.min(150, Math.max(24, maxLines * 15));
}

function parseTablesMatching(lines, predicate) {
  const tables = [];
  let currentTable = null;
  let expectingSeparator = false;

  for (const line of lines) {
    const stripped = line.trim();

    if (!currentTable && stripped.startsWith("|")) {
      const headers = splitMarkdownRow(stripped);
      if (predicate(headers)) {
        currentTable = { headers, rows: [] };
        expectingSeparator = true;
      }
      continue;
    }

    if (currentTable && expectingSeparator && /^\|[\s\-:|]+\|$/.test(stripped)) {
      expectingSeparator = false;
      continue;
    }

    if (currentTable && stripped.startsWith("|")) {
      const cells = splitMarkdownRow(stripped);
      if (cells.length > 0) currentTable.rows.push(cells);
      continue;
    }

    if (currentTable && currentTable.rows.length > 0) tables.push(currentTable);
    currentTable = null;
    expectingSeparator = false;
  }

  if (currentTable && currentTable.rows.length > 0) tables.push(currentTable);
  return tables;
}

function parseMdTables(filePath) {
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  return parseTablesMatching(lines, isTestCaseTableHeader);
}

function parseSetupContractTables(filePath) {
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  return parseTablesMatching(lines, isSetupContractHeader);
}

function columnIndexToName(index) {
  let name = "";
  let value = index + 1;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function styleWorksheet(worksheet, headers, rows, colWidths) {
  worksheet.columns.forEach((column, index) => {
    column.width = colWidths[index] || 24;
  });

  worksheet.autoFilter = {
    from: "A1",
    to: `${columnIndexToName(headers.length - 1)}${rows.length + 1}`,
  };

  worksheet.eachRow((row, rowNumber) => {
    row.height = rowNumber === 1 ? 24 : estimateRowHeight(row.values.slice(1), colWidths);
    row.eachCell((cell) => {
      cell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
      if (rowNumber === 1) cell.font = { bold: true };
    });
  });
}

function addTestcaseWorksheet(workbook, name, headers, rows, colWidths) {
  const worksheet = workbook.addWorksheet(name, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  worksheet.addRow(headers);
  for (const row of rows) worksheet.addRow(row);
  styleWorksheet(worksheet, headers, rows, colWidths);
  return worksheet;
}

function countBy(rows, index) {
  const counts = new Map();
  for (const row of rows) {
    const value = row[index] || "Khác";
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], "vi"));
}

function addSummaryWorksheet(workbook, headers, rows, preconditionCount = 0) {
  const worksheet = workbook.addWorksheet("Summary");
  const groupIndex = headers.findIndex(isGroupHeader);
  const priorityIndex = headerIndex(headers, [(name) => name.includes("priority") || name.includes("uu tien")]);
  const riskIndex = headerIndex(headers, [(name) => name.includes("risk") || name.includes("rui ro")]);

  worksheet.addRow(["Metric", "Value"]);
  worksheet.addRow(["Total test cases", rows.length]);
  if (preconditionCount > 0) worksheet.addRow(["Total preconditions", preconditionCount]);
  worksheet.addRow([]);

  if (groupIndex >= 0) {
    worksheet.addRow(["Nhóm chức năng", "Số TC"]);
    for (const [group, count] of countBy(rows, groupIndex)) worksheet.addRow([group, count]);
    worksheet.addRow([]);
  }

  if (priorityIndex >= 0) {
    worksheet.addRow(["Ưu tiên", "Số TC"]);
    for (const [priority, count] of countBy(rows, priorityIndex)) worksheet.addRow([priority, count]);
    worksheet.addRow([]);
  }

  if (riskIndex >= 0) {
    worksheet.addRow(["Mức độ rủi ro", "Số TC"]);
    for (const [risk, count] of countBy(rows, riskIndex)) worksheet.addRow([risk, count]);
  }

  worksheet.columns = [{ width: 28 }, { width: 16 }];
  worksheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
      if (rowNumber === 1 || row.getCell(1).value === "Nhóm chức năng" || row.getCell(1).value === "Ưu tiên" || row.getCell(1).value === "Mức độ rủi ro") {
        cell.font = { bold: true };
      }
    });
  });
  return worksheet;
}

function addContractWorksheet(workbook, contractTables) {
  const contractTable = contractTables && contractTables[0];
  if (!contractTable || !contractTable.rows.length) return;
  const cHeaders = contractTable.headers.map(cleanCell);
  const cWidths = cHeaders.map(getContractColumnWidth);
  const cRows = contractTable.rows.map((row) => cHeaders.map((_, i) => cleanCell(row[i] || "")));
  const usedNames = new Set(workbook.worksheets.map((sheet) => sheet.name));
  addTestcaseWorksheet(workbook, sanitizeSheetName("Preconditions", usedNames), cHeaders, cRows, cWidths);
}

async function buildXlsx(tables, contractTables, outputPath) {
  const fallbackHeaders = [
    "TC ID",
    "Module",
    "Risk Level",
    "Test Title",
    "Pre-Condition",
    "Test Steps",
    "Expected Result",
    "Priority",
    "Test Data",
  ];
  const sourceHeaders = tables[0]?.headers?.length ? tables[0].headers.map(cleanCell) : fallbackHeaders;
  const hasGroupColumn = sourceHeaders.some(isGroupHeader);
  const headers = hasGroupColumn ? sourceHeaders : ["Nhóm chức năng", ...sourceHeaders];
  const sourceColumnCount = sourceHeaders.length;
  const colWidths = headers.map(getColumnWidth);
  const rows = [];

  for (const table of tables) {
    for (const row of table.rows) {
      const cleaned = [];
      for (let index = 0; index < sourceColumnCount; index++) cleaned.push(cleanCell(row[index] || ""));
      rows.push(hasGroupColumn ? cleaned : [inferFunctionalGroup(sourceHeaders, cleaned), ...cleaned]);
    }
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "test-automation-kit";
  workbook.created = new Date();

  addSummaryWorksheet(workbook, headers, rows, (contractTables && contractTables[0] && contractTables[0].rows.length) || 0);
  addTestcaseWorksheet(workbook, "Test Cases", headers, rows, colWidths);

  const groupIndex = headers.findIndex(isGroupHeader);
  if (groupIndex >= 0) {
    const usedNames = new Set(workbook.worksheets.map((sheet) => sheet.name));
    const groupedRows = new Map();
    for (const row of rows) {
      const group = row[groupIndex] || "Khác";
      if (!groupedRows.has(group)) groupedRows.set(group, []);
      groupedRows.get(group).push(row);
    }
    for (const [group, groupRows] of [...groupedRows.entries()].sort((a, b) => a[0].localeCompare(b[0], "vi"))) {
      addTestcaseWorksheet(workbook, sanitizeSheetName(group, usedNames), headers, groupRows, colWidths);
    }
  }

  addContractWorksheet(workbook, contractTables);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  await workbook.xlsx.writeFile(outputPath);
  return rows.length;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.log("Usage: node scripts/convert_excel/md_to_xlsx.js <input.md> [output.xlsx]");
    process.exit(1);
  }

  const inputPath = path.resolve(args[0]);
  if (!fs.existsSync(inputPath)) {
    console.error(`File not found: ${inputPath}`);
    process.exit(1);
  }

  const outputPath = args[1] ? path.resolve(args[1]) : inputPath.replace(/\.md$/i, ".xlsx");
  const tables = parseMdTables(inputPath);
  if (tables.length === 0) {
    console.error("No testcase markdown table found.");
    process.exit(1);
  }

  // PREFLIGHT (G1): input/config bắt buộc phải đủ & parse được TRƯỚC khi convert (miss-file/PARSE_FAILURE = CHẶN).
  {
    const LENIENT = args.includes("--lenient") || process.env.QA_STRICT === "0";
    const QA_APPROVED = args.includes("--qa-approved");
    const pf = preflight.runPreflight({ mode: "phase1" });
    if (pf.warnings && pf.warnings.length) console.warn(`[preflight] ⚠ ${pf.warnings.join(" | ")}`);
    if (pf.problems && pf.problems.length) {
      const msg = `[preflight] ✗ ${pf.problems.length} input bắt buộc thiếu/hỏng:\n  - ${pf.problems.join("\n  - ")}\n→ Đọc/sửa input rồi convert lại.`;
      if (!LENIENT && !QA_APPROVED) { console.error(msg); process.exit(1); }
      console.warn(`${msg}\n  [bỏ qua] vẫn convert.`);
    }
  }

  // GATE gen-testcase: CHẶN convert nếu "Kết quả mong đợi" không khớp số bước / gộp range / chung chung.
  // `;`-packing chỉ cảnh báo (không chặn). Bỏ qua: --lenient / QA_STRICT=0 / --qa-approved.
  {
    const LENIENT = args.includes("--lenient") || process.env.QA_STRICT === "0";
    const QA_APPROVED = args.includes("--qa-approved");
    const parsed = outputGate.parseTestcaseTable(fs.readFileSync(inputPath, "utf8"));
    const problems = []; const warnings = [];
    for (const r of parsed.rows) { const g = outputGate.gateTestcaseRow(r); problems.push(...g.problems); warnings.push(...g.warnings); }
    if (warnings.length) console.warn(`[gate gen-testcase] ⚠ ${warnings.length} cảnh báo (nên tách ý ";" thành dòng "- "):\n  ~ ${warnings.slice(0, 15).join("\n  ~ ")}${warnings.length > 15 ? `\n  … +${warnings.length - 15} nữa` : ""}`);
    if (problems.length) {
      const msg = `[gate gen-testcase] ✗ ${problems.length} vi phạm CHẶN (RULE_GLOBAL + prompt 02 §6):\n  - ${problems.join("\n  - ")}\n→ Sửa "Kết quả mong đợi" cho khớp từng bước (mỗi bước 1 số) rồi convert lại.`;
      if (!LENIENT && !QA_APPROVED) { console.error(msg); process.exit(1); }
      console.warn(`${msg}\n  [${LENIENT ? "--lenient/QA_STRICT=0" : "--qa-approved"}] bỏ qua gate — vẫn convert.`);
    }
  }

  const contractTables = parseSetupContractTables(inputPath);
  const count = await buildXlsx(tables, contractTables, outputPath);
  console.log(`Exported ${count} test cases to ${outputPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
