---
description: Workflow Phase 1 để đọc requirement/design/API, sinh testcase, validate coverage, export Excel và publish Jira sau QA confirmation.
skills:
  - phase1/requirements_analyzer
  - phase1/tc_validator
  - shared/test_data_generator
  - shared/precondition_setup_planner
  - shared/jira_testcase_publisher
---

# Workflow Phase 1 - Sinh Testcase

> File tổng quan của Phase 1. Khi cần thực thi chi tiết, đọc lần lượt các step file bên dưới.

## Mục Đích

Sinh bộ testcase chi tiết, có trace requirement, có phân nhóm chức năng, có coverage/risk review và có file Excel source of truth. Auto Publish Jira là step riêng trong phạm vi Phase 1, chỉ chạy sau khi QA xác nhận Excel.

## Khi Nào Dùng

| Trường hợp | Dùng workflow này |
|---|---|
| Bắt đầu story/task mới | Có |
| Cần sinh testcase từ Jira/Confluence/Figma/Swagger | Có |
| Cần cập nhật testcase vì Dev fix bug | Không, dùng Re-run |
| Tài liệu nguồn đã đổi sau khi có testcase | Không, dùng `partial-rerun` khi user yêu cầu |

## Inputs

| Input | Nguồn |
|---|---|
| Task key | User prompt hoặc runtime env `TASK_KEY` |
| Project output | `PROJECT_OUTPUT_DIR=outputs/<YOUR_PROJECT>` |
| Requirement/story | Jira, Confluence hoặc artifact local |
| UI/API spec | Figma, Swagger/OpenAPI hoặc artifact local |
| Rule chung | `RULE_GLOBAL.md`, `.agent/rules/*.md` |

## Outputs

| Output | Vị trí |
|---|---|
| Testcase Markdown | `<TASK_OUTPUT_DIR>/test-cases/` |
| Testcase Excel | Cùng thư mục với testcase Markdown |
| Jira testcase publish summary | `<TASK_OUTPUT_DIR>/reports/jira-testcase-publish-summary.md` sau step Auto Publish Jira |
| Snapshot context | `<TASK_OUTPUT_DIR>/test-cases/snapshot_context.json` |
| Phase 1 summary | `<TASK_OUTPUT_DIR>/reports/phase1-summary.md` |
| Task tracking | `<TASK_OUTPUT_DIR>/task.md` |

## Workflow

| Thứ tự | Step file | Mục tiêu |
|---:|---|---|
| 1 | [phase1_01_prepare_context.md](phase1_01_prepare_context.md) | Xác nhận scope, đọc artifact local và fetch tài liệu còn thiếu. |
| 2 | [phase1_02_generate_testcases.md](phase1_02_generate_testcases.md) | Sinh testcase theo template 9 cột, phân nhóm và risk. |
| 3 | [phase1_03_validate_export_report.md](phase1_03_validate_export_report.md) | Validate chất lượng, export Excel và ghi report Phase 1. |
| 4 | [phase1_04_auto_publish_jira.md](phase1_04_auto_publish_jira.md) | Sau khi QA xác nhận, đọc Excel canonical và publish testcase lên Jira. |

## Rules

- Không hardcode task/project cụ thể trong prompt chung.
- Không paste toàn bộ requirement/testcase vào chat nếu đã lưu file local.
- Requirement chỉ được tính covered khi testcase có trace rõ, assertion đúng behavior và không bị skip.
- Nếu còn gap Critical/High thì không kết luận PASS dù coverage số học >= 80%.
- Excel trong `test-cases/` là source of truth khi gen/publish (Phase 1). Sau publish, **Phase 2 execute mặc định lấy nguồn từ Xray** (`TESTCASE_SOURCE=xray`, kéo về `from-xray/*.xlsx`); `excel` là opt-out. Sửa nội dung testcase ở Excel rồi re-publish, không sửa thẳng trên Xray.
- Không chạy step Auto Publish Jira nếu chưa có QA confirmation rõ ràng trên Excel/testcase.
- Nếu Excel thay đổi sau publish, không cleanup trong Phase 1 chính; chuyển sang `partial-rerun/run_xray_test_cleanup.md` sau Human Review approval.
- Nếu source đổi nội dung sau baseline, không tự đổi luồng chính; chuyển sang `partial-rerun` khi user yêu cầu.

## Completion Gate

Phase 1 Generate/Testcase chỉ hoàn tất khi có đủ:

- Testcase Markdown.
- File Excel tương ứng.
- `phase1-summary.md` có coverage/risk/quality gate.
- `task.md` được cập nhật đường dẫn output.
- Không còn blocker Critical/High chưa ghi rõ.

Step Auto Publish Jira trong Phase 1 chỉ hoàn tất khi có đủ:

- QA confirmation rõ ràng cho Excel/testcase.
- Publish dry-run hoặc publish thật theo mode đã được QA/user xác nhận.
- `jira-testcase-publish-summary.md` ghi rõ Created / Existing skipped / Error.
