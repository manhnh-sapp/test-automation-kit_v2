# Phase 1 - Bước 2: Sinh Testcase

> Tạo testcase chi tiết theo template chuẩn, có nhóm chức năng, risk và dữ liệu cụ thể.

## Mục Đích

Sinh bộ testcase đủ chi tiết để automation engineer có thể execute ở Phase 2 mà không phải đoán expected result.

## Template Bắt Buộc

```markdown
| TC ID | Module | Trường hợp kiểm thử | Tiền điều kiện | Dữ liệu Test | Các bước thực hiện | Kết quả mong đợi | Ưu tiên | Mức độ rủi ro |
```

## Workflow

1. Mapping requirement/business rule/API behavior thành testcase candidate.
2. Phân nhóm testcase theo nhóm chính là business flow trong cột `Module`:
   - UI flow/business flow chính của requirement.
   - CRUD/list/detail/create/edit/delete nếu phù hợp.
   - API/E2E/Permission nếu gắn với flow cụ thể thì vẫn đặt dưới nhóm business flow đó.
   - Chỉ dùng `API`, `E2E/Cross-app`, `Permission/Security` làm nhóm chính khi testcase không thuộc flow nghiệp vụ cụ thể.
   - Negative/Boundary/Error/Rollback là loại testcase hoặc label phụ, không phải nhóm chính nếu đã có business flow rõ.
   - Label phụ theo layer/risk/priority sẽ được sinh khi publish Xray/Jira, không thêm cột riêng vào bảng testcase.
3. Áp dụng kỹ thuật phù hợp:
   - Equivalence Partitioning
   - Boundary Value Analysis
   - Decision Table
   - State Transition
4. Với field validation, mỗi field/rule quan trọng phải có testcase riêng.
5. Dữ liệu test phải cụ thể, không dùng placeholder mơ hồ.
6. Expected result phải mô tả rõ behavior, UI state, API response, API/UI-visible state change hoặc error message cần validate.
7. Sinh section `## Setup Strategy (Hợp đồng tiền điều kiện)` (catalog `PRE-NN`) theo schema ở `prompt_templates/phase1/02_gen_testcases.md` mục 9; gắn tag `[PRE-NN]` vào cột Tiền điều kiện. Dùng skill `precondition_setup_planner` để phân loại + chọn method. `Setup Source` cho strategy `api` lấy từ Swagger đã fetch, không bịa endpoint; không dùng DB/backend source làm setup capability.

## Rules

- Không gộp nhiều validation field vào một testcase nếu làm mất assertion riêng.
- Không tạo testcase chỉ kiểm tra response/UI chung chung.
- Không bỏ negative, permission/security, rollback/error case nếu nằm trong scope.
- TC ID phải unique và trace được về requirement/user story/API behavior.

## Outputs

| Output | Vị trí |
|---|---|
| Testcase Markdown draft | `<TASK_OUTPUT_DIR>/test-cases/` |
| Section phân nhóm testcase | Trong file testcase |
| Setup Strategy contract (catalog PRE-NN) | Trong file testcase, sau section phân nhóm |
| Requirement mapping | Trong testcase hoặc Phase 1 summary |
