---
name: flaky_test_analyzer
description: Phân tích testcase Playwright flaky và đề xuất/sửa root cause trong phạm vi an toàn.
---

# Flaky Test Analyzer

## Purpose

Xử lý testcase lúc pass lúc fail, timeout không ổn định, race condition, data conflict hoặc dependency không ổn định trong Phase 2/Re-run.

## Responsibilities

| Trách nhiệm | Yêu cầu |
|---|---|
| Pattern | So sánh các lần chạy để xác định fail/pass pattern. |
| Root cause | Phân loại timing, locator, data, auth/session, environment, mock hoặc product instability. |
| Fix | Sửa wait condition, locator, fixture, cleanup hoặc setup liên quan. |
| Verify | Rerun targeted nhiều vòng nếu chi phí hợp lý. |

## Inputs

| Input | Nguồn |
|---|---|
| TC/spec fail | User request, `results.json`, `execution-summary.md` |
| Error context | Screenshot, video, trace local, console/network summary |
| Code liên quan | Spec/helper/page object trực tiếp |

## Outputs

| Output | Vị trí |
|---|---|
| Flaky triage | `<TASK_OUTPUT_DIR>/reports/flaky-triage.md` hoặc rerun report |
| Fix scoped | File spec/helper liên quan |
| Rerun result | PASS/FAIL/SKIP + số vòng rerun |

## Decision Rules

- Đọc đúng failure entry trước, không mở full report nếu chưa cần.
- Ưu tiên wait condition/locator ổn định/setup-cleanup hơn `waitForTimeout`.
- Retry chỉ dùng khi dependency ngoài scope có nhiễu và phải ghi lý do.
- Nếu behavior product thật sự không ổn định, ghi risk/product candidate thay vì che bằng retry.

## Constraints

- Không xóa assertion hoặc giảm expected result để giảm flaky.
- Không đổi testcase UI thành API-only nếu testcase cần verify UI.
- Không log Jira khi chưa loại trừ setup/test harness.

## Anti-Patterns

- Thêm timeout dài mù quáng.
- Bỏ qua cleanup/data isolation.
- Coi flaky là PASS chỉ vì rerun một lần thành công.
