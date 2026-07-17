# Re-run - Bước 2: Chạy Lại Và Verify

> Chạy lại testcase liên quan tới bug đã fix và xác minh PASS/FAIL/SKIP.

## Mục Đích

Xác nhận fix của Dev bằng execution thật, evidence rõ và không pass ảo.

## Workflow

1. Chạy targeted test theo TC ID/spec/endpoint đã mapping.
2. Capture evidence:
   - Ảnh cho case đơn giản.
   - Video cho flow phức tạp hoặc ảnh không đủ chứng minh behavior.
3. Phân loại kết quả:
   - PASS thật.
   - FAIL còn lỗi product.
   - FAIL do setup/automation/data.
   - SKIP/blocker.
4. Nếu fail do automation/setup/data, sửa root cause hợp lý và rerun targeted.
5. Không chuyển Jira Done nếu chưa PASS thật.

## Rules

- Không bỏ assertion để đạt PASS.
- Không đổi expected result nếu chưa có requirement xác nhận.
- Không coi SKIP là PASS.
- Evidence phải là ảnh/video không trắng và đúng bug/case.

## Outputs

| Output | Vị trí |
|---|---|
| Re-run result | `<TASK_OUTPUT_DIR>/reports/rerun/` hoặc run folder |
| PASS/FAIL evidence | `<TASK_OUTPUT_DIR>/test-results/` |
| Classification | Rerun report |
