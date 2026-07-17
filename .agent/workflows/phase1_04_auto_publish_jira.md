# Phase 1 - Bước 4: Auto Publish Jira

> Publish testcase từ Excel source of truth lên Jira sau khi QA xác nhận. Đây là step riêng trong phạm vi Phase 1, không chạy chung với bước sinh testcase.

## Mục Đích

Đẩy testcase đã được QA xác nhận từ Excel lên Jira/Xray. Excel là source of truth khi gen/publish; **publish là bước cần TRƯỚC Phase 2** vì Phase 2 execute mặc định lấy nguồn từ Xray (`TESTCASE_SOURCE=xray`).

## Preconditions

| Điều kiện | Bắt buộc |
|---|---|
| Excel testcase đã export | Có |
| `phase1-summary.md` đã có Final Decision | Có |
| QA confirmation rõ ràng | Có |
| Jira config/token đủ quyền | Có nếu publish thật |
| Dry-run preview | Khuyến nghị trước publish thật |

## Workflow

1. Echo scope:
   - `PROJECT_OUTPUT_DIR`
   - `TASK_KEY`
   - `TASK_OUTPUT_DIR`
   - phase: `Phase 1 - Auto Publish Jira`
2. Xác nhận QA đã approve Excel/testcase:
   - Nếu prompt/user không ghi rõ `QA confirmation: APPROVED`, chỉ chạy dry-run hoặc dừng chờ xác nhận.
   - Không tự suy diễn approval từ việc Excel tồn tại.
3. Đọc Excel canonical:
   - `<TASK_OUTPUT_DIR>/test-cases/*.xlsx`
   - Ưu tiên sheet `Test Cases`.
   - Test management tool là Xray, nên publish mặc định thành issue type `Test`.
4. Chạy dry-run:
   ```powershell
   npm run jira:testcase-publish:dry-run -- --project-output <PROJECT_OUTPUT_DIR> --task <TASK_KEY> --story <JIRA_STORY_KEY>
   ```
5. Chỉ publish thật khi QA/user xác nhận mode `PUBLISH`:
   ```powershell
   npm run jira:testcase-publish -- --project-output <PROJECT_OUTPUT_DIR> --task <TASK_KEY> --story <JIRA_STORY_KEY> --publish --qa-approved
   ```
6. Cập nhật `task.md` và ghi publish summary.
7. Với mỗi Xray `Test` issue đã tạo hoặc đã tồn tại, link về đúng Jira Story/Task bằng `XRAY_REQUIREMENT_LINK_TYPE` (mặc định `Tests`).
8. Nếu bật `XRAY_TEST_SET_ENABLED=1` hoặc CLI `--with-test-sets`, tạo/tái sử dụng Xray `Test Set` theo business flow trong cột `Module`, rồi gắn Test vào Test Set tương ứng.

## Rules

- Không publish từ Markdown khi Excel đã tồn tại.
- Không publish thật nếu thiếu QA confirmation.
- Không sửa nội dung testcase trực tiếp trên Xray; authoring ở Excel rồi re-publish (Phase 2 execute đọc bản đã publish từ Xray là bình thường).
- Với Xray, publish thành Xray `Test` issue; nếu Jira bắt field `Test Type`, cấu hình `XRAY_TEST_TYPE_FIELD_ID`.
- Mỗi Xray `Test` issue phải link về Story/Task như `SAPP-3255`; nếu link type khác mặc định, cấu hình `XRAY_REQUIREMENT_LINK_TYPE`.
- Test Set theo business flow là optional; nếu bật, mỗi nhóm chính trong `Module` có một Xray `Test Set` để QA lọc/review theo luồng nghiệp vụ.
- Nếu Excel bỏ bớt TC sau publish, không xử lý trong step này; chạy `partial-rerun/run_xray_test_cleanup.md` sau Human Review/QA approval để label stale/restore, không hard delete.
- Không log Jira bug trong step này; bug logging thuộc Phase 2.
- Nếu publish lỗi một phần, giữ Excel canonical và ghi rõ lỗi trong report local.

## Outputs

| Output | Vị trí |
|---|---|
| Publish JSON | `<TASK_OUTPUT_DIR>/reports/jira-testcase-publish.json` |
| Publish summary | `<TASK_OUTPUT_DIR>/reports/jira-testcase-publish-summary.md` |
| Task tracking update | `<TASK_OUTPUT_DIR>/task.md` |
