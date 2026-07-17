# Phase 1 - Bước 1: Chuẩn Bị Context

> Xác nhận scope và thu thập đủ nguồn requirement/design/API trước khi sinh testcase.

## Mục Đích

Đảm bảo agent hiểu đúng task, project output, nguồn tài liệu và phạm vi kiểm thử trước khi tạo testcase.

## Inputs

| Input | Nguồn |
|---|---|
| `TASK_KEY` | User prompt hoặc env |
| `PROJECT_OUTPUT_DIR` | Env hoặc `.agent/config/project_context.md` |
| Requirement/story | Jira, Confluence hoặc artifact local |
| UI/API spec | Figma, Swagger/OpenAPI hoặc artifact local |

## Workflow

1. Echo lại `PROJECT_OUTPUT_DIR`, `TASK_KEY`, `TASK_OUTPUT_DIR`.
2. Nếu yêu cầu hiện tại không nêu rõ `TASK_KEY`, không dùng `TASK_KEY` từ `.env` hoặc context cũ để chạy; phải hỏi lại.
3. Đọc `.agent/config/project_context.md` nếu có.
4. Đọc artifact local trước:
   - `<TASK_OUTPUT_DIR>/task.md`
   - `<TASK_OUTPUT_DIR>/requirements/`
   - `<TASK_OUTPUT_DIR>/reports/phase1-summary.md` nếu đã có
5. Chỉ fetch Jira/Confluence/Figma/Swagger khi artifact local thiếu hoặc user yêu cầu refresh.
6. Xác định in-scope requirement/business rule/API behavior.
7. Ghi assumption/open question nếu requirement mâu thuẫn hoặc thiếu dữ liệu bắt buộc.

## Rules

- Không sửa `.env` chung khi có thể truyền env theo command.
- Không fetch lại toàn bộ tài liệu nếu snapshot/local summary đã đủ.
- Không tự chuyển sang `partial-rerun`; chỉ dùng nhánh đó khi user yêu cầu xử lý tài liệu đã đổi.

## Outputs

| Output | Vị trí |
|---|---|
| Requirement artifact/cache | `<TASK_OUTPUT_DIR>/requirements/` |
| Context summary | `<TASK_OUTPUT_DIR>/task.md` hoặc `phase1-summary.md` |
| Open questions | `task.md` hoặc Phase 1 summary |
