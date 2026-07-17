# Re-run - Bước 1: Mapping Bug Với Testcase

> Xác định bug còn mở và testcase/spec cần chạy lại.

## Mục Đích

Đảm bảo chỉ rerun đúng bug/case liên quan tới fix, không chạy nhầm hoặc bỏ sót mapping.

## Workflow

1. Nhận Jira bug key, story key hoặc task scope.
2. Nếu yêu cầu hiện tại không nêu rõ `TASK_KEY`, không dùng `TASK_KEY` từ `.env` hoặc context cũ để chạy; phải hỏi lại.
3. Tìm mapping trong:
   - `task.md`
   - `reports/execution-summary.md`
   - Jira bug log local
   - User input
4. Lấy danh sách bug còn mở trong scope nếu Jira credential sẵn sàng.
5. Loại bug đã Done khỏi scope, trừ khi user yêu cầu re-verify.
6. Xác định TC ID/spec/endpoint cần rerun.

## Rules

- Không hỏi user ngay nếu mapping có thể tìm trong artifact local.
- Không rerun toàn bộ suite nếu mapping targeted đã đủ.
- Không xử lý thay đổi tài liệu nguồn trong Re-run.

## Outputs

| Output | Vị trí |
|---|---|
| Bug-to-TC mapping | Rerun report hoặc `task.md` |
| Target Re-run list | Re-run report |
