# Markdown To Excel Converter

> Convert testcase Markdown sang Excel `.xlsx` có summary và sheet theo nhóm chức năng.

## Purpose

Script `md_to_xlsx.js` giúp QA review testcase dễ hơn bằng Excel mà vẫn giữ Markdown là source chính.

## When To Use

| Scenario | Use Converter |
|---|---|
| Sau khi Phase 1 sinh testcase Markdown | ✅ |
| Khi cần gửi testcase cho QA Lead/BA review | ✅ |
| Khi testcase Markdown không có bảng `TC ID` | ❌ |

## Inputs

| Input | Required | Notes |
|---|---|---|
| `<input.md>` | Yes | Markdown chứa bảng testcase có cột `TC ID`. |
| `[output.xlsx]` | No | Nếu bỏ trống, script tự sinh cùng basename với input. |
| `exceljs` dependency | Yes | Cài bằng `npm install` ở root repo. |

## Outputs

| Output | Description |
|---|---|
| `.xlsx` file | File Excel được format sẵn. |
| Sheet `Summary` | Tổng hợp số testcase theo nhóm. |
| Sheet `Test Cases` | Toàn bộ testcase. |
| Sheet theo nhóm | Tạo theo nhóm chức năng nếu converter hỗ trợ. |

## Workflow

| Step | Action |
|---:|---|
| 1 | Đọc Markdown testcase. |
| 2 | Parse bảng có cột `TC ID`. |
| 3 | Suy luận hoặc thêm cột `Nhóm chức năng`. |
| 4 | Tạo workbook Excel. |
| 5 | Format sheet và ghi file `.xlsx`. |

## Rules

- File Markdown phải có bảng testcase hợp lệ.
- Không đổi nội dung testcase khi export.
- Nếu thiếu cột `Nhóm chức năng`, converter suy luận từ cột `Module` hoặc tên testcase.
- Excel output phải nằm cùng thư mục testcase khi chạy trong Phase 1.

## Examples

| Use Case | Command |
|---|---|
| Auto output path | `node scripts/convert_excel/md_to_xlsx.js <PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/test-cases/ui/test_cases.md` |
| Explicit output path | `node scripts/convert_excel/md_to_xlsx.js <PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/test-cases/ui/test_cases.md <PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/test-cases/ui/test_cases.xlsx` |

## Output Formatting

| Feature | Enabled |
|---|---|
| Auto column widths | ✅ |
| Freeze header row | ✅ |
| AutoFilter | ✅ |
| Bold header | ✅ |
| Wrap text for steps/expected | ✅ |
| Convert `<br>` to cell newline | ✅ |
| Add functional group column | ✅ |

## References

| Document | Purpose |
|---|---|
| `prompt_templates/phase1/02_gen_testcases.md` | Phase 1 testcase format and Excel export rule. |
| `prompt_templates/run_phase1_template.md` | End-to-end Phase 1 execution prompt. |
