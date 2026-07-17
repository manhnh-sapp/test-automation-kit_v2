---
name: jira_bug_reporter
description: Log Jira sub-bug từ testcase FAIL đã xác nhận sau Phase 2.
---

# Jira Bug Reporter

## Purpose

Tạo Jira child issue/sub-bug khi Phase 2 đã chứng minh fail là product/API bug, có expected/actual/evidence rõ và không phải lỗi test/setup.

## Responsibilities

| Trách nhiệm | Yêu cầu |
|---|---|
| Gate | Chỉ log khi fail đã execute thật và rerun đủ để loại flaky/setup. |
| Deduplicate | So sánh bug hiện có bằng TC ID, summary, actual behavior. |
| Description | Jira description chỉ gồm 4 phần: Tiền điều kiện, Bước, Kết quả hiện tại, Kết quả mong muốn. |
| Evidence | Upload ảnh/video; cấm `.json/.md/.txt/.log/.html/.csv/trace.zip`. |
| Local log | Ghi kết quả vào report local. |

## Inputs

| Input | Nguồn |
|---|---|
| Results | `<TASK_OUTPUT_DIR>/test-results/results.json` hoặc run-scoped path |
| Evidence | `test-results/artifacts/` |
| Testcase | `test-cases/` |
| Jira parent | `JIRA_STORY_KEY` hoặc CLI `--story` |

## Outputs

| Output | Vị trí |
|---|---|
| Jira sub-bug | Jira project configured by env |
| Local bug log | `<TASK_OUTPUT_DIR>/reports/` hoặc `reports/runs/<RUN_ID>/` |

## Decision Rules

- Không log nếu testcase đang `SKIP`.
- Không log nếu fail do prompt/test/setup/data/env/dependency/mock/timeout/locator.
- Không log nếu chưa xác nhận expected result đúng.
- Không log nếu evidence ảnh/video thiếu hoặc trắng với bug cần visual proof.
- Nếu bug trùng bug đã có, không tạo mới; ghi mapping vào report.

## Script

```bash
node scripts/integrations/jira/bug_reporter.js --dry-run --task <TASK_KEY> --story <JIRA_STORY_KEY> --project-output <PROJECT_OUTPUT_DIR>
node scripts/integrations/jira/bug_reporter.js --task <TASK_KEY> --story <JIRA_STORY_KEY> --project-output <PROJECT_OUTPUT_DIR>
```

## Anti-Patterns

- Log Jira từ partial-rerun trực tiếp.
- Log Jira cho fail chưa rerun/xác minh.
- Đưa execution summary hoặc markdown vào Jira description.
- Comment Jira tự động nếu user không yêu cầu hoặc không phải Re-run PASS flow.
