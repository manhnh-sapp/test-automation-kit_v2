# Google Sheets Integration

> Scripts for reading testcase/test data from Google Sheets or writing execution results back to Google Sheets.

## Purpose

Google Sheets integration hỗ trợ project cần sync testcase/test data hoặc publish execution result cho stakeholder ngoài repo.

## When To Use

| Scenario | Use This Integration |
|---|---|
| Đọc testcase/test data từ sheet | ✅ |
| Ghi execution result lên sheet | ✅ |
| Thay thế source Markdown chính của kit | ❌ |

## Inputs

| Input | Required | Notes |
|---|---|---|
| `GOOGLE_SPREADSHEET_ID` | Yes | Spreadsheet cần đọc/ghi. |
| `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` | For write | Service account JSON path, không commit file này. |
| `GOOGLE_API_KEY` | For read-only | Chỉ dùng cho sheet public/allowed read-only. |
| `PROJECT_OUTPUT_DIR` | Yes | Output root của project. |
| `TASK_KEY` | Yes | Scope folder của task. |

## Outputs

| Output | Location |
|---|---|
| Sheet artifacts | `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/requirements/google_sheet/` |
| Updated Google Sheet | Sheet/range được chỉ định bằng CLI args. |

## Setup

| Step | Command/Action |
|---:|---|
| 1 | `npm install` |
| 2 | Copy `scripts/integrations/google_sheet/.env.example` to `.env.local` or `.env`. |
| 3 | Fill credentials in local env or CI secret store. |

## Environment

```env
GOOGLE_SPREADSHEET_ID=<SPREADSHEET_ID>
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=<PATH_TO_SERVICE_ACCOUNT_JSON>
GOOGLE_API_KEY=<READ_ONLY_API_KEY>
PROJECT_OUTPUT_DIR=outputs/<YOUR_PROJECT>
TASK_KEY=<TASK_KEY>
```

## Workflow

| Step | Action |
|---:|---|
| 1 | Verify env keys. |
| 2 | Read sheet list, specific sheet, or range. |
| 3 | Save requirement/test data artifact under task output. |
| 4 | Optionally write execution results or Excel content back to sheet. |

## Examples

| Task | Command |
|---|---|
| List sheets | `node scripts/integrations/google_sheet/sheet_reader.js --list` |
| Read sheet as Markdown | `node scripts/integrations/google_sheet/sheet_reader.js --sheet "<SHEET_NAME>" --format md` |
| Read range as JSON | `node scripts/integrations/google_sheet/sheet_reader.js --sheet "<SHEET_NAME>" --range "A1:Z100" --format json` |
| Write Playwright results | `node scripts/integrations/google_sheet/sheet_writer.js --results <PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/test-results/results.json --sheet "Results"` |
| Write Excel testcase | `node scripts/integrations/google_sheet/sheet_writer.js --excel <PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/test-cases/ui/test_cases.xlsx --sheet "TC_UI"` |

## Security

- Không commit service-account JSON, API key hoặc spreadsheet credential.
- Không ghi secret ra console, report hoặc testcase output.
- Dùng `GOOGLE_API_KEY` chỉ cho read-only public/allowed sheet.
- Dùng service account cho write access.

## References

| Document | Purpose |
|---|---|
| `RULE_GLOBAL.md` | Global security and output rules. |
| `README.md` | Kit architecture and output structure. |
