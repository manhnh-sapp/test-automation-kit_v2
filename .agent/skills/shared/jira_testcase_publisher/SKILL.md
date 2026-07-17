---
name: jira_testcase_publisher
description: Publish testcase từ Excel canonical lên Jira/Xray sau Phase 1; cleanup lifecycle Xray Test thuộc partial-rerun khi Excel thay đổi.
---

# Jira Testcase Publisher

## Purpose

Publish bộ testcase đã được QA xác nhận từ Excel lên Jira/Xray để QA/Dev review, track và làm nguồn cho Phase 2 execute. Excel trong `<TASK_OUTPUT_DIR>/test-cases/` là source of truth khi **authoring/publish** (sửa nội dung ở Excel rồi re-publish); Phase 2 execute mặc định đọc từ Xray (`TESTCASE_SOURCE=xray`). Publish là step riêng trong phạm vi Phase 1. Khi Excel thay đổi sau publish, cleanup lifecycle Xray Test thuộc nhánh phụ `partial-rerun/run_xray_test_cleanup.md`.

## Responsibilities

| Trách nhiệm | Yêu cầu |
|---|---|
| Source | Chỉ đọc Excel `.xlsx` đã export từ Phase 1, ưu tiên sheet `Test Cases`. |
| QA gate | Chỉ publish thật khi có QA confirmation rõ ràng. |
| Publish | Tạo Xray `Test` issue theo `JIRA_TESTCASE_ISSUE_TYPE=Test` hoặc CLI `--issue-type "Test"`. |
| Requirement link | Link từng Xray `Test` issue về Jira Story/Task bằng `XRAY_REQUIREMENT_LINK_TYPE` mặc định `Tests`. |
| Test Set | Optional: tạo/tái sử dụng Xray `Test Set` theo business flow trong cột `Module` khi bật `XRAY_TEST_SET_ENABLED=1` hoặc `--with-test-sets`. |
| Labels | Thêm label phụ `group-*`, `layer-*`, `risk-*`, `priority-*` để lọc trên Xray/Jira. |
| Safety | Chạy dry-run trước nếu user/prompt/env chưa cho phép ghi Jira thật. |
| Deduplicate | Dedupe bằng label theo `TASK_KEY` + `TC ID` để tránh tạo trùng. |
| Cleanup | Khi Excel bỏ TC đã publish, cleanup thuộc partial-rerun sau Human Review approval: đánh dấu Xray Test bằng label cleanup; khi TC quay lại Excel, restore label cleanup. |
| No hard delete | Không xóa cứng Xray `Test` issue trong workflow chuẩn. |
| Report | Ghi kết quả publish local dưới `<TASK_OUTPUT_DIR>/reports/`. |

## Inputs

| Input | Nguồn |
|---|---|
| Excel testcase | `<TASK_OUTPUT_DIR>/test-cases/*.xlsx` hoặc CLI `--excel` |
| Jira parent/story | `JIRA_STORY_KEY` hoặc CLI `--story` |
| Jira project | `JIRA_PROJECT_KEY` hoặc suy từ story key |
| Issue type | `JIRA_TESTCASE_ISSUE_TYPE=Test` cho Xray |
| Xray test type | `XRAY_TEST_TYPE=Manual`, optional `XRAY_TEST_TYPE_FIELD_ID` nếu Jira bắt buộc |
| Xray requirement link | `XRAY_REQUIREMENT_LINK_ENABLED=1`, `XRAY_REQUIREMENT_LINK_TYPE=Tests`, `XRAY_REQUIREMENT_LINK_DIRECTION=test_to_story` |
| Xray Test Set | Optional `XRAY_TEST_SET_ENABLED=1`, `XRAY_TEST_SET_ISSUE_TYPE=Test Set`, `XRAY_TEST_SET_LINK_TYPE=Tests` |
| Rules | `RULE_GLOBAL.md`, active prompt |

## Outputs

| Output | Vị trí |
|---|---|
| Jira testcase issues/mirror | Jira project configured by env |
| Publish JSON | `<TASK_OUTPUT_DIR>/reports/jira-testcase-publish.json` |
| Publish summary | `<TASK_OUTPUT_DIR>/reports/jira-testcase-publish-summary.md` |
| Cleanup JSON | `<TASK_OUTPUT_DIR>/reports/jira-testcase-cleanup.json` |
| Cleanup summary | `<TASK_OUTPUT_DIR>/reports/jira-testcase-cleanup-summary.md` |

## Commands

Dry-run:

```bash
npm run jira:testcase-publish:dry-run -- --task <TASK_KEY> --story <JIRA_STORY_KEY> --project-output <PROJECT_OUTPUT_DIR>
```

Publish thật:

```bash
npm run jira:testcase-publish -- --task <TASK_KEY> --story <JIRA_STORY_KEY> --project-output <PROJECT_OUTPUT_DIR> --publish --qa-approved
```

Publish kèm Test Set theo business flow:

```bash
npm run jira:testcase-publish -- --task <TASK_KEY> --story <JIRA_STORY_KEY> --project-output <PROJECT_OUTPUT_DIR> --publish --qa-approved --with-test-sets
```

Partial-rerun cleanup dry-run:

```bash
npm run jira:testcase-cleanup:dry-run -- --task <TASK_KEY> --story <JIRA_STORY_KEY> --project-output <PROJECT_OUTPUT_DIR>
```

Partial-rerun cleanup apply:

```bash
npm run jira:testcase-cleanup -- --task <TASK_KEY> --story <JIRA_STORY_KEY> --project-output <PROJECT_OUTPUT_DIR> --apply --qa-approved
```

Partial-rerun cleanup apply và unlink stale Test khỏi Story/Task nếu QA yêu cầu:

```bash
npm run jira:testcase-cleanup -- --task <TASK_KEY> --story <JIRA_STORY_KEY> --project-output <PROJECT_OUTPUT_DIR> --apply --qa-approved --unlink
```

## Decision Rules

- Không publish từ Markdown nếu Excel đã tồn tại; Excel là canonical source.
- Không publish thật nếu QA chưa xác nhận `APPROVED`; script publish thật cũng cần `--qa-approved` hoặc `JIRA_TESTCASE_QA_APPROVED=1`.
- Vì test management dùng Xray, không dùng generic issue type `Test Case` trừ khi Jira project cấu hình riêng như vậy. Mặc định là Xray `Test`.
- Mỗi Xray `Test` issue phải link về đúng Jira Story/Task từ `JIRA_STORY_KEY` hoặc CLI `--story`, ví dụ `SAPP-3255`.
- Nhóm chính lấy từ business flow trong cột `Module`; label phụ theo layer/risk/priority không thay thế nhóm chính.
- Test Set theo business flow là optional. Nếu bật, mỗi nhóm chính trong `Module` có một Xray `Test Set`; gắn Test vào Test Set qua `XRAY_TEST_SET_LINK_TYPE`.
- Nếu Excel không còn TC ID đã publish, không hard delete Xray Test; dùng cleanup để thêm label `deprecated`, `out-of-scope`, `stale-from-excel`.
- Nếu TC ID quay lại Excel nhưng Xray Test đang có label cleanup, cleanup được phép remove các label đó để restore.
- Unlink stale Xray Test khỏi Story/Task chỉ khi QA yêu cầu rõ (`--unlink` hoặc `XRAY_CLEANUP_UNLINK_STALE=1`).
- Không coi Phase 1 hoàn tất nếu Excel thiếu hoặc không đọc được.
- Nếu Jira config/quyền/issue type chưa sẵn sàng, ghi blocker hoặc chỉ dry-run; không tạo issue mơ hồ.
- Nếu publish lỗi một phần, giữ Excel và report local làm source; không sửa testcase để khớp lỗi publish.
- Phase 2 execute mặc định lấy nguồn từ Xray (`TESTCASE_SOURCE=xray`, kéo về canonical local `from-xray/*.xlsx`); `excel` là opt-out. Excel là source of truth khi gen/publish (skill này).

## Anti-Patterns

- Tạo Jira testcase trực tiếp từ requirement khi chưa có Excel.
- Sửa nội dung testcase trực tiếp trên Xray thay vì sửa Excel rồi re-publish.
- Tạo Xray Test nhưng không link về Story/Task, khiến QA không thấy coverage theo requirement/task.
- Tạo trùng testcase trên Jira khi cùng `TASK_KEY` + `TC ID` đã publish.
- Tạo Test Set theo layer/risk thay vì business flow chính trong `Module`.
- Xóa cứng Xray `Test` issue chỉ vì TC bị bỏ khỏi Excel.
- Unlink stale Test khỏi Story/Task khi chưa có QA confirmation.
- Trộn Jira testcase publish với Jira bug logging sau Phase 2.
