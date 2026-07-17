---
description: Workflow Re-run sau khi Dev fix Jira bug; chỉ chạy lại bug/case liên quan và cập nhật Jira khi PASS thật.
skills:
  - phase2/flaky_test_analyzer
  - shared/jira_integration
---

# Workflow Re-run - Chạy Lại Bug Đã Fix

> File tổng quan cho luồng Re-run chính. Không dùng file này để xử lý thay đổi tài liệu nguồn.

## Mục Đích

Chạy lại các testcase liên quan tới bug Jira đã được Dev fix, xác minh PASS thật bằng evidence và chuyển Jira bug sang Done khi đủ điều kiện.

## Khi Nào Dùng

| Trường hợp | Dùng workflow này |
|---|---|
| Dev báo bug đã fix | Có |
| Cần rerun case fail trước đó | Có |
| Cần chuyển Jira bug sang Done nếu PASS | Có |
| Tài liệu requirement/design/API đổi nội dung | Không, dùng `partial-rerun` khi user yêu cầu |
| Cần chạy full Phase 2 cho story mới | Không, dùng Phase 2 |

## Inputs

| Input | Nguồn |
|---|---|
| Jira bug key | User prompt, task report hoặc Jira bug log |
| TC mapping | `task.md`, `execution-summary.md`, Jira bug log |
| Existing automation | `tests/fe/`, `tests/api/` hoặc task-scoped spec |
| Runtime env | `.env.local`, `.env`, CI env hoặc env truyền trực tiếp |

## Outputs

| Output | Vị trí |
|---|---|
| Rerun result | `<TASK_OUTPUT_DIR>/reports/rerun/` hoặc `reports/runs/<RUN_ID>/` |
| PASS evidence | Ảnh/video trong task output |
| Jira update | Comment evidence ảnh/video và transition Done nếu PASS thật |
| Local summary | `task.md` hoặc rerun report |

## Workflow

| Thứ tự | Step file | Mục tiêu |
|---:|---|---|
| 1 | [rerun_01_map_bug_to_testcase.md](rerun_01_map_bug_to_testcase.md) | Xác định bug còn mở và mapping tới TC/spec cần rerun. |
| 2 | [rerun_02_rerun_and_verify.md](rerun_02_rerun_and_verify.md) | Re-run targeted, phân loại PASS/FAIL/SKIP và capture evidence. |
| 3 | [rerun_03_update_jira_and_report.md](rerun_03_update_jira_and_report.md) | Cập nhật Jira Done khi PASS thật hoặc ghi blocker/fail nếu chưa đạt. |

## Rules

- Không rerun bug đã Done trừ khi user yêu cầu re-verify.
- Không chạy full suite mặc định nếu chỉ cần bug/TC targeted.
- Không chuyển Jira sang Done nếu case skip, chạy thiếu bước hoặc evidence không đủ.
- Evidence comment Jira chỉ dùng ảnh/video, không upload `.md`, `.txt`, `.log`, `.json`, `.zip` hoặc trace raw.
- Nếu FAIL/SKIP, không comment Jira mặc định trừ khi user yêu cầu rõ.

## Completion Gate

Re-run chỉ hoàn tất khi:

- Bug trong scope đã được rerun targeted.
- PASS thật có evidence ảnh/video và Jira đã Done; hoặc
- FAIL/SKIP/blocker được ghi rõ để Dev/QA xử lý tiếp.
