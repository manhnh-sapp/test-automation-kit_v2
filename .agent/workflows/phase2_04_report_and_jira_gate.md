# Phase 2 - Bước 4: Report, Promote Review Và Jira Gate

> Tổng hợp kết quả execute, ghi shared change/promotion status và chỉ log Jira bug khi case fail đủ điều kiện.

## Mục Đích

Tạo report Phase 2 rõ ràng, không log bug sai do setup/prompt/test data, không upload evidence sai loại lên Jira và không âm thầm đưa task automation vào regression suite chung.

## Workflow

1. Ghi execution summary:
   - Tổng case.
   - PASS/FAIL/SKIP.
   - Pass rate thô + **unassisted pass rate** (loại các case cần người can thiệp giữa chừng).
   - **Autonomy log**: số vòng execute + số lần nhờ người cấp input (account/URL/data/xác nhận tay); nếu 0 ghi rõ.
   - Lý do skip.
   - Fail classification.
   - **Blocker root cause** cho mỗi SKIP/BLOCKED: `needs_hook`/`needs_account`/`needs_sandbox`/`spec_mismatch`/`manual_inherent`/`external_dependency` + owner/route (skill `precondition_setup_planner`).
   - Lỗi đã sửa.
   - Rủi ro còn lại.
2. Ghi Shared Change Log:
   - Nếu không sửa shared file, ghi `Không sửa shared file`.
   - Nếu có sửa, ghi file đã sửa, lý do, story có thể bị ảnh hưởng và regression scope đã chạy/chưa chạy.
3. Ghi Automation Promotion Status:
   - `Not requested`
   - `Pending review`
   - `Approved and promoted`
   - `Rejected/Deferred`
4. Với từng fail nghi product bug, kiểm tra gate:
   - Đã execute thật.
   - Đã rerun đủ để loại flaky/setup/data/prompt issue.
   - Expected result đã xác nhận đúng.
   - Actual result có evidence rõ.
5. Chạy Jira dry-run trước.
6. Chỉ log Jira thật khi user yêu cầu hoặc prompt hiện tại cho phép.
7. Jira description chỉ gồm:
   - Tiền điều kiện.
   - Bước.
   - Kết quả hiện tại.
   - Kết quả mong muốn.
8. Evidence upload lên Jira chỉ là ảnh/video.

## Rules

- Không log Jira cho case skip.
- Không log Jira nếu fail do prompt/test/setup chưa chuẩn.
- Không upload `.md`, `.txt`, `.log`, `.json`, `.zip`, `trace.zip` hoặc execution summary lên Jira.
- Không tự comment Jira nếu workflow không yêu cầu comment.
- Không promote task-scoped automation vào `tests/fe/` hoặc `tests/api/` nếu chưa có review/approval rõ.

## Outputs

| Output | Vị trí |
|---|---|
| Execution summary | `<TASK_OUTPUT_DIR>/reports/execution-summary.md` (gồm unassisted pass rate + autonomy log + blocker root-cause) |
| Capability gap cập nhật | `<TASK_OUTPUT_DIR>/reports/capability-request.md` (nếu Phase 2 phát hiện thêm `needs_hook`/`needs_account`/`needs_sandbox`) |
| Shared change log | Trong execution summary |
| Automation promotion status | Trong execution summary |
| Jira dry-run result | Report liên quan |
| Jira bug log nếu có | Execution summary hoặc local bug log |
