# Jira, Confluence And Figma Integration Scripts

> Shared Node.js scripts for fetching requirement artifacts, publishing testcase mirrors to Jira/Xray, and logging confirmed Jira bugs.

## Purpose

Các script trong thư mục này hỗ trợ Phase 1 fetch requirement từ Jira/Confluence/Figma, publish testcase từ Excel source of truth lên Jira/Xray sau QA confirmation, và Phase 2 log bug Jira sau khi lỗi đã được xác nhận.

## When To Use

| Scenario | Script Group |
|---|---|
| Fetch Jira story, epic hoặc JQL result | Jira fetcher |
| Fetch Confluence requirement page | Confluence fetcher |
| Probe/fetch Figma file hoặc node | Figma scripts |
| Check env without exposing secrets | Connection checker |
| Publish testcase từ Excel sau QA confirmation trong Phase 1 | Jira testcase publisher |
| Kéo testcase từ Xray về canonical local để Phase 2 execute/rerun từ Xray (`TESTCASE_SOURCE=xray`) | Jira testcase puller |
| Đẩy trạng thái PASS/FAIL/SKIP/BLOCKED lên Xray sau execute (`PUSH_XRAY_EXECUTION=1`) | Xray Test Execution pusher |
| Cleanup lifecycle Xray Test khi Excel thay đổi sau partial rerun approved | Jira testcase cleanup |
| Log confirmed bug after Phase 2 | Jira bug reporter |

## Inputs

| Input | Required | Notes |
|---|---|---|
| `PROJECT_OUTPUT_DIR` | Yes | Output root, ví dụ `outputs/<YOUR_PROJECT>`. |
| `TASK_KEY` | Yes | Scope folder của task. |
| `RUN_ID` | Optional | Dùng khi Playwright results nằm trong `test-results/runs/<RUN_ID>/`. |
| Jira env keys | For Jira | Base URL, email/username, API token, project/story key. |
| Confluence env keys | For Confluence | URL, username, API token, page id. |
| Figma env keys | For Figma | File URL/key, node id, API key. |

## Outputs

| Output | Location |
|---|---|
| Jira artifacts | `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/requirements/jira/` |
| Confluence artifacts | `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/requirements/confluence/` |
| Figma artifacts | `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/requirements/figma/` |
| Jira testcase publish log | `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/reports/jira-testcase-publish-summary.md` |
| Xray pull canonical (Excel + JSON) | `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/test-cases/from-xray/` |
| Xray pull log | `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/reports/xray-pull-summary.md` |
| Testcase status (input cho push) | `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/test-results/testcase-status.json` |
| Xray Test Execution log | `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/reports/xray-execution-summary.md` |
| Jira testcase cleanup log | `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/reports/jira-testcase-cleanup-summary.md` |
| Jira bug log | `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/reports/` |
| Jira bug log with `RUN_ID` | `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/reports/runs/<RUN_ID>/` |

## Files

| File | Purpose |
|---|---|
| `jira_fetcher.js` | Fetch Jira issues/epics/JQL results. |
| `fetch_confluence.js` | Fetch Confluence page by `CONFLUENCE_PAGE_ID`. |
| `fetch_figma.js` | Fetch Figma file/node and save raw JSON + summary. |
| `probe_figma.js` | Verify access to Figma file/node. |
| `publish_testcases.js` | Publish testcase từ Excel canonical lên Jira/Xray `Test` issue. |
| `pull_testcases.js` | Reverse của publish: kéo Xray/Jira `Test` issue về canonical local (`test-cases/from-xray/*.xlsx` + `.json`). |
| `push_test_execution.js` | Tạo Xray Test Execution từ `test-results/testcase-status.json`, set status từng test run. |
| `cleanup_xray_tests.js` | Compare Excel canonical with published Xray `Test` issues and mark stale/restored lifecycle safely. |
| `bug_reporter.js` | Create Jira child bug/sub-bug from failed tests. |
| `check_connection.js` | Check env config without printing secrets. |
| `utils.js` | Shared helpers. |

## Setup

| Step | Command/Action |
|---:|---|
| 1 | `npm install` |
| 2 | Copy `.env.example` to `.env.local` or `.env`. |
| 3 | Fill real credentials in local env or CI secret store. |

## Environment

```env
JIRA_BASE_URL=<JIRA_URL>
JIRA_EMAIL=<JIRA_EMAIL>
JIRA_API_TOKEN=<JIRA_API_TOKEN>
JIRA_PROJECT_KEY=<PROJECT_KEY>
JIRA_STORY_KEY=<JIRA_STORY_KEY>
JIRA_BUG_ISSUE_TYPE=Sub-bug
TEST_MANAGEMENT_TOOL=xray
JIRA_TESTCASE_ISSUE_TYPE=Test
JIRA_TESTCASE_DRY_RUN=1
JIRA_TESTCASE_QA_APPROVED=0
JIRA_TESTCASE_DEDUP=1
JIRA_TESTCASE_LABELS=qa-testcase
XRAY_TEST_TYPE=Manual
XRAY_TEST_TYPE_FIELD_ID=
XRAY_TEST_TYPE_FIELD_MODE=option
XRAY_REQUIREMENT_LINK_ENABLED=1
XRAY_REQUIREMENT_LINK_TYPE=Tests
XRAY_REQUIREMENT_LINK_DIRECTION=test_to_story
XRAY_TEST_SET_ENABLED=0
XRAY_TEST_SET_ISSUE_TYPE=Test Set
XRAY_TEST_SET_SUMMARY_PREFIX=[Test Set]
XRAY_TEST_SET_LINK_ENABLED=1
XRAY_TEST_SET_LINK_TYPE=Tests
XRAY_TEST_SET_LINK_DIRECTION=testset_to_test
XRAY_TEST_SET_STORY_LINK_ENABLED=1
XRAY_TEST_SET_LABELS=
XRAY_CLEANUP_QA_APPROVED=0
XRAY_CLEANUP_APPLY=0
XRAY_CLEANUP_DEPRECATE_LABELS=deprecated,out-of-scope,stale-from-excel
XRAY_CLEANUP_UNLINK_STALE=0
XRAY_CLEANUP_RESTORE_ACTIVE=1

CONFLUENCE_URL=<CONFLUENCE_URL>
CONFLUENCE_USERNAME=<CONFLUENCE_USERNAME>
CONFLUENCE_API_TOKEN=<CONFLUENCE_API_TOKEN>
CONFLUENCE_PAGE_ID=<PAGE_ID>

FIGMA_FILE_URL=<FIGMA_FILE_URL>
FIGMA_FILE_KEY=<FIGMA_FILE_KEY>
FIGMA_NODE_ID=<FIGMA_NODE_ID>
FIGMA_API_KEY=<FIGMA_API_KEY>

PROJECT_OUTPUT_DIR=outputs/<YOUR_PROJECT>
TASK_KEY=<TASK_KEY>
RUN_ID=<optional-run-id>
```

| Alias | Replaces |
|---|---|
| `JIRA_URL` | `JIRA_BASE_URL` |
| `JIRA_USERNAME` | `JIRA_EMAIL` |
| `JIRA_PAT` | Jira Server/Data Center token |

## Workflow

| Step | Action |
|---:|---|
| 1 | Run `check_connection.js` to validate env presence. |
| 2 | Fetch Jira/Confluence/Figma artifacts as needed. |
| 3 | Store artifacts under the current task output folder. |
| 4 | Use fetched artifacts in Phase 1/Phase 2 prompts. |
| 5 | Publish testcase to Jira from Excel canonical only after QA confirmation. |
| 6 | Cleanup Xray Test lifecycle only from partial rerun after Excel changes and QA/Human Review confirms. |
| 7 | Log Jira bug only after Phase 2 confirms product/API bug. |

## Common Commands

| Task | Command |
|---|---|
| Check config | `node scripts/integrations/jira/check_connection.js` |
| Fetch Jira issue | `node scripts/integrations/jira/jira_fetcher.js --issue <ISSUE_KEY> --format md` |
| Fetch Jira epic | `node scripts/integrations/jira/jira_fetcher.js --epic <EPIC_KEY> --format md` |
| Fetch by JQL | `node scripts/integrations/jira/jira_fetcher.js --jql "project = <PROJECT_KEY> AND status != Done" --format md` |
| Fetch Confluence | `node scripts/integrations/jira/fetch_confluence.js` |
| Probe Figma | `node scripts/integrations/jira/probe_figma.js` |
| Fetch Figma | `node scripts/integrations/jira/fetch_figma.js` |
| Jira testcase publish dry-run | `node scripts/integrations/jira/publish_testcases.js --task <TASK_KEY> --story <JIRA_STORY_KEY> --project-output <PROJECT_OUTPUT_DIR> --dry-run` |
| Publish Jira testcases | `node scripts/integrations/jira/publish_testcases.js --task <TASK_KEY> --story <JIRA_STORY_KEY> --project-output <PROJECT_OUTPUT_DIR> --publish --qa-approved` |
| Publish Jira testcases with Test Sets | `node scripts/integrations/jira/publish_testcases.js --task <TASK_KEY> --story <JIRA_STORY_KEY> --project-output <PROJECT_OUTPUT_DIR> --publish --qa-approved --with-test-sets` |
| Pull testcases từ Xray (preview) | `node scripts/integrations/jira/pull_testcases.js --task <TASK_KEY> --story <JIRA_STORY_KEY> --project-output <PROJECT_OUTPUT_DIR> --dry-run` |
| Pull testcases từ Xray (ghi canonical) | `node scripts/integrations/jira/pull_testcases.js --task <TASK_KEY> --story <JIRA_STORY_KEY> --project-output <PROJECT_OUTPUT_DIR> --write` |
| Pull một số TC cụ thể | `node scripts/integrations/jira/pull_testcases.js --task <TASK_KEY> --project-output <PROJECT_OUTPUT_DIR> --write --only <TC_ID_1>,<TC_ID_2>` |
| Đẩy trạng thái lên Xray (preview) | `node scripts/integrations/jira/push_test_execution.js --task <TASK_KEY> --story <JIRA_STORY_KEY> --project-output <PROJECT_OUTPUT_DIR> --dry-run` |
| Đẩy trạng thái lên Xray (tạo Test Execution) | `node scripts/integrations/jira/push_test_execution.js --task <TASK_KEY> --story <JIRA_STORY_KEY> --project-output <PROJECT_OUTPUT_DIR> --write` |
| Partial rerun Xray cleanup dry-run | `node scripts/integrations/jira/cleanup_xray_tests.js --task <TASK_KEY> --story <JIRA_STORY_KEY> --project-output <PROJECT_OUTPUT_DIR> --dry-run` |
| Apply partial rerun Xray cleanup | `node scripts/integrations/jira/cleanup_xray_tests.js --task <TASK_KEY> --story <JIRA_STORY_KEY> --project-output <PROJECT_OUTPUT_DIR> --apply --qa-approved` |
| Apply partial rerun Xray cleanup and unlink stale | `node scripts/integrations/jira/cleanup_xray_tests.js --task <TASK_KEY> --story <JIRA_STORY_KEY> --project-output <PROJECT_OUTPUT_DIR> --apply --qa-approved --unlink` |
| Jira bug dry-run | `node scripts/integrations/jira/bug_reporter.js --task <TASK_KEY> --story <JIRA_STORY_KEY> --project-output <PROJECT_OUTPUT_DIR> --dry-run` |
| Create Jira bug | `node scripts/integrations/jira/bug_reporter.js --task <TASK_KEY> --story <JIRA_STORY_KEY> --project-output <PROJECT_OUTPUT_DIR>` |
| Jira bug dry-run for run | `node scripts/integrations/jira/bug_reporter.js --task <TASK_KEY> --story <JIRA_STORY_KEY> --project-output <PROJECT_OUTPUT_DIR> --run-id <RUN_ID> --dry-run` |

## Jira Testcase Publish Rules

| Rule | Requirement |
|---|---|
| Source | Excel `.xlsx` trong `test-cases/` là source of truth. |
| QA gate | Publish thật chỉ sau khi QA xác nhận Excel/testcase. |
| Script guard | Publish thật cần `--qa-approved` hoặc `JIRA_TESTCASE_QA_APPROVED=1`. |
| Xray issue type | Dùng `JIRA_TESTCASE_ISSUE_TYPE=Test`, không dùng generic `Test Case`. |
| Xray Test Type | Nếu Jira bắt buộc, cấu hình `XRAY_TEST_TYPE_FIELD_ID` và `XRAY_TEST_TYPE=Manual`. |
| Requirement link | Link từng Xray `Test` issue về `JIRA_STORY_KEY` bằng `XRAY_REQUIREMENT_LINK_TYPE`, mặc định `Tests`. |
| Jira role | Xray `Test` issues là mirror để review/track, không phải input execute. |
| Labels | Tự thêm `group-*`, `layer-*`, `risk-*`, `priority-*` để lọc nhanh trên Xray/Jira. |
| Test Set | Optional `--with-test-sets` hoặc `XRAY_TEST_SET_ENABLED=1` để tạo/tái sử dụng Xray `Test Set` theo business flow trong cột `Module`. |
| Dedupe | Dedupe bằng label theo `TASK_KEY` + `TC ID`. |
| Parent | `JIRA_TESTCASE_PARENT_MODE=auto` chỉ set parent khi issue type là child/sub type. |
| Report | Luôn ghi `jira-testcase-publish-summary.md` và JSON report. |

## Xray Testcase Pull Rules

| Rule | Requirement |
|---|---|
| Mục đích | Cho phép Phase 2 execute/rerun từ testcase đã review/sửa trên Xray (`TESTCASE_SOURCE=xray`), ngược chiều với publish. |
| Query scope | Discovery qua Jira REST theo label `automation-testcase` + `task-<TASK_KEY>` (không phụ thuộc Xray JQL indexing). |
| Steps source | Đọc steps/expected từ Xray `getTest` (cần `XRAY_CLIENT_ID`/`XRAY_CLIENT_SECRET`); nếu thiếu key hoặc Phase 1 không đẩy native thì fallback parse từ description. |
| Precondition | Ghép từ summary các issue Precondition liên kết (`[PRE-xx] ...`), fallback mục "Tiền điều kiện" trong description. |
| Isolation | Ghi vào `test-cases/from-xray/` — KHÔNG đụng Excel người dùng trong `test-cases/`. |
| Write gate | Mặc định `--dry-run` (chỉ preview); phải `--write` mới ghi file canonical. |
| Cảnh báo thiếu steps | Nếu report cảnh báo TC không có steps, DỪNG và báo user thay vì execute testcase rỗng bước. |
| Report | Luôn ghi `xray-pull-summary.md` (+ JSON) với cột nguồn steps (xray/description) cho từng TC. |

## Xray Test Execution Push Rules

| Rule | Requirement |
|---|---|
| Input | Đọc `test-results/testcase-status.json` (có `RUN_ID` thì trong `test-results/runs/<RUN_ID>/`) do Phase 2 ghi sau execute. |
| Map TC→Test | Lấy Xray Test key từ `reports/jira-testcase-publish.json`; TC không có trong map thì fallback JQL theo label `tc-*`. |
| Status | `testcase-status.json` dùng ĐÚNG tên trạng thái Xray: `PASSED` / `FAILED` / `TO DO` / `EXECUTING`. Vẫn nhận alias kit cũ (`PASS/FAIL/SKIP/BLOCKED`) và tự map (SKIP/BLOCKED→`TO DO`, đổi qua `XRAY_STATUS_*`). Validate theo `getStatuses()` của instance — sai thì fail trước khi tạo. |
| Phân biệt SKIP/BLOCKED | Vì instance chưa có status riêng, giữ `[SKIP]`/`[BLOCKED]` + lý do ở comment của test run. |
| Đặt tên (chuẩn) | Test Execution: `[<TASK_KEY>] Test Execution - <scope> - <version>` (scope mặc định `Full testcases` qua `XRAY_EXECUTION_SCOPE_LABEL`/`--scope-label`; version tự lấy `fixVersions` hoặc `RELEASE_VERSION`/`--version`; `--summary` override toàn bộ). Test Plan (mô hình A, QA tạo): `[Test Plan] <Sprint>`. |
| Execution granularity | Mỗi lần chạy tạo **1 Test Execution mới**; `--execution-key <KEY>` để append vào execution có sẵn. |
| Test Plan (roll-up) | Link execution vào Test Plan **có sẵn** (release/sprint) qua `--test-plan <KEY>` / `XRAY_TEST_PLAN_KEY` (`info.testPlanKey`) để roll-up trạng thái qua nhiều lần chạy. Kit **không tạo** Test Plan — QA sở hữu/tạo. |
| Evidence | Mặc định không đính; `--with-evidence` (hoặc `XRAY_EXECUTION_WITH_EVIDENCE=1`) để nhúng ảnh/video (bỏ file > `XRAY_EVIDENCE_MAX_BYTES`). |
| Write gate | Mặc định `--dry-run` (ghi payload preview); phải `--write` mới gọi Xray. |
| Report | Ghi `xray-execution-summary.md` + preview `xray-execution-preview.json`. |

Schema `testcase-status.json`:

```json
{
  "taskKey": "<TASK_KEY>",
  "generatedAt": "<ISO datetime>",
  "tests": [
    { "tcId": "<TC ID chính xác như Excel>", "status": "PASSED|FAILED|TO DO|EXECUTING", "comment": "<actual/lý do; nêu rõ nếu vốn là SKIP/BLOCKED>", "evidence": ["<path ảnh/video, tùy chọn>"] }
  ]
}
```

## Xray Test Cleanup Rules

| Rule | Requirement |
|---|---|
| Source | Excel `.xlsx` trong `test-cases/` sau partial rerun approved là source of truth cho active TC. |
| Query scope | Chỉ scan Xray `Test` có label `automation-testcase` và `task-<TASK_KEY>`. |
| Match key | So sánh bằng label `tc-*` sinh từ `TC ID`. |
| Stale | Nếu Xray Test không còn trong Excel, thêm label cleanup mặc định `deprecated,out-of-scope,stale-from-excel`. |
| Restore | Nếu TC quay lại Excel nhưng Xray Test còn label cleanup, remove label cleanup. |
| No hard delete | Không xóa cứng Jira/Xray issue trong workflow chuẩn. |
| Optional unlink | Chỉ unlink stale Test khỏi Story/Task khi chạy `--unlink` hoặc `XRAY_CLEANUP_UNLINK_STALE=1`. |
| QA gate | Apply thật cần Human Review/QA approval riêng, kèm `--qa-approved` hoặc `XRAY_CLEANUP_QA_APPROVED=1`. |
| Report | Luôn ghi `jira-testcase-cleanup-summary.md` và JSON report. |

## Jira Bug Rules

| Rule | Requirement |
|---|---|
| Parent | Bug must be child/sub-bug under `JIRA_STORY_KEY`. |
| Assignee | Use `JIRA_FE_ASSIGNEE`, `JIRA_BE_ASSIGNEE`, `JIRA_DEV_ASSIGNEE`, or parent assignee. |
| Title | Prefix with `[FE]` or `[BE]`. |
| Description | Only `Tiền điều kiện`, `Bước`, `Kết quả hiện tại`, `Kết quả mong muốn`. |
| Evidence | Use image/video evidence from `test-results/artifacts/`. |

## Security

- Không commit password, API token, cookie hoặc private key.
- Không ghi secret ra console, testcase output, report hoặc Jira description.
- Nếu token từng bị chia sẻ hoặc commit, rotate token đó.

## References

| Document | Purpose |
|---|---|
| `prompt_templates/phase2/08_log_bug_jira.md` | Jira bug logging rules. |
| `RULE_GLOBAL.md` | Global security and output rules. |
