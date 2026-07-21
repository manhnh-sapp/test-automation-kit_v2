# Prompt chạy Phase 1 - Sinh testcase

> Chạy: `Đọc file này và chạy với TASK_KEY=<TASK_KEY>`. Tuân thủ `RULE_GLOBAL.md` và `.agent/rules/`.

Dùng prompt này để collect context và sinh/cập nhật testcase. Đây là template dùng chung, phải thay các placeholder trước khi chạy. Không execute automation trong Phase 1.

```text
Chạy Phase 1 cho module/task sau: collect context và sinh/update testcases.

Project:
- Project là toàn bộ LMS + Operations automation workspace.
- Phạm vi hiện tại là module/task/feature được cung cấp bên dưới.
- Jira key hoặc module name chỉ là task/feature scope, không phải tên project.

Phạm vi:
- Module/Feature: [MODULE_FEATURE]
- Task key/scope folder: [TASK_KEY]
- Site liên quan: [LMS / Operations / LMS + Operations]

Input links: (lấy từ profile của task — profiles/[TASK_KEY].env; chỉ điền trực tiếp ở đây khi muốn override profile)
- Jira Epic: [JIRA_EPIC_URL]
- Jira Story/Task: [JIRA_STORY_URL]
- Confluence Requirement: [CONFLUENCE_REQUIREMENT_URL]
- Figma: [FIGMA_FILE_URL]
- LMS URL: [LMS_BASE_URL]
- Operations URL: [OPS_BASE_URL]
- LMS Swagger URL: [LMS_SWAGGER_URL]
- Operations Swagger URL: [OPS_SWAGGER_URL]
- Other docs/files: [OTHER_DOCS hoặc N/A]

Run profile (chạy song song an toàn):
- Mỗi task dùng profile riêng profiles/[TASK_KEY]/task.env chứa GIÁ TRỊ ĐỘNG (scope, link cụ thể của task, tài khoản OPS/LMS theo task); giá trị TĨNH (Figma/Confluence/Jira/Xray/HubSpot key + base URL) giữ ở .env chung.
- Truyền TASK_ENV=profiles/[TASK_KEY]/task.env cho MỌI command; không đọc TASK_KEY từ .env chung, không sửa .env/.env.local chung.
- Chi tiết: QUICKSTART.md (mục Parallel Story Safety).

Context/config:
- Đọc `.agent/config/project_context.md` nếu có.
- Đọc `.env.example` để biết env keys cần có.
- Credential/token thật lấy từ `.env.local` hoặc `.env`, không ghi vào markdown/log/report.
- Jira testcase publish: KHÔNG publish trong prompt này. Auto Publish Jira là step riêng trong phạm vi Phase 1, chỉ chạy bằng `prompt_templates/phase1/04_auto_publish_jira.md` sau khi QA xác nhận Excel.
- Jira testcase issue type nếu chạy step publish riêng: Xray `Test` (`TEST_MANAGEMENT_TOOL=xray`, `JIRA_TESTCASE_ISSUE_TYPE=Test`).
- Step publish (04) khi có Xray API key sẽ dựng cấu trúc Xray native: steps vào `Test details` (Test Type=Manual), Preconditions dùng chung theo mã `[PRE-xx]`, mỗi Test vào subfolder Test Repository theo `Nhóm chức năng`, và Description rút gọn (chỉ metadata + Dữ liệu Test cấp TC, trỏ tới tab native). KHÔNG tạo Test Set theo chức năng (trùng subfolder — mặc định tắt); Test Set chỉ dùng cho nhóm cắt ngang khi cần. Chi tiết và flag ở `prompt_templates/phase1/04_auto_publish_jira.md`.
- Xray testcase cleanup: KHÔNG cleanup trong prompt này. Nếu Excel thay đổi sau publish, chạy nhánh phụ `partial-rerun/run_xray_test_cleanup.md` sau Human Review/QA approval.
- Tất cả Markdown/report/task log phải dùng tiếng Việt chuẩn có dấu, encoding UTF-8. Không dùng tiếng Việt không dấu và không để ký tự lỗi encoding/mojibake.

Parallel story safety:
- Trước khi ghi file hoặc chạy command, bắt buộc echo scope:
  `PROJECT_OUTPUT_DIR`, `TASK_KEY`, `TASK_OUTPUT_DIR`, `RUN_ID` nếu có, và phase đang chạy.
- Nếu yêu cầu hiện tại của user không nêu rõ `TASK_KEY`, không dùng `TASK_KEY` từ `.env` hoặc context cũ để chạy; phải hỏi lại.
- Nếu `TASK_KEY` echo ra không khớp task user yêu cầu, dừng ngay; không ghi file/chạy lệnh.
- Không sửa `.env` hoặc `.env.local` chung khi có session khác đang chạy.
- Ưu tiên truyền `PROJECT_OUTPUT_DIR` và `TASK_KEY` qua env/CLI từng command.
- Không chạy Phase 1 song song cùng một `TASK_KEY` vì Phase 1 ghi requirement/testcase/report chính.
- Nếu cần thử nhiều hướng cho cùng story, dùng task branch/suffix riêng, ví dụ `<TASK_KEY>-draft-a`, rồi Human Review trước khi merge về task chính.

Nguyên tắc tiết kiệm token:
- Ưu tiên đọc link/file theo đường dẫn và lưu raw artifacts vào `<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/requirements/`; không paste toàn bộ Jira/Confluence/Figma/Swagger vào chat hoặc report.
- Nếu đã có requirement artifact, snapshot hoặc `reports/phase1-summary.md` local, dùng làm nguồn chính và chỉ đọc raw docs khi summary chưa đủ.
- Chỉ mở section/anchor/page/API path liên quan tới `[MODULE_FEATURE]`; không đọc toàn bộ tài liệu lớn nếu scope chỉ là một module/flow.
- Không đọc các file `run_phase*_example_*` trừ khi user yêu cầu rõ hoặc đang cần so sánh example.
- Final cho user chỉ tóm tắt output path, tổng testcase, coverage, blocker; chi tiết đầy đủ nằm trong file report local.

Nguyên tắc chất lượng khi tối ưu:
- Tiết kiệm token không được làm giảm coverage, độ chi tiết testcase, độ đúng của expected result hoặc khả năng execute ở Phase 2.
- Nếu summary/cache/local artifact không đủ để xác nhận rule, field, permission, API contract hoặc expected result, phải đọc thêm nguồn gốc liên quan thay vì đoán.
- Không được bỏ qua source quan trọng chỉ để giảm số file đọc.
- Output ít token với user, nhưng file Markdown/Excel/report local phải đầy đủ, rõ ràng và có thể review độc lập.
- Nếu có trade-off giữa tiết kiệm token và chất lượng testcase, ưu tiên chất lượng testcase.

Output:
- Output root bắt buộc lấy từ `PROJECT_OUTPUT_DIR`.
- Nếu không có `PROJECT_OUTPUT_DIR`, dừng và yêu cầu user cung cấp; không dùng fallback hardcode.
- Nếu không có `TASK_KEY`, dừng và yêu cầu user cung cấp; không dùng fallback từ `JIRA_STORY_KEY` hoặc task cũ.
- Output cho scope này phải nằm trong:
  `<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/`

Phase 1 tasks:
1. Fetch/read Jira, Confluence, Figma, Swagger/OpenAPI và file local nếu được cung cấp; chỉ đọc sâu phần liên quan tới scope, còn raw content lưu local.
1b. **Ambiguity Gate (gate cứng):** sau khi đọc nguồn, rà mâu thuẫn/thiếu rule bắt buộc/expected không rõ. Nếu có điểm mơ hồ Critical/High → xuất Q&A đánh số + assumption mặc định ra `reports/phase1-clarifications.md`, ghi `AMBIGUITY_GATE: PENDING` vào `task.md` và DỪNG chờ QA/BA. KHÔNG sinh testcase khi gate PENDING. Chi tiết: `.agent/workflows/phase1_01_prepare_context.md` bước 7.
2. Phân tích requirement, UI design, API docs và context dự án.
2b. **UI Conformance Catalog (BẮT BUỘC nếu scope có màn UI)**: với mỗi màn/bảng/danh sách/field trong scope, trích **NGUYÊN VĂN từ FS/Figma** ra `<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/requirements/ui_catalog.md` — mỗi phần tử → (tên cột/label chính xác, format dữ liệu, số cột + thứ tự, field bắt buộc, empty-state/placeholder/label nút/tiêu đề, token style nếu có Figma). Đây là **nguồn-sự-thật cho expected của mọi case hiển thị** ở cả Phase 1 (sinh case) lẫn Phase 2 (assert). CẤM lấy expected hiển thị từ build đang chạy (chống oracle tautological). Chi tiết ở mục 12 trong `prompt_templates/phase1/02_gen_testcases.md`.
3. Sinh hoặc cập nhật manual testcases.
4. Bao gồm UI, API và E2E testcases khi phù hợp.
5. Với tiền điều kiện phức tạp, chỉ đề xuất setup qua UI/API public-business contract, fixture hoặc test hook/sandbox nếu có; không đề xuất DB để DỰNG state hoặc đọc toàn bộ source backend. `Setup Verification` có thể dùng read-only UAT DB qua guarded client (read-only, chỉ SELECT) khi API/UI không expose state.
6. Lưu testcase Markdown output dưới:
   `<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/test-cases/`
7. Export mỗi file testcase Markdown có bảng `TC ID` sang Excel `.xlsx` cùng thư mục, cùng basename, bằng command:
   `node scripts/convert_excel/md_to_xlsx.js <testcase.md> <testcase.xlsx>`
   Ví dụ:
   `node scripts/convert_excel/md_to_xlsx.js <PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/test-cases/[TESTCASE_BASENAME].md <PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/test-cases/[TESTCASE_BASENAME].xlsx`
8. Coi Excel đã export là source of truth của testcase và chuẩn bị trạng thái `Pending QA confirmation` cho step Auto Publish Jira.
   - Không publish Jira trong prompt này.
   - Sau khi QA xác nhận Excel/testcase đạt, chạy prompt riêng:
     `prompt_templates/phase1/04_auto_publish_jira.md`
   - Excel là source-of-truth khi GEN/PUBLISH. Từ nay Phase 2 **execute mặc định đọc từ Xray** (`TESTCASE_SOURCE=xray`) → **publish (step 04) là bước cần trước Phase 2**; Phase 2 tự kéo Xray về canonical local để chạy. Muốn chạy thuần Excel local thì đặt `TESTCASE_SOURCE=excel`.
   - Nếu Excel thay đổi sau khi đã publish, cleanup lifecycle Xray Test thuộc nhánh phụ partial-rerun; không hard delete Xray Test.
9. Lưu requirement/context artifacts dưới:
   `<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/requirements/`
10. Cập nhật:
   `<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/task.md`
   Trong `task.md`, ghi rõ đường dẫn Markdown testcase, Excel testcase đã export và trạng thái `Jira testcase publish: Pending QA confirmation`.
11. Sinh/cập nhật Phase 1 report dưới:
   `<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/reports/phase1-summary.md`
   Report phải đầy đủ và có thể review độc lập, bao gồm:
   - Tổng số testcase đã gen/cập nhật.
   - Số testcase theo loại: Positive / Negative / Boundary / Edge.
   - Số testcase theo nhóm chức năng: lấy động từ phần trước dấu `/` trong cột `Module`; không hardcode danh sách nhóm của một task cụ thể.
   - Report phải liệt kê toàn bộ nhóm thực tế xuất hiện trong testcase. Ví dụ CRUD có thể có `Xem danh sách`, `Tạo`, `Sửa`, `Xóa`; domain khác có thể có `Đăng nhập`, `Thanh toán`, `Báo cáo`, `Thông báo`,...
   - Số testcase theo layer/site: UI, API, E2E và các app/site thực tế trong scope nếu xác định được.
   - Coverage matrix tóm tắt requirement/business rule/API endpoint -> TC ID.
   - Review bộ testcase theo 2 góc độ `Coverage` và `Quality/Risk`, áp dụng quality gate trong section Phase 1 report bên dưới và hướng dẫn chi tiết ở `prompt_templates/phase1/02_gen_testcases.md`.
   - Requirement Coverage phải tính theo công thức:
     `Requirement Coverage = Covered Requirements / Total In-scope Requirements * 100%`
   - Requirement chỉ được tính là covered nếu có testcase trace rõ ràng, assertion đúng behavior, và không bị skip nếu đã có execution result.
   - Phân loại từng requirement/gap theo risk: `Critical`, `High`, `Medium`, `Low`.
   - Không dùng công thức đếm gap kiểu `covered / (covered + gaps)` để thay thế coverage requirement.
   - Không kết luận `PASS` nếu còn open gap Critical/High, dù coverage tổng >= 80%.
   - Đánh giá testcase quality: trace requirement, step executable, expected cụ thể, assertion đúng business rule, phụ thuộc data/env, flaky risk, duplicate/overlap, skip/fail do script/setup.
   - Report bắt buộc có đúng các section:
     `### Coverage Summary`
     `| Metric | Value | Comment |`
     `### Risk-based Gate`
     `| Condition | Status | Reason |`
     `### High/Critical Gaps`
     `| Gap | Risk | Impact | Required Action | Gate Blocking |`
     `### Testcase Quality Issues`
     `| Testcase | Issue | Severity | Recommendation |`
     `### Final Decision`
   - `Final Decision` chỉ được dùng một trong: `PASS`, `CONDITIONAL PASS`, `FAIL`, `BLOCKED`.
   - Chỉ kết luận `PASS` khi coverage >= 80%, core/high-risk flows được cover đầy đủ, không còn open question Critical/High, không có testcase quan trọng bị skip, assertion rõ ràng, và negative/permission/rollback/error case được cover nếu nằm trong scope.
   - Coverage gaps, assumptions, rủi ro còn lại và testcase đề xuất bổ sung nếu có.
12. Cập nhật `task.md` để ghi rõ đường dẫn report Phase 1 và trạng thái chờ QA xác nhận trước khi publish Jira testcase.

Yêu cầu testcase output:
- Mỗi testcase phải có precondition, test data, steps và expected result rõ ràng.
- Cột `Tiền điều kiện` phải dùng định dạng `[PRE-NN] <mô tả ngắn>` (nhiều tag tách bằng `<br>`), không để tag trơ trụi; mô tả khớp catalog `## Setup Strategy`. Mục tiêu: đọc 1 dòng testcase là hiểu tiền điều kiện mà không cần kéo xuống catalog.
  - Cùng một mã `[PRE-NN]` phải dùng mô tả GIỐNG HỆT ở mọi testcase (một nguồn duy nhất = catalog/sheet `Preconditions`). Khi publish, mỗi mã tạo 1 Precondition dùng chung theo mã; nếu mô tả lệch nhau giữa các TC, publisher chỉ giữ bản xuất hiện đầu và cảnh báo.
- Xác định site/layer của từng testcase: [SITES] / UI / API / E2E.
- Xác định loại testcase: UI / API / E2E.
- Phân nhóm rõ từng testcase theo nhóm chính là business flow trong cột `Module` với format:
  `[Nhóm chức năng] / [User Story hoặc màn hình/API/flow cụ thể]`.
  Nhóm chức năng phải suy ra từ domain/scope và ưu tiên business flow, không phải layer kỹ thuật. Với CRUD có thể dùng `Xem danh sách`, `Tạo`, `Sửa`, `Xóa`; với API/E2E/permission gắn với flow cụ thể thì vẫn đặt vào nhóm flow đó, ví dụ `Tạo / API POST ...`, `Tạo / Ops create exam -> LMS sync`, `Sửa / Permission role teacher cannot edit`. Chỉ dùng `API`, `E2E/Cross-app`, `Permission/Security` làm nhóm chính khi testcase không thuộc business flow cụ thể nào.
- Không thêm cột label vào bảng testcase. Khi publish Xray/Jira, label để TỐI THIỂU (chỉ marker `automation-testcase` + khoá dedup `task-*`/`tc-*`); nhóm chức năng KHÔNG dùng label mà thể hiện qua Xray Test Set và subfolder Test Repository (theo sheet chức năng). Không gắn label group/layer/risk/priority/xray.
- Sau bảng testcase, thêm section `## Phân nhóm testcase` mapping nhóm chức năng -> phạm vi -> TC ID -> tổng.
- API testcase phải reference method + endpoint + expected status/body.
- Phải vét cạn UI edge/boundary theo các dimension trong `prompt_templates/phase1/02_gen_testcases.md` (mục 3 Field-Level mở rộng: Date/Month, Time HH:mm, Computed/derived, File upload boundary; mục 7 Export/Import file output; mục 8 Resilience/Concurrency; mục 9 Side-effect/Notification; mục 10 Cross-layer guard; mục 11 Design/Visual compliance — token Figma; **mục 12 Display/Field Conformance — tên cột exact, format từng field, số cột + thứ tự, field bắt buộc, empty-state; expected trích từ `ui_catalog.md`/tài liệu, KHÔNG từ build**). Dimension không áp dụng phải ghi `N/A + lý do` trong Coverage Gaps.
- File Excel phải được tạo thành công sau khi file Markdown hoàn tất; Excel phải có cột/sheet phân nhóm để lọc theo các nhóm thực tế trong cột `Module`. Mỗi nhóm chức năng nên là một sheet riêng — tên sheet sẽ trở thành subfolder Test Repository khi publish (bỏ qua sheet `Summary`, `Test Cases`); catalog precondition đặt ở sheet `Setup Contracts`. Nếu thiếu dependency `exceljs`, báo rõ blocker và không coi Phase 1 là hoàn tất.
- Sau khi Excel tạo thành công, không publish Jira trong prompt này. Ghi trạng thái `Pending QA confirmation`; step publish thật chạy bằng prompt riêng sau khi QA xác nhận.
- Phase 1 report phải được tạo/cập nhật sau khi Markdown và Excel testcase hoàn tất; không coi Phase 1 hoàn tất nếu thiếu report này.
- `task.md`, testcase Markdown và Phase 1 report phải viết bằng tiếng Việt chuẩn có dấu; technical terms, endpoint, command, enum/status có thể giữ nguyên tiếng Anh.
- Không execute automation trong Phase 1.

Điều kiện dừng:
- **Dừng sớm nếu Ambiguity Gate PENDING**: nếu có mơ hồ Critical/High, dừng ngay sau khi xuất `reports/phase1-clarifications.md` + `AMBIGUITY_GATE: PENDING`; KHÔNG sinh testcase cho tới khi QA/BA resolve.
- Dừng sau khi sinh/cập nhật testcase Markdown, export Excel, sinh/cập nhật Phase 1 report và cập nhật task log.
- Chờ review trước khi chuyển Phase 2.
- Trước khi dừng, tự kiểm tra: testcase có đủ precondition/data/steps/expected, coverage chính >= 80% hoặc có gap rõ, không còn gap Critical/High nếu muốn kết luận PASS, Excel mở được và là source of truth, Jira publish đang ở trạng thái `Pending QA confirmation`, report/task log tiếng Việt chuẩn có dấu, không có placeholder hoặc encoding lỗi.
- Trước khi dừng, chạy `Self-check vét cạn biên` (mục 18 trong `prompt_templates/phase1/02_gen_testcases.md`): mỗi input đủ EP/BVA; filter/list có biên ngày/tháng/năm nhuận; export verify cấu trúc file + mapping + empty + dataset lớn; side-effect có negative; UI guard có cross-layer check; entity có status có đủ ma trận status x action; computed field có TC derivation + biên; nếu có Figma thì component chính có TC design compliance (token màu/font/radius/spacing/alignment); **mỗi màn có bảng/field có case Display Conformance (tên cột exact + format + số cột/thứ tự + field bắt buộc + empty-state, expected từ `ui_catalog.md`/tài liệu — mục 12)**; **logic/tính toán có oracle giá trị cụ thể + so khớp/delta dữ liệu (mục 13); field trống nghi ngờ đối chiếu response BE, phân biệt null/rỗng/thiếu/0 (mục 14); IDOR/privilege/injection/mass-assignment/data-exposure (mục 15); SLA/large-dataset/concurrent khi có ngưỡng (mục 16); change impact: story đụng bề mặt dùng chung (data/endpoint/component/rule/status/permission) → regression smoke cho feature bị ảnh hưởng + backward-compat, cái nghi ghi `QA confirm` (mục 17)**. Mục thiếu phải ghi vào Coverage Gaps.

Extra instruction:
- [ANY_EXTRA_REQUEST hoặc N/A]
```
