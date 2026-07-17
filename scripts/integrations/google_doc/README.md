# Google Docs Integration

> Scripts đọc nội dung tài liệu Google Docs (requirement, spec, tài liệu BA) và xuất ra Markdown/JSON dưới output của task.

## Purpose

Google Docs integration hỗ trợ project cần đọc requirement/spec viết trên Google Docs để làm nguồn phân tích, sinh testcase hoặc lưu artifact requirement trong repo.

## When To Use

| Scenario | Use This Integration |
|---|---|
| Đọc requirement/spec từ Google Doc | ✅ |
| Lưu snapshot tài liệu Doc thành Markdown | ✅ |
| Đọc dữ liệu dạng bảng có cấu trúc | ❌ (dùng `google_sheet`) |
| Thay thế source Markdown chính của kit | ❌ |

## Inputs

| Input | Required | Notes |
|---|---|---|
| `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` | Yes | Service account JSON path, không commit file này. |
| `GOOGLE_DOCUMENT_ID` | Optional | Document mặc định; có thể thay bằng `--doc "<ID/URL>"`. |
| `PROJECT_OUTPUT_DIR` | Yes* | Output root của project (*không bắt buộc nếu dùng `--output`). |
| `TASK_KEY` | Yes* | Scope folder của task (*không bắt buộc nếu dùng `--output`). |

> Docs API thường **không** chấp nhận `GOOGLE_API_KEY` cho `documents.get` (khác với Sheets). Dùng Service Account.

## Outputs

| Output | Location |
|---|---|
| Doc artifacts (md/json) | `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/requirements/google_doc/<title>_<timestamp>/` |

## Setup

| Step | Command/Action |
|---:|---|
| 1 | `npm install` (thư viện `googleapis` đã có sẵn trong kit). |
| 2 | Copy `scripts/integrations/google_doc/.env.example` sang `.env` hoặc `.env.local`. |
| 3 | Tải Service Account JSON, đặt vào thư mục này (VD `service-account.json`). |
| 4 | **Share Google Doc cho email service account** (Viewer là đủ). |
| 5 | `node doc_auth.js --setup` để xem hướng dẫn chi tiết. |

## Environment

```env
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./service-account.json
GOOGLE_DOCUMENT_ID=<DOCUMENT_ID>
PROJECT_OUTPUT_DIR=outputs/<YOUR_PROJECT>
TASK_KEY=<TASK_KEY>
```

## Workflow

| Step | Action |
|---:|---|
| 1 | Verify env + quyền truy cập bằng `doc_auth.js --verify`. |
| 2 | Đọc document theo ID/URL bằng `doc_reader.js`. |
| 3 | Artifact Markdown/JSON được lưu dưới output của task. |

## Examples

| Task | Command |
|---|---|
| Verify kết nối | `node scripts/integrations/google_doc/doc_auth.js --verify` |
| Verify 1 doc cụ thể | `node scripts/integrations/google_doc/doc_auth.js --verify --doc "<URL>"` |
| Đọc doc → Markdown | `node scripts/integrations/google_doc/doc_reader.js --doc "<URL>" --format md` |
| Đọc doc → JSON | `node scripts/integrations/google_doc/doc_reader.js --doc "<ID>" --format json` |
| Đọc doc mặc định (env) | `node scripts/integrations/google_doc/doc_reader.js` |

## Conversion Notes

Bộ chuyển đổi Docs → Markdown xử lý: heading (TITLE/HEADING_1..6), bullet list (ordered/unordered theo glyph), bảng, link, **bold**, *italic*. Ảnh và object nhúng bị bỏ qua phần nội dung.

## Security

- Không commit service-account JSON, API key hoặc document credential.
- Không ghi secret ra console, report hoặc testcase output.
- Cấp quyền tối thiểu (Viewer) cho service account trên Doc.

## References

| Document | Purpose |
|---|---|
| [../../../RULE_GLOBAL.md](../../../RULE_GLOBAL.md) | Global security and output rules. |
| [../google_sheet/README.md](../google_sheet/README.md) | Integration Google Sheets tương đương. |
| [../../../.agent/config/mcp_config.md](../../../.agent/config/mcp_config.md) | Cấu hình MCP dùng chung. |
