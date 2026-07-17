# Prompt Phase 2 - Phân tích và rà soát kết quả

> Chạy: `Đọc file này và chạy với TASK_KEY=<TASK_KEY>`. Tuân thủ `RULE_GLOBAL.md` và `.agent/rules/`.

Dùng prompt này khi cần review nhanh automation code sau khi generate/heal trong Phase 2. Không dùng như một bước bắt buộc nếu suite đã pass ổn và không có thay đổi shared layer.

```text
Review automation code Playwright TypeScript theo hướng phát hiện rủi ro thực tế.

Input:
- Task key: [TASK_KEY]
- Project output: [PROJECT_OUTPUT_DIR]
- File/spec/helper cần review: [FILES_OR_SCOPE]
- Lý do review: [NEW_AUTOMATION / HEAL_LOCATOR / FAIL_TRIAGE / SHARED_HELPER_CHANGE]

Nguyên tắc tiết kiệm token:
- Chỉ đọc file được chỉ định và các dependency trực tiếp.
- Nếu review lỗi fail, đọc `results.json`/`error-context.md` đúng TC fail trước, không đọc full Playwright report.
- Không paste full source/diff vào report; ghi file, dòng, vấn đề, mức độ, cách sửa.
- Không mở framework hoặc rule ngoài Playwright trừ khi user yêu cầu rõ.

Checklist review:
1. Test có assertion đủ để validate expected result không?
2. Có pass ảo do skip, mock sai mục đích, thiếu assertion hoặc đổi expected không?
3. Locator có ổn định theo priority Playwright không?
4. Wait có dùng condition/autowait thay vì hard wait không?
5. Test data có unique, traceable, cleanup/rollback được không?
6. Setup/auth/dependency có khiến test flaky hoặc skip không?
7. Shared helper thay đổi có cần targeted regression thêm không?
8. Evidence fail/pass có ảnh/video hợp lệ và không trắng không?
9. Có secret/token/password/cookie bị ghi ra code/report/log không?

Output local:
- Ghi findings vào `<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/reports/triage-review.md` hoặc report rerun tương ứng nếu đang rerun.
- Findings theo bảng: `Mức độ | File/Dòng | Vấn đề | Tác động | Đề xuất sửa`.
- Nếu không có issue nghiêm trọng, ghi rõ còn residual risk nào.

Output cho user:
- Tối đa 8 bullet, ưu tiên bug/risk high trước.
```
