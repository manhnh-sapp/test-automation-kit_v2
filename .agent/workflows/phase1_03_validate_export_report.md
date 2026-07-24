# Phase 1 - Bước 3: Validate, Export Excel Và Report

> Kiểm tra chất lượng testcase, export Excel và ghi đánh giá coverage/risk.

## Mục Đích

Đảm bảo testcase không chỉ nhiều về số lượng mà còn đạt chất lượng kiểm thử, có coverage rõ và đủ artifact để Phase 2 chạy được.

## Workflow

1. Validate từng testcase:
   - Đủ 9 cột.
   - Step rõ và executable.
   - Expected result cụ thể.
   - Test data không placeholder.
   - Trace được requirement.
   - Assertion intent rõ.
   - Mỗi precondition có tag `[PRE-NN]` map tới catalog Setup Strategy; `Setup Source`/`Setup Verification`/`Cleanup` đủ cụ thể để Phase 2 setup qua UI/API/fixture/hook an toàn hoặc đánh dấu manual; `Automation Readiness` đã gán (`Ready`/`Needs hook`/`Manual-only`).
   - **Ép bằng máy (G5 design_gate):** structural (đủ cột canonical) + completeness (ô lõi Module/Trường hợp/Các bước/Ưu tiên/Mức độ rủi ro không rỗng) = **CHẶN**. Chạy `npm run design:gate -- --dir <test-cases/>` (thêm `--with-rows` để check luôn row-quality/oracle); TỰ CHẠY khi convert (Bước 4). Dimension/depth per-module: Bước 6a risk gate.
2. Review coverage:
   - Requirement Coverage = Covered Requirements / Total In-scope Requirements * 100%.
   - Requirement chỉ tính covered nếu có testcase trace rõ, assertion đúng behavior và không skip.
3. Review risk gate:
   - Critical/High gap còn mở thì không kết luận PASS.
   - Core/high-risk flow phải cover đầy đủ.
4. Export Excel cho từng file testcase Markdown:
   ```powershell
   node scripts/convert_excel/md_to_xlsx.js <testcase.md> <testcase.xlsx>
   ```
   - **Design gate (G5) + gate gen-testcase TỰ CHẠY khi convert**: (a) design_gate CHẶN nếu thiếu cột canonical / rỗng ô lõi; (b) gen-testcase CHẶN (không tạo xlsx) nếu "Kết quả mong đợi" không khớp số bước / gộp range `1-2.` / ghi trơ "thành công"/"đúng" / oracle rỗng; `;`-nhồi-ý + tautology chỉ cảnh báo. **Gate CHẶN → tự sửa Markdown rồi convert lại tới khi PASS, không chờ user nhắc.** Kiểm trước: `npm run design:gate -- --dir <test-cases/> --with-rows`.
5. Ghi trạng thái `Jira testcase publish: Pending QA confirmation` trong `task.md`.
   - Không publish Jira trong bước này.
   - Step publish riêng là [phase1_04_auto_publish_jira.md](phase1_04_auto_publish_jira.md), chỉ chạy sau khi QA xác nhận Excel.
6. **Ma trận traceability (F8)**: chạy `npm run trace:matrix` (hoặc `node scripts/qa/traceability_matrix.js`) → sinh `reports/traceability-matrix.{md,csv}` join REQ→TC→AUTO→EXEC→BUG từ artifact task; đánh dấu TC **chưa publish / chưa execute**. Ở Phase 1 ma trận là bản coverage (TC+publish); refresh lại sau Phase 2 để có EXEC/BUG đầy đủ.
7. Cập nhật `snapshot_context.json`, `phase1-summary.md` và `task.md`.
6a. **Risk gate (RBT depth):** chạy `TASK_ENV=... npm run risk:gate` (skill `risk_scorer`) đối chiếu testcase với `depthPolicy` theo band. Module **High risk** thiếu độ sâu → CRITICAL = **Critical gap → không PASS** coverage gate (đồng bộ Decision Rules `tc_validator`). Mặc định cảnh báo; `risk:gate:enforce` chặn CI. QA override band / `gate_waiver` trong `risk-register.json` cho ngoại lệ có lý do.
6b. Sinh **Traceability Matrix** tường minh `<TASK_OUTPUT_DIR>/reports/traceability-matrix.md` — bảng `| REQ-ID | Requirement/AC | Risk | TC ID (trace) | Status |` (1 dòng/requirement in-scope; `Status` ∈ `Covered`/`Partial`/`Gap`). Hỗ trợ Gap Analysis: requirement `Gap`/`Partial` mức Critical/High phải khớp `### High/Critical Gaps` trong summary. Đây là artifact riêng, chi tiết hơn Coverage Matrix tóm tắt trong summary.
7. Nếu `### Precondition Execution Matrix` còn dòng `Needs hook`/`Manual-only`, sinh `reports/capability-request.md` (handoff Dev/BE/DevOps): gom capability còn thiếu (loại `test_hook`/`account`/`sandbox`/`api`/`config`, endpoint/tên đề xuất, PRE + TC bị chặn, owner). KHÔNG dùng DB để thay thế. Format chi tiết ở [prompt_templates/phase1/02_gen_testcases.md](../../prompt_templates/phase1/02_gen_testcases.md); contract test hook ở [tests/support/setup/hooks/README.md](../../tests/support/setup/hooks/README.md).

## Quality Gate

| Điều kiện | Bắt buộc |
|---|---|
| Overall requirement coverage >= 80% | Có |
| Core/high-risk flow covered | Có |
| Không còn Critical/High open question | Có |
| Không có testcase quan trọng bị skip | Có |
| Negative/security/rollback case trong scope được cover | Có |
| Mọi precondition có Setup Strategy contract (PRE-NN) đủ để Phase 2 setup an toàn hoặc manual rõ | Có |
| Phase 1 summary có `### Precondition Execution Matrix` (1 dòng/TC trong scope) | Có |
| Nếu matrix còn `Needs hook`/`Manual-only` thì `reports/capability-request.md` tồn tại | Có (nếu applicable) |

## Outputs

| Output | Vị trí |
|---|---|
| Testcase Markdown final | `<TASK_OUTPUT_DIR>/test-cases/` |
| Testcase Excel | Cùng thư mục testcase |
| Coverage/Risk summary | `<TASK_OUTPUT_DIR>/reports/phase1-summary.md` |
| Traceability matrix (REQ × TC × Risk × Status) | `<TASK_OUTPUT_DIR>/reports/traceability-matrix.md` |
| Capability / Test-Hook Request | `<TASK_OUTPUT_DIR>/reports/capability-request.md` (khi còn `Needs hook`/`Manual-only`) |
| Snapshot context | `<TASK_OUTPUT_DIR>/test-cases/snapshot_context.json` |
| Task tracking | `<TASK_OUTPUT_DIR>/task.md` |
