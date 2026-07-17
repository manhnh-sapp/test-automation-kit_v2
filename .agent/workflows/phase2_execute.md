---
description: Workflow Phase 2 để generate/update Playwright automation, execute thật, auto-heal và report/Jira khi đủ điều kiện.
skills:
  - phase2/qa_automation_engineer
  - shared/test_data_generator
  - shared/jira_bug_reporter
---

# Workflow Phase 2 - Execute Automation

> File tổng quan của Phase 2. Khi chạy chi tiết, đọc lần lượt các step file trong bảng Workflow.

## Mục Đích

Thực thi testcase đã review bằng Playwright UI/API, giảm skip tối đa, sửa lỗi setup/automation hợp lý, ghi evidence và chỉ log Jira bug khi đủ gate.

## Khi Nào Dùng

| Trường hợp | Dùng workflow này |
|---|---|
| Đã có testcase Phase 1 được review | Có |
| Cần execute automation cho task/story | Có |
| Cần log bug từ case fail đã xác minh | Có |
| Chỉ rerun bug đã fix | Không, dùng Re-run |
| Tài liệu nguồn đổi sau baseline | Không, dùng `partial-rerun` khi user yêu cầu |

## Inputs

| Input | Nguồn |
|---|---|
| Testcase đã review | Canonical local theo `TESTCASE_SOURCE`: mặc định `test-cases/from-xray/*.xlsx` (xray), hoặc `test-cases/*.xlsx` (excel); Markdown cùng thư mục chỉ dùng khi cần Setup Strategy chi tiết |
| Phase 1 summary | `<TASK_OUTPUT_DIR>/reports/phase1-summary.md` |
| Runtime env | `.env.local`, `.env`, CI env hoặc env truyền trực tiếp theo command |
| App/API URL | Project context hoặc user prompt |
| Jira bug rule | `prompt_templates/phase2/08_log_bug_jira.md` |

## Outputs

| Output | Vị trí |
|---|---|
| Automation spec/helper | Mặc định `<TASK_OUTPUT_DIR>/automation/`; chỉ ghi `tests/fe/`, `tests/api/` khi cần core suite và có namespace theo `TASK_KEY` |
| Playwright result | `<TASK_OUTPUT_DIR>/test-results/` |
| Evidence ảnh/video/trace | `<TASK_OUTPUT_DIR>/test-results/` |
| Execution summary | `<TASK_OUTPUT_DIR>/reports/execution-summary.md` |
| Jira bug log | Trong execution summary hoặc report liên quan |

## Workflow

| Thứ tự | Step file | Mục tiêu |
|---:|---|---|
| 1 | [phase2_01_prepare_execution.md](phase2_01_prepare_execution.md) | Xác nhận TASK_KEY, scope testcase, env và dữ liệu cần chạy. |
| 2 | [phase2_02_generate_or_update_automation.md](phase2_02_generate_or_update_automation.md) | Sinh/cập nhật Playwright UI/API spec đúng testcase. |
| 3 | [phase2_03_execute_and_auto_heal.md](phase2_03_execute_and_auto_heal.md) | Execute thật, phân tích fail/skip/flaky và auto-heal root cause. |
| 4 | [phase2_04_report_and_jira_gate.md](phase2_04_report_and_jira_gate.md) | Ghi execution summary, shared change log, promotion status và log Jira chỉ khi đủ điều kiện. |

## Rules

- Không pass ảo bằng skip, bỏ step, bỏ assertion hoặc mock sai mục đích.
- Khi execute, đọc TC ID/steps/expected từ **nguồn canonical local theo `TESTCASE_SOURCE`**: mặc định `xray` (đã kéo về `test-cases/from-xray/*.xlsx`), hoặc `excel` (`test-cases/*.xlsx`). Không gọi Jira/Xray từng case lúc execute.
- Không đổi expected result nếu chưa chứng minh expected cũ sai.
- Skip chỉ hợp lệ khi có lý do rõ, không thể tránh và đã phân tích cách fix.
- Với bug phức tạp, nếu ảnh không đủ mô tả behavior thì phải có video evidence.
- Jira chỉ được log khi case đã rerun đủ để loại flaky/setup/data/prompt issue và có evidence rõ.
- Shared file chỉ được sửa khi qua Shared Change Gate.
- Task-scoped automation chỉ promote vào core regression khi có review/approval rõ.

## Completion Gate

Phase 2 chỉ hoàn tất khi có đủ:

- Tổng số case execute/pass/fail/skip.
- Danh sách skip và lý do.
- Danh sách fail đã phân loại product bug hay non-product issue.
- Evidence không trắng, đúng testcase.
- Execution summary cập nhật bằng tiếng Việt chuẩn.
- Shared change log và automation promotion status được ghi rõ.
