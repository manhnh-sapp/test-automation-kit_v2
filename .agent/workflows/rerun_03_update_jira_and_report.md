# Re-run - Bước 3: Cập Nhật Jira Và Report

> Chuyển Jira bug sang Done khi PASS thật, hoặc ghi rõ fail/blocker nếu chưa đạt.

## Mục Đích

Giữ Jira và local report đồng bộ với kết quả re-run thật, có evidence ảnh/video.

## Workflow

1. Nếu PASS thật:
   - Upload/add evidence ảnh/video.
   - Comment Jira bằng tiếng Việt, ngắn gọn, nêu TC đã pass và evidence.
   - Transition Jira bug sang Done bằng transition hợp lệ.
   - Cập nhật local rerun report.
   - Đồng bộ Knowledge Base (skill `learning_recorder`, Suggest-only): cập nhật `knowledge/bugs/<...>.json` → `jira_status: "Done"`; nếu bug có `root_cause_ref`, cập nhật `knowledge/root_causes/<slug>.json` → `status: "resolved"` + `resolved_at` (ISO date); cập nhật `knowledge/index.json`. Chỉ cập nhật entry đã tồn tại, không tạo mới ở bước rerun.
2. Nếu FAIL/SKIP/blocker:
   - Không chuyển Done.
   - Ghi nguyên nhân và evidence local.
   - Không comment Jira mặc định trừ khi user yêu cầu.
3. Nếu còn bug mở trong scope:
   - Ghi danh sách còn mở.
   - Chờ Dev fix tiếp rồi lặp lại Re-run.

## Rules

- Jira evidence chỉ là `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.mp4`, `.webm`.
- Không upload `.md`, `.txt`, `.log`, `.json`, `.zip`, trace raw hoặc execution summary.
- Không sửa Jira description trong Re-run trừ khi user yêu cầu rõ.
- Nếu thiếu Jira permission/credential, ghi blocker local thay vì giả lập đã Done.

## Outputs

| Output | Vị trí |
|---|---|
| Jira comment/transition | Jira bug |
| Re-run summary | `<TASK_OUTPUT_DIR>/reports/rerun/` |
| Updated task tracking | `<TASK_OUTPUT_DIR>/task.md` |
| Knowledge Base đồng bộ trạng thái | `knowledge/bugs/`, `knowledge/root_causes/`, `knowledge/index.json` (khi bug → Done) |
