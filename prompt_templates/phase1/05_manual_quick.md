# Prompt Phase 1 - Manual QUICK (sinh nhanh testcase thủ công)

> Chạy: `Đọc file này và chạy với TASK_KEY=<TASK_KEY>`. Tuân thủ `RULE_GLOBAL.md` và `.agent/rules/`.
> Nhánh nhẹ, thân thiện manual — KHÔNG thay pipeline chính (01→04). Dùng khi cần bộ TC để **chạy tay**.

# Khi nào dùng

- Requirement đã RÕ (không có mơ hồ Critical/High) và cần bộ testcase để **QA chạy tay** nhanh, không nhắm automation Phase 2.
- Smoke/khám nhanh một màn/flow; hoặc case bản chất manual (`Manual-only`: thao tác vật lý, file thật rất lớn, tương tác ngoài tầm automation).

**KHÔNG dùng khi:** requirement còn mơ hồ → chạy pipeline chính (Ambiguity Gate ở `phase1_01`); hoặc cần TC đủ chi tiết cho automation → dùng `02_gen_testcases.md`.

# Nguyên tắc (giữ governance)

- Vẫn **không placeholder** ở Dữ liệu Test; expected phải **cụ thể, trích từ tài liệu** (không lấy từ build — chống tautological).
- Tiền điều kiện ghi dạng **thao tác tay** mà QA tự dựng được (KHÔNG cần factory/hook/Setup Strategy contract của automation).
- Expected viết **gọn, đủ để người đọc phán PASS/FAIL** — không cần chi tiết từng micro-step như bản automation.
- Vẫn phủ đủ 4 loại (Positive/Negative/Boundary/Edge) ở mức hợp lý theo risk; không cần vét 16 dimension như automation.
- Nếu trong lúc viết phát hiện mơ hồ Critical/High → DỪNG, chuyển pipeline chính (Ambiguity Gate). Manual QUICK không bỏ qua checkpoint.

# Template manual (có cột thực thi tay)

| TC ID | Nhóm chức năng | Trường hợp kiểm thử | Tiền điều kiện | Dữ liệu Test | Các bước | Kết quả mong đợi | Ưu tiên | Kết quả thực tế | Pass/Fail | Ghi chú |
|---|---|---|---|---|---|---|---|---|---|---|

- `Nhóm chức năng`: business flow (như pipeline chính: `Đăng nhập`, `Tạo`, `Thanh toán`...).
- `Kết quả thực tế` / `Pass/Fail` / `Ghi chú`: **để trống khi sinh** — QA điền lúc chạy tay.
- Header file ghi: `Tester: ______  Ngày chạy: ______  Môi trường/URL: ______`.
- TC ID format như chính: `[PROJECT]_[MODULE]_TC_[NNN]`.

# Workflow

1. Xác nhận requirement rõ (nếu mơ hồ Critical/High → dừng, chuyển pipeline chính).
2. Sinh TC theo template manual ở trên, phủ Positive/Negative/Boundary/Edge theo risk.
3. Lưu Markdown: `<TASK_OUTPUT_DIR>/test-cases/<basename>_manual.md`.
4. Export Excel: `node scripts/convert_excel/md_to_xlsx.js <...>_manual.md <...>_manual.xlsx` — file có sẵn cột thực thi để QA điền.
5. Ghi 1 dòng vào `task.md`: đường dẫn bộ manual + ghi rõ đây là **manual QUICK** (không phục vụ Phase 2 automation trừ khi được nâng cấp qua `02_gen_testcases.md` + `tc_validator`).

# Outputs

| Output | Vị trí |
|---|---|
| Testcase manual Markdown | `<TASK_OUTPUT_DIR>/test-cases/<basename>_manual.md` |
| Testcase manual Excel (có cột thực thi) | Cùng thư mục, cùng basename |
| Task tracking | `<TASK_OUTPUT_DIR>/task.md` |

# Nâng cấp lên automation (khi cần)

Bộ manual QUICK **chưa tính vào coverage automation**. Muốn tính: đưa qua `02_gen_testcases.md` (bổ sung Setup Strategy contract + expected chi tiết) và `tc_validator` như testcase thường.
