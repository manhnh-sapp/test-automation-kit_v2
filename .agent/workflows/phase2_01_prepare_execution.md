# Phase 2 - Bước 1: Chuẩn Bị Execute

> Xác nhận scope, testcase, env và dữ liệu trước khi generate/chạy automation.

## Mục Đích

Tránh chạy nhầm task, nhầm story hoặc thiếu env khiến testcase bị fail/skip không đúng bản chất.

## Workflow

1. Echo lại:
   - `PROJECT_OUTPUT_DIR`
   - `TASK_KEY`
   - `TASK_OUTPUT_DIR`
   - `RUN_ID` nếu có
2. Nếu yêu cầu hiện tại không nêu rõ `TASK_KEY`, không dùng `TASK_KEY` từ `.env` hoặc context cũ để chạy; phải hỏi lại.
3. Đọc artifact local:
   - Nguồn execute theo `TESTCASE_SOURCE`: **mặc định `xray`** → `<TASK_OUTPUT_DIR>/test-cases/from-xray/*.xlsx` (kéo từ Xray ở Bước 0); `excel` → `<TASK_OUTPUT_DIR>/test-cases/*.xlsx`.
   - `<TASK_OUTPUT_DIR>/test-cases/` Markdown chỉ dùng để đọc section chi tiết như `## Setup Strategy (Hợp đồng tiền điều kiện)` khi Excel chưa đủ thông tin setup.
   - `<TASK_OUTPUT_DIR>/reports/phase1-summary.md` (gồm `### Setup Readiness` và `### Precondition Execution Matrix` — dùng để chọn case automatable / cần hook / blocked trước khi execute)
   - `<TASK_OUTPUT_DIR>/reports/capability-request.md` (nếu có — danh sách capability gap; xem Capability gate ở Rules)
   - `<TASK_OUTPUT_DIR>/task.md`
4. Xác định testcase scope:
   - ALL
   - selected TC IDs
   - UI/API/E2E subset
   - **Thứ tự execute theo risk:** nếu có `<TASK_OUTPUT_DIR>/reports/risk-register.json` (skill `risk_scorer`), execute theo `executeOrder` — **module High risk trước** (bắt bug quan trọng sớm), rồi Medium/Low.
5. Kiểm tra runtime config:
   - App/API URL
   - credential/token local
   - browser/API dependency
6. Ghi blocker nếu thiếu input bắt buộc không thể tự suy ra.

## Rules

- Không sửa `.env` chung khi có session khác; truyền env theo command nếu cần.
- Không đọc lại toàn bộ requirement thô nếu Phase 1 summary đã đủ.
- **Phase 2 execute mặc định lấy nguồn từ Xray** (`TESTCASE_SOURCE=xray`): kéo về canonical local `test-cases/from-xray/*.xlsx` rồi execute từ file đó — KHÔNG gọi Jira/Xray cho từng case lúc execute. `TESTCASE_SOURCE=excel` để dùng Excel local. (Excel là source of truth khi gen/publish.)
- Không chạy Phase 2 nếu không có testcase đã review.
- Resolve Setup Strategy contract (PRE-NN) cho scope đã chọn trước khi execute; nếu có `PRE-NN = Needs hook` mà hook chưa tồn tại, ghi blocker thay vì skip âm thầm. Chỉ TC có `Automation Readiness = Manual-only` mới được skip vì setup.
- Definition of Ready (DoR) trước khi execute mỗi TC: precondition rõ + setup method rõ + test data/fixture rõ + verification + cleanup + capability (API/hook/mock/sandbox/fixture) đã tồn tại. Thiếu bất kỳ điều nào → KHÔNG chạy bừa và KHÔNG connect DB: ghi `BLOCKED_SETUP` (capability/contract chưa đủ) hoặc `SKIP_SETUP` (`Manual-only`) kèm missing capability cụ thể.
- Capability gate (DoR cấp task trước Phase 2): nếu tồn tại `reports/capability-request.md` với item chưa `Resolved`/`Accepted`, các TC phụ thuộc capability đó KHÔNG được coi là runnable — ghi `BLOCKED_SETUP` thay vì cố chạy. Mỗi blocker/SKIP phải gắn 1 Blocker Root Cause (`needs_hook`/`needs_account`/`needs_sandbox`/`spec_mismatch`/`manual_inherent`/`external_dependency` — xem skill `precondition_setup_planner`), KHÔNG gộp chung "backend state".

## Outputs

| Output | Vị trí |
|---|---|
| Execution scope | `task.md` hoặc execution summary draft |
| Blocker nếu có | `<TASK_OUTPUT_DIR>/reports/execution-summary.md` |
