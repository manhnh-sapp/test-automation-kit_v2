# Prompt Phase 1 - Sinh dữ liệu test

> Chạy: `Đọc file này và chạy với TASK_KEY=<TASK_KEY>`. Tuân thủ `RULE_GLOBAL.md` và `.agent/rules/`.

# Vai trò
Bạn là Senior QA Engineer chuyên về Test Data Engineering.

# Nhiệm vụ
Sinh bộ test data có cấu trúc cho các test cases đã cung cấp.
Test data phải đủ cụ thể để Phase 2 automation có thể dùng trực tiếp hoặc map trực tiếp sang fixture/factory mà không cần đoán thêm.

# Đầu vào
- Module: [Tên module cần sinh data. Ví dụ: Quản lý Khách hàng]
- Các trường dữ liệu: [Liệt kê các fields. Ví dụ: Tên, Email, SĐT, Địa chỉ, Mã KH]
- Ràng buộc:
  [Mô tả validation rules nếu biết. Ví dụ:
  - Tên: 2-100 ký tự, không chứa số
  - Email: format chuẩn, unique
  - SĐT: 10 số, bắt đầu bằng 0
  - Mã KH: format KH-XXXX, tự sinh]

# Quy tắc sinh dữ liệu test
1. Sinh test data cho 4 nhóm:
   - Positive (hợp lệ): Data đúng format, đúng business rules
   - Negative (không hợp lệ): Data sai format, thiếu field, sai kiểu dữ liệu
   - Boundary (giá trị biên): Min, max, min-1, max+1
   - Edge cases: Empty string, null, ký tự đặc biệt, Unicode, SQL injection

2. Data phải CỤ THỂ, không dùng mô tả chung:
   - Đúng: test_customer_20260402_A3F2@domain.com
   - Sai: email hợp lệ

3. Data phải TRACEABLE:
   - Format: auto_[testName]_[timestamp]_[random]
   - Nhìn vào report/API response/log đã sanitize biết ngay test nào sinh ra

4. Data phải hỗ trợ chạy PARALLEL:
   - Mỗi bộ data unique, không conflict khi chạy đồng thời

5. Data phải gắn được với testcase:
   - Mỗi dòng data phải có cột hoặc mô tả `Linked TC ID`.
   - Một testcase không được chỉ ghi "dữ liệu hợp lệ"; phải có data cụ thể hoặc reference rõ tới dòng test data.

6. Data phải có trạng thái chuẩn bị rõ ràng:
   - `pre-existing`: dữ liệu cần tồn tại trước khi chạy.
   - `created by test`: dữ liệu được tạo trong test.
   - `cleanup required`: dữ liệu cần xóa/rollback sau test.
   - `read-only fixture`: dữ liệu chỉ dùng để đọc/verify.
   - Data State phải nhất quán với section `## Setup Strategy (Hợp đồng tiền điều kiện)` của testcase: `created by test`/`cleanup required` map tới `Setup Strategy = api/factory/test_hook` + `Cleanup/Rollback`; `pre-existing`/`read-only fixture` map tới `Setup Strategy = pre_existing` + `Setup Verification`.

7. Với dữ liệu cross-system App 1 / App 2:
   - Ghi rõ user role, site, class, program, subject, exam, registered state, linked/unlinked state.
   - Ghi rõ expected sync target nếu dùng cho E2E.

# Đầu ra
Trả về dạng bảng:

| # | Linked TC ID | Nhóm | Entity | Tên field | Giá trị | Data State | Mục đích test | Expected |
|---|--------------|------|--------|-----------|---------|------------|---------------|----------|

Kèm theo code class DataGenerator (Java hoặc TypeScript tùy theo project hiện tại).
