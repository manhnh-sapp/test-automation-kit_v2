# Prompt Phase 1 - Cross-Module / Combinatorial Testing

> Chạy: `Đọc file này và chạy với TASK_KEY=<TASK_KEY>`. Tuân thủ `RULE_GLOBAL.md` và `.agent/rules/`.
> Bổ sung cho `02_gen_testcases.md` khi chức năng phụ thuộc **nhiều biến kết hợp** hoặc **dữ liệu chảy qua nhiều màn/hệ thống**. Dùng skill `combinatorial_matrix`.

# Khi nào dùng

- Kết quả phụ thuộc tổ hợp nhiều biến độc lập (loại × phương thức × role × trạng thái...) mà test rời từng biến bỏ lọt bug tương tác.
- Luồng cross-module/cross-app: dữ liệu tạo ở A → hiển thị/xử lý ở B → tổng hợp ở C.
- KHÔNG dùng khi chỉ 1 biến (dùng EP/BVA thường ở mục 3 của `02_gen_testcases.md`).

# Nguyên tắc

- **Pairwise mặc định + business-critical combos**; full Cartesian chỉ khi tổ hợp nhỏ + rủi ro cao + ghi lý do (chống nổ case — xem `combinatorial_matrix`).
- Expected mỗi bộ là **oracle độc lập từ tài liệu**, không lấy từ build.
- Có **checkpoint** trước khi sinh ma trận lớn (xem Bước 4).

# Quy trình 5 bước

1. **Recon**: xác định chức năng/luồng và các màn/hệ thống liên quan trong scope.
2. **Data Flow Mapping**: vẽ dữ liệu chảy qua đâu (tạo ở đâu → biến đổi/hiển thị ở đâu → tổng hợp/side-effect ở đâu); chỉ ra điểm dễ lệch giữa các module.
3. **Dimension Extraction**: liệt kê các chiều độc lập + tập giá trị mỗi chiều + **constraints** (cặp bất khả). Chiều không thực sự tương tác → tách ra test rời, KHÔNG đưa vào ma trận.
4. **Matrix (có CHECKPOINT)**: sinh ma trận theo `combinatorial_matrix` (pairwise mặc định). **Trước khi sinh**: báo số chiều, số giá trị, số bộ pairwise dự kiến vs số Cartesian lý thuyết. Nếu bộ pairwise vẫn quá lớn hoặc muốn full → **hỏi QA xác nhận strategy** trước khi sinh (không tự nhân bừa).
5. **Expected Mapping**: map expected cho từng bộ (hợp lệ vs bị chặn), trace về rule/tài liệu; ghi rõ constraints đã loại.

# Outputs

| Output | Vị trí |
|---|---|
| Data flow map | `<TASK_OUTPUT_DIR>/test-cases/<basename>_dataflow.md` |
| Ma trận tổ hợp + expected | `<TASK_OUTPUT_DIR>/test-cases/<basename>_matrix.md` |
| Ghi chú strategy + mức cắt giảm | Đầu file matrix + Coverage Gaps của `phase1-summary.md` |

Mỗi hàng ma trận = 1 testcase → export Excel + publish Xray bằng script hiện có (`scripts/convert_excel/md_to_xlsx.js`, `scripts/integrations/jira/publish_testcases.js`), vào đúng nhóm chức năng. Sau đó validate bằng `tc_validator` như testcase thường.

# Rules

- Không full Cartesian mặc định; báo số bộ + hỏi khi lớn (Bước 4 checkpoint).
- Không đưa chiều độc lập không tương tác vào ma trận.
- Expected từ tài liệu, không từ build.
- Ma trận vẫn phải qua `tc_validator` + Ambiguity Gate như testcase thường trước khi tính coverage.
