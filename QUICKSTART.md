# Quick Start

> Hướng dẫn setup và chạy Test Automation Kit lần đầu cho project mới.

## Prerequisites

| Check | Requirement |
|---|---|
| ✅ | Node.js `>=18` và `npm`/`npx`. |
| ✅ | Playwright browser runtime. |
| ✅ | AI Agent hoặc IDE có quyền đọc workspace. |
| ✅ | Token/quyền truy cập Jira, Confluence, Figma nếu Phase 1 cần fetch tài liệu. |
| ✅ | Credential test cho app/API trong môi trường dev/staging. |
| ✅ | MCP config cho `atlassian`, `figma`, `playwright` nếu dùng AI Agent tích hợp MCP. |
| ➕ | (Optional) Docker hoặc k6 — chỉ cần khi chạy **load test Loại B** (`npm run load`); thiếu thì lệnh tự skip sạch. |
| ➕ | (Optional) 2 tài khoản test `OPS_USERNAME_LOW/HIGH` trong `task.env` — cho ma trận authz/IDOR của `npm run security`. |
| ❌ | DB credential/connection string không cần và không dùng trong workflow chuẩn. |

## Setup

| Step | Action | Command/File |
|---:|---|---|
| 1 | Clone repo | `git clone <YOUR_REPO_URL>` |
| 2 | Vào workspace | `cd <YOUR_PROJECT>` |
| 3 | Cài dependencies | `npm install` |
| 4 | Cài Playwright browsers | `npx playwright install` |
| 5 | Tạo env local | Copy `.env.example` thành `.env.local` hoặc `.env` |
| 6 | Cấu hình MCP | Dùng template trong `.agent/config/mcp_config.md` |
| 7 | Cấu hình project context | Cập nhật `.agent/config/project_context.md` |

## Inputs

| Input | Required | Notes |
|---|---|---|
| `PROJECT_OUTPUT_DIR` | Yes | Ví dụ: `outputs/<YOUR_PROJECT>`. |
| `TASK_KEY` | Yes | Scope folder, ví dụ: `<TASK_KEY>`. |
| Jira Story/Task | Optional | Cần nếu Phase 1 fetch Jira, publish testcase lên Jira hoặc Phase 2 log Jira bug. |
| Confluence Requirement | Optional | Cần nếu requirement nằm trên Confluence. |
| Figma URL/API key | Optional | Cần nếu testcase phụ thuộc UI design. |
| Swagger/OpenAPI URL | Optional | Cần cho API testcase hoặc API automation. |
| App/API credentials | Yes for execution | Không ghi secret vào Markdown/report. |

## Environment Checklist

| Key | Purpose |
|---|---|
| `PROJECT_OUTPUT_DIR=outputs/<YOUR_PROJECT>` | Output root của project. |
| `TASK_KEY=<TASK_KEY>` | Scope folder của task/feature. |
| `RUN_ID=<safe-run-id>` | Optional; bắt buộc khi chạy song song nhiều session cùng `TASK_KEY`. |
| `JIRA_URL`, `JIRA_USERNAME`, `JIRA_API_TOKEN` | Jira integration. |
| `TEST_MANAGEMENT_TOOL=xray`, `JIRA_TESTCASE_ISSUE_TYPE=Test`, `JIRA_TESTCASE_DRY_RUN` | Publish testcase từ Excel lên Jira/Xray sau QA confirmation trong Phase 1. |
| `XRAY_TEST_TYPE`, `XRAY_TEST_TYPE_FIELD_ID` | Optional; dùng khi Xray/Jira bắt buộc field `Test Type`. |
| `XRAY_REQUIREMENT_LINK_TYPE=Tests` | Link Xray `Test` issue về Story/Task như `<TASK_KEY>`. |
| `XRAY_TEST_SET_ENABLED`, `XRAY_TEST_SET_LINK_TYPE` | Optional; tạo Xray `Test Set` theo business flow trong cột `Module`. |
| `XRAY_CLEANUP_DEPRECATE_LABELS`, `XRAY_CLEANUP_UNLINK_STALE` | Cleanup Xray Test lifecycle khi Excel bỏ bớt hoặc restore TC đã publish. |
| `CONFLUENCE_URL` | Requirement source nếu dùng Confluence. |
| `FIGMA_API_KEY` | Figma fetch nếu dùng design source. |
| `<APP>_BASE_URL`, `<APP>_LOGIN_URL` | UI automation. |
| `<APP>_USERNAME`, `<APP>_PASSWORD` | Test account. |
| `<APP>_API_BASE_URL`, `<APP>_SWAGGER_URL` | API automation. |
| `PW_TRACE`, `PW_VIDEO` | Debug trace/video. |

## Verify Installation

| Check | Command | Expected Result |
|---|---|---|
| Node | `node -v` | Version `>=18`. |
| NPM | `npm -v` | Version printed without error. |
| Playwright | `npx playwright --version` | Playwright version printed. |
| Jira dry check | `npm run integration:check` | Connection/config check completes. |
| Task test wrapper | `npm run test:task -- --help` | Usage is printed without executing tests. |

## Run Phase 1

Use [prompt_templates/run_phase1_template.md](prompt_templates/run_phase1_template.md), fill placeholders, then ask the agent to run Phase 1 only.

```text
Chạy Phase 1 cho project <YOUR_PROJECT>.
Module/Feature: <YOUR_FEATURE>
Task key/scope folder: <TASK_KEY>
Input: Jira <JIRA_URL>, Confluence <CONFLUENCE_URL>, Figma <FIGMA_FILE_URL>, Swagger <SWAGGER_URL>
Output: <PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/
Chỉ sinh testcase, export Excel và summary; không publish Jira và không execute automation.
```

Luồng Phase 1 chuẩn:

```text
Requirement
↓
Generate Testcase
↓
Excel (Source of truth khi gen/publish)
↓
QA xác nhận
↓
Auto Publish Jira → Xray (nguồn execute Phase 2)
```

Auto Publish Jira là step riêng trong phạm vi Phase 1. Excel là source of truth khi gen/publish. Khi chạy Phase 2, agent **mặc định lấy nguồn từ Xray** (`TESTCASE_SOURCE=xray`: kéo về canonical local `test-cases/from-xray/*.xlsx` rồi execute) — nên publish là bước cần trước Phase 2; đặt `TESTCASE_SOURCE=excel` để dùng Excel local.

## Phase 1 - Auto Publish Jira

Chỉ chạy sau khi QA đã xác nhận Excel/testcase được phép publish. Dùng prompt riêng [prompt_templates/phase1/04_auto_publish_jira.md](prompt_templates/phase1/04_auto_publish_jira.md).

Kiểm tra payload publish trước khi ghi Jira thật:

```text
npm run jira:testcase-publish:dry-run -- --project-output <PROJECT_OUTPUT_DIR> --task <TASK_KEY> --story <JIRA_STORY_KEY>
```

Publish thật khi đã cấu hình đúng issue type/quyền Jira và QA đã approve:

```text
npm run jira:testcase-publish -- --project-output <PROJECT_OUTPUT_DIR> --task <TASK_KEY> --story <JIRA_STORY_KEY> --publish --qa-approved
```

Publish kèm Xray Test Set theo business flow:

```text
npm run jira:testcase-publish -- --project-output <PROJECT_OUTPUT_DIR> --task <TASK_KEY> --story <JIRA_STORY_KEY> --publish --qa-approved --with-test-sets
```

Với Xray, `--story <JIRA_STORY_KEY>` không chỉ là metadata local: script sẽ link từng Xray `Test` issue về Story/Task đó bằng link type `XRAY_REQUIREMENT_LINK_TYPE` mặc định `Tests`.

Nếu bật `--with-test-sets`, script tạo/tái sử dụng một `Test Set` cho mỗi business flow chính trong cột `Module` rồi gắn các `Test` vào Test Set tương ứng. Nếu Jira/Xray instance dùng link type khác mặc định, cấu hình `XRAY_TEST_SET_LINK_TYPE`.

## Partial Rerun - Cleanup Xray Tests

Khi Excel source of truth thay đổi sau khi đã publish Xray Test, cleanup thuộc nhánh phụ Partial Rerun. Dùng prompt riêng [partial-rerun/run_xray_test_cleanup.md](partial-rerun/run_xray_test_cleanup.md) sau khi `run_requirement_apply_approved.md` đã merge testcase được Human Review approve. Workflow chuẩn không xóa cứng Xray `Test`; chỉ đánh dấu stale bằng label cleanup và optional unlink khỏi Story/Task khi QA xác nhận.

Preview trước:

```text
npm run jira:testcase-cleanup:dry-run -- --project-output <PROJECT_OUTPUT_DIR> --task <TASK_KEY> --story <JIRA_STORY_KEY>
```

Apply thật sau QA approval:

```text
npm run jira:testcase-cleanup -- --project-output <PROJECT_OUTPUT_DIR> --task <TASK_KEY> --story <JIRA_STORY_KEY> --apply --qa-approved
```

Nếu QA muốn bỏ link coverage của stale Test khỏi Story/Task, thêm `--unlink`.

## Parallel Story Safety

| Rule | Required Behavior |
|---|---|
| Mỗi story | Dùng một conversation AI riêng. |
| Run profile | Mỗi task dùng `profiles/<TASK_KEY>/task.env` (giá trị động: scope, link, tài khoản OPS/LMS); giá trị tĩnh giữ ở `.env` chung. Truyền `TASK_ENV=profiles/<TASK_KEY>/task.env` cho mọi command. |
| Scope echo | Agent phải echo `PROJECT_OUTPUT_DIR`, `TASK_KEY`, `TASK_OUTPUT_DIR` trước khi ghi file/chạy lệnh. |
| Shared env | Không sửa `.env`/`.env.local` khi session khác đang chạy; ưu tiên profile qua `TASK_ENV` thay vì sửa `.env` chung. |
| Command env | Truyền `PROJECT_OUTPUT_DIR` và `TASK_KEY` qua từng command nếu cần override. |
| Cùng `TASK_KEY` song song | Bắt buộc thêm `RUN_ID`, ví dụ `RUN_ID=run-20260616-01`. |
| Phase-separated flow | Chạy Phase 1, chờ Dev implement, chạy Phase 2, chờ Dev fix bug nếu có, rồi Re-run. |
| Automation code | Ưu tiên spec/helper story-specific dưới `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/automation/`. |

Khi có `RUN_ID`, Playwright results/report/artifacts nằm dưới:

```text
<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/test-results/runs/<RUN_ID>/
```

Local execution/rerun/Jira summary cho cùng run nên nằm dưới:

```text
<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/reports/runs/<RUN_ID>/
```

## Run Phase 2

Use [prompt_templates/run_phase2_template.md](prompt_templates/run_phase2_template.md), fill execution mode and testcase scope.

```text
Chạy Phase 2 cho project <YOUR_PROJECT>.
Task key/scope folder: <TASK_KEY>
Execution mode: SELECTED_TESTCASES
Selected TC IDs: <TC_ID_1>, <TC_ID_2>
Generate/update Playwright script nếu cần, execute, auto-heal, tạo local report.
Không tạo Jira bug thật nếu chưa được xác nhận.
Nguồn testcase: TESTCASE_SOURCE=xray (mặc định — kéo từ Xray về test-cases/from-xray/ rồi execute) hoặc excel (test-cases/*.xlsx).
```

## Run Task-Scoped Playwright

Ưu tiên các command này khi chạy test cho một story/task cụ thể để tránh dùng nhầm `TASK_KEY` từ `.env` cũ:

```text
npm run test:task -- --project-output <PROJECT_OUTPUT_DIR> --task <TASK_KEY>
npm run test:task:fe -- --project-output <PROJECT_OUTPUT_DIR> --task <TASK_KEY>
npm run test:task:api -- --project-output <PROJECT_OUTPUT_DIR> --task <TASK_KEY>
```

## Run Rerun

Use [prompt_templates/run_phase_re-run_template.md](prompt_templates/run_phase_re-run_template.md) only for failed testcase or Jira bug Re-run after Dev fix.

```text
Chạy rerun bug cho project <YOUR_PROJECT>.
Task key/scope folder: <TASK_KEY>
Jira bug keys: <BUG-1>, <BUG-2>
TC IDs: <TC_ID_1>, <TC_ID_2>
Chỉ Re-run bug/case liên quan, không đồng bộ tài liệu mới trong bước này.
```

## View Reports

| Report | Path |
|---|---|
| Task summary | `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/task.md` |
| Testcase Markdown | `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/test-cases/*.md` |
| Testcase Excel | `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/test-cases/*.xlsx` |
| Capability / Test-Hook Request | `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/reports/capability-request.md` (khi còn `Needs hook`/`Manual-only`) |
| Jira testcase publish | `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/reports/jira-testcase-publish-summary.md` |
| Jira testcase cleanup | `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/reports/jira-testcase-cleanup-summary.md` |
| Playwright HTML | `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/test-results/playwright-report/` |
| Execution results | `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/test-results/execution-results.md` |
| Execution summary | `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/reports/execution-summary.md` |
| Rerun report | `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/reports/rerun/` |

## QA Checks (executable — chạy thật, so ngưỡng/contract)

Tái dùng login/catalog; kết quả ghi `<TASK_OUTPUT_DIR>/reports/` và lên dashboard. Chi tiết + catalog schema: `scripts/qa/README.md`.

| Việc | Lệnh | Autonomy / an toàn |
|---|---|---|
| Dashboard tổng hợp (SAPP DS) | `npm run dashboard` | đọc `knowledge/` → `reports/dashboard.html` |
| Accessibility (axe-core) | `npm run accessibility -- --catalog <ui_catalog.json>` | never-auto; finding review |
| Performance Loại A | `npm run perf -- --catalog <perf_catalog.json>` | threshold-gated; verdict **advisory** (median N) |
| Security basic | `npm run security -- --catalog <security_catalog.json> --confirm-nonprod` | never-auto, **GET/non-prod**, mask PII |
| Load Loại B (k6) | `npm run load -- --script tests/load/example.load.js --confirm-nonprod --docker` | never-auto, **non-prod**, cap; k6/Docker (thiếu → skip) |
| Risk register (RBT) | `npm run risk` | Suggest-only; QA override band |
| Risk gate | `npm run risk:gate` (cảnh báo) · `npm run risk:gate:enforce` (chặn CI) | High-risk thiếu độ sâu → CRITICAL |
| Mobile-web | `npm run test:mobile-web` | device emulation (iPhone/Pixel) |

> **Ambiguity Gate**: Phase 1 tự chặn sinh testcase khi requirement mơ hồ mức Critical/High → xuất `reports/phase1-clarifications.md` chờ QA/BA. Xem USER_GUIDE mục 12.

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| `node` hoặc `npm` không nhận lệnh | Node chưa cài hoặc PATH chưa reload | Cài Node.js `>=18`, mở terminal mới, chạy `node -v`. |
| Playwright báo thiếu browser | Browser runtime chưa cài | Chạy `npx playwright install`. |
| MCP không kết nối | Token/quyền hoặc MCP config sai | Kiểm tra `.env.local` và IDE MCP settings. |
| Phase 1 không fetch được requirement | URL/quyền Jira/Confluence/Figma sai | Kiểm tra link, token, quyền page/file. |
| Publish testcase Jira bị lỗi | Issue type/quyền Jira/Xray/custom field chưa đúng | Chạy dry-run, kiểm tra `JIRA_TESTCASE_ISSUE_TYPE=Test`, `JIRA_PROJECT_KEY`, `JIRA_STORY_KEY`, `XRAY_TEST_TYPE_FIELD_ID`. |
| Xray Test cũ vẫn còn sau khi bỏ TC khỏi Excel | Workflow không hard delete issue | Chạy cleanup dry-run, sau đó apply để thêm label `deprecated/out-of-scope/stale-from-excel`; thêm `--unlink` nếu QA muốn bỏ link khỏi Story. |
| Phase 2 bị `SKIP` nhiều | Auth/data/API/env chưa sẵn sàng hoặc case cần state sâu không có API/hook | Kiểm tra credential, base URL, Swagger URL, fixture/test hook; case thiếu capability an toàn (không dựng được qua API/hook/sandbox) đánh dấu `Needs hook`/`Manual-only` — KHÔNG dùng DB để né (xem `tests/support/setup/hooks/README.md`). |
| Jira bug không tạo được | Chưa đủ config hoặc chưa được phép log thật | Chạy dry-run trước, kiểm tra `JIRA_*` keys. |

## Why It Matters

Quick Start chuẩn giúp project mới có cùng layout output và cùng điều kiện quality gate. Khi output ổn định, Phase 2 và rerun có thể đọc lại artifact cũ mà không tốn token đọc lại toàn bộ requirement.

## References

| Document | Purpose |
|---|---|
| [README.md](README.md) | Landing page và architecture. |
| [RULE_GLOBAL.md](RULE_GLOBAL.md) | Quy tắc global. |
| [prompt_templates/run_phase1_template.md](prompt_templates/run_phase1_template.md) | Template Phase 1. |
| [prompt_templates/phase1/04_auto_publish_jira.md](prompt_templates/phase1/04_auto_publish_jira.md) | Prompt riêng cho Auto Publish Jira trong Phase 1 sau QA confirmation. |
| [prompt_templates/run_phase2_template.md](prompt_templates/run_phase2_template.md) | Template Phase 2. |
| [prompt_templates/run_phase_re-run_template.md](prompt_templates/run_phase_re-run_template.md) | Template Re-run bug/case fail và Jira bug đã fix. |
| [partial-rerun/run_xray_test_cleanup.md](partial-rerun/run_xray_test_cleanup.md) | Prompt cleanup lifecycle Xray Test sau partial rerun approved. |
