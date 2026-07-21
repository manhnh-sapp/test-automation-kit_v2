---
name: combinatorial_matrix
description: Sinh ma trận tổ hợp (Pairwise mặc định) từ các chiều (dimensions) + values + constraints, map expected cho từng bộ. Chống nổ case — KHÔNG full Cartesian mặc định. Dùng cho cross-module/nhiều biến kết hợp.
---

# Combinatorial Matrix

## Purpose

Khi một chức năng phụ thuộc **nhiều biến độc lập** (vd loại sản phẩm × phương thức thanh toán × role × trạng thái) mà test rời từng biến bỏ lọt bug tương tác, skill này sinh **ma trận tổ hợp có kiểm soát** + map expected cho từng bộ. Áp cho cả cross-module (dữ liệu chảy qua nhiều màn/hệ thống).

## Nguyên tắc chống nổ case (BẮT BUỘC)

Kit ưu tiên "theo tỉ lệ", KHÔNG nhân bừa (đồng bộ mục 13 dropdown "1 case đại diện"). Vì vậy:

- **Mặc định = Pairwise (all-pairs)**: phủ mọi CẶP giá trị giữa 2 chiều bất kỳ — bắt phần lớn bug tương tác với số bộ nhỏ hơn nhiều Cartesian.
- **Business-critical combos**: thêm thủ công các bộ quan trọng/nguy hiểm dù pairwise đã đủ (vd tổ hợp tiền + refund + role cao).
- **Full Cartesian CHỈ khi**: số chiều nhỏ + tổ hợp ít + rủi ro cao rõ ràng, và **ghi lý do**. Không dùng làm mặc định.
- **Constraints để loại bộ vô nghĩa**: cặp giá trị không thể xảy ra cùng nhau (vd `payment=Free` ⇒ không có `installment`) phải khai báo để loại khỏi ma trận, tránh sinh bộ rác.

## Inputs

| Input | Nguồn |
|---|---|
| Dimensions + values | Requirement/FS/Swagger (mỗi biến độc lập + tập giá trị hợp lệ) |
| Constraints | Rule loại trừ cặp giá trị bất khả (từ FS/business rule) |
| Expected oracle | FS/tài liệu (KHÔNG lấy từ build — chống tautological) |
| Strategy | `pairwise` (mặc định) / `business-critical` / `full` (kèm lý do) |

## Workflow

1. **Liệt kê dimensions** trong scope + tập giá trị mỗi chiều; đánh dấu chiều nào tương tác thật (ảnh hưởng kết quả lẫn nhau).
2. **Khai báo constraints** loại cặp bất khả.
3. **Sinh ma trận** theo strategy: pairwise mặc định; thêm business-critical combos; full chỉ khi đủ điều kiện + ghi lý do.
4. **Map expected cho từng bộ** từ oracle độc lập (tự tính/trích tài liệu), phân biệt bộ hợp lệ vs bộ bị chặn.
5. Ghi rõ **số bộ đã sinh vs số Cartesian lý thuyết** (minh bạch mức cắt giảm) + constraints đã loại.

## Outputs

| Output | Vị trí |
|---|---|
| Ma trận tổ hợp + expected | `<TASK_OUTPUT_DIR>/test-cases/<basename>_matrix.md` (bảng: mỗi hàng 1 bộ → expected) |
| Ghi chú strategy/cắt giảm | Đầu file matrix + Coverage Gaps của `phase1-summary.md` |

Mỗi hàng ma trận là 1 testcase → export Excel + publish Xray dùng chung script hiện có (`scripts/convert_excel/md_to_xlsx.js`, `publish_testcases.js`), vào đúng nhóm chức năng.

## Decision Rules

- Pairwise là mặc định; full Cartesian phải có lý do ghi rõ (rủi ro/số tổ hợp nhỏ).
- Constraints phải khai báo trước khi sinh; không sinh bộ bất khả rồi mới lọc.
- Expected của mỗi bộ là oracle độc lập, KHÔNG lấy từ build.
- Chiều không thực sự tương tác → test rời (EP/BVA), KHÔNG đưa vào ma trận (tránh phình).

## Constraints

- Không full Cartesian mặc định (chống nổ case — mâu thuẫn triết lý "theo tỉ lệ").
- Không hardcode dimension/domain cụ thể vào skill chung.
- Không bịa giá trị/constraint không có trong tài liệu.

## Anti-Patterns

- Nhân mọi tổ hợp (Cartesian) cho mọi chức năng → nổ số case vô nghĩa.
- Đưa chiều độc lập (không tương tác) vào ma trận thay vì test rời.
- Map expected từ build đang chạy (tautological).
- Bỏ constraints → sinh bộ bất khả làm nhiễu coverage.

## Related

- [[requirements_analyzer]] — trích dimension/values/constraint từ requirement.
- [[tc_validator]] — validate ma trận như testcase thường (trace + expected cụ thể).
- Prompt quy trình: `prompt_templates/phase1/06_cross_module.md`.
