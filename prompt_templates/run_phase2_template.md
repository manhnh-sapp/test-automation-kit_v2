# Prompt chạy Phase 2 - Thực thi automation

> Chạy: `Đọc file này và chạy với TASK_KEY=<TASK_KEY>`. Tuân thủ `RULE_GLOBAL.md` và `.agent/rules/`.

Dùng prompt này sau khi output testcase của Phase 1 đã được review. Đây là template dùng chung, phải thay các placeholder trước khi chạy.

```text
Chạy Phase 2 cho module/task sau: generate/update automation scripts nếu cần, execute testcases thật, auto-heal lỗi automation/setup, tổng hợp report và chỉ log bug Jira khi đã đủ điều kiện xác nhận.

Project:
- Project là toàn bộ LMS + Operations automation workspace.
- Phạm vi hiện tại là module/task/feature được cung cấp bên dưới.
- Jira key hoặc module name chỉ là task/feature scope, không phải tên project.

Phạm vi:
- Module/Feature: [MODULE_FEATURE]
- Task key/scope folder: [TASK_KEY]
- Site liên quan: [LMS / Operations / LMS + Operations]
- Nguồn testcase: [TESTCASE_SOURCE = xray (mặc định) | excel]
- Đẩy trạng thái lên Xray sau execute: [PUSH_XRAY_EXECUTION = confirm (mặc định, QA duyệt preview rồi mới tạo) | auto | 0]

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

Input artifacts:
- Nguồn testcase (`TESTCASE_SOURCE`, **mặc định `xray`**):
  - `xray` (mặc định): testcase đã publish/sửa trên Xray → kéo về canonical local TRƯỚC khi execute (Bước 0), rồi đọc từ `test-cases/from-xray/*.xlsx`. YÊU CẦU: Phase 1 đã publish testcase lên Xray.
  - `excel`: đọc Excel người dùng trong `test-cases/*.xlsx` (opt-out — dùng khi chưa publish hoặc muốn chạy thuần local).
- Testcase folder:
  `<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/test-cases/`
- Testcase Excel source of truth (theo `TESTCASE_SOURCE`):
  - `excel`: `<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/test-cases/*.xlsx`
  - `xray`: `<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/test-cases/from-xray/*.xlsx` (do `scripts/integrations/jira/pull_testcases.js` sinh)
- Requirement/context folder:
  `<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/requirements/`
- Phase 1 summary report:
  `<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/reports/phase1-summary.md`

Context/config:
- Đọc `.agent/config/project_context.md` nếu có.
- Credential/token thật lấy từ `.env.local` hoặc `.env`.
- Không ghi password/token/API key vào markdown, testcase output, log hoặc report.
- Tất cả Markdown/report/task log phải dùng tiếng Việt chuẩn có dấu, encoding UTF-8. Không dùng tiếng Việt không dấu và không để ký tự lỗi encoding/mojibake.

Parallel story safety:
- Trước khi ghi file hoặc chạy command, bắt buộc echo scope:
  `PROJECT_OUTPUT_DIR`, `TASK_KEY`, `TASK_OUTPUT_DIR`, `RUN_ID` nếu có, và phase đang chạy.
- Nếu yêu cầu hiện tại của user không nêu rõ `TASK_KEY`, không dùng `TASK_KEY` từ `.env` hoặc context cũ để chạy; phải hỏi lại.
- Nếu `TASK_KEY` echo ra không khớp task user yêu cầu, dừng ngay; không ghi file/chạy lệnh.
- Không sửa `.env` hoặc `.env.local` chung khi có session khác đang chạy.
- Ưu tiên truyền `PROJECT_OUTPUT_DIR`, `TASK_KEY` và `RUN_ID` qua env/CLI từng command.
- Nếu chạy song song cùng một `TASK_KEY`, bắt buộc dùng `RUN_ID` riêng cho từng session.
- Phase 2 thường chạy sau thời gian chờ Dev implement; trước khi execute phải đọc lại artifact canonical trong task folder, không dựa vào context hội thoại cũ.
- Automation mới sinh cho story phải ưu tiên nằm trong `<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/automation/`.
- Nếu bắt buộc ghi vào `tests/fe/` hoặc `tests/api/`, file spec phải namespace theo `[TASK_KEY]`; không dùng tên chung có thể bị story khác ghi đè.
- Không sửa shared helper/page object/fixture/config khi story khác đang execute, trừ khi user xác nhận đây là thay đổi chung.
- Nếu phải sửa shared helper, report phải ghi rõ file đã sửa, lý do, story bị ảnh hưởng và scope regression đã rerun.
- Khi chạy Playwright trực tiếp cho task, ưu tiên wrapper:
  `npm run test:task -- --project-output [PROJECT_OUTPUT_DIR] --task [TASK_KEY]`
  hoặc `npm run test:task:fe` / `npm run test:task:api`.
- Khi có `RUN_ID`, Playwright output nằm dưới:
  `<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/test-results/runs/[RUN_ID]/`
- Khi có `RUN_ID`, execution summary/local Jira log cho run đó nằm dưới:
  `<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/reports/runs/[RUN_ID]/`
- Khi có `RUN_ID`, không cập nhật trực tiếp testcase Markdown/Excel chính trong `test-cases/`; ghi `Status`, `Actual Result`, `Evidence` vào run-scoped report/status. Chỉ merge ngược khi user chọn run đó làm canonical.

Nguyên tắc tiết kiệm token:
- Phase 2 dùng canonical local (`reports/phase1-summary.md`, `task.md`, Excel testcase theo `TESTCASE_SOURCE`) làm source of truth cho TC ID/steps/expected; chỉ fetch lại Jira/Confluence/Figma/Swagger khi cần xác minh expected/spec.
- Nguồn execute theo `TESTCASE_SOURCE`:
  - `xray` (**mặc định**): coi Xray là nguồn (Phase 1 đã publish testcase lên đó). Chạy `pull_testcases.js` MỘT lần để tái tạo canonical local `test-cases/from-xray/*.xlsx`, rồi execute từ file đó y như Excel thường — không gọi Jira/Xray cho từng case lúc execute (token thấp + offline được).
  - `excel`: dùng Excel local `test-cases/*.xlsx`; KHÔNG đọc Xray mirror. Dùng khi chưa publish lên Xray hoặc muốn chạy thuần local.
- Đọc testcase theo index/TC ID/module trước, chỉ mở full file khi selected scope yêu cầu.
- Không paste full Playwright report, trace, DOM, network log hoặc `results.json` vào chat/report; trích lỗi chính và lưu artifact local.
- Chạy targeted test trước theo selected TC IDs/spec/endpoint. Chỉ chạy full suite khi `Execution mode = ALL_TESTCASES`, sửa shared helper/auth/setup, hoặc cần kiểm regression rộng.
- Sau khi có FAIL/SKIP, rerun targeted các case đó thay vì rerun toàn suite, trừ khi nguyên nhân nằm ở shared layer.
- Final cho user chỉ tóm tắt số liệu và đường dẫn report; mọi bảng chi tiết nằm trong `reports/execution-summary.md`.

Nguyên tắc chất lượng khi tối ưu:
- Tiết kiệm token không được biến thành chạy thiếu testcase, đọc thiếu expected result, bỏ qua assertion, bỏ qua evidence hoặc giảm độ tin cậy report.
- Selected/targeted run chỉ hợp lệ khi scope đã được xác định rõ; nếu không chắc testcase nào bị ảnh hưởng, phải mở rộng scope thay vì bỏ sót.
- Nếu local summary chưa đủ để xác nhận expected result/product bug, phải đọc thêm testcase gốc, requirement/API/design liên quan.
- Nếu command/report/artifact không đủ để phân loại PASS/FAIL/SKIP chắc chắn, phải rerun hoặc thu thập thêm evidence.
- Nếu có trade-off giữa giảm token và kết quả execute đáng tin, ưu tiên kết quả execute đáng tin.

Output:
- Output root bắt buộc lấy từ `PROJECT_OUTPUT_DIR`.
- Nếu không có `PROJECT_OUTPUT_DIR`, dừng và yêu cầu user cung cấp; không dùng fallback hardcode.
- Nếu không có `TASK_KEY`, dừng và yêu cầu user cung cấp; không dùng fallback từ `JIRA_STORY_KEY` hoặc task cũ.
- Output cho scope này phải nằm trong:
  `<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/`

## Nguyên tắc bắt buộc

- Testcase phải được execute thật theo logic nghiệp vụ và expected result đã review.
- Không được pass ảo bằng cách skip case, mock sai mục đích, xóa assertion quan trọng, hoặc đổi expected result tùy tiện.
- **Evidence bắt buộc cho MỌI case đã execute (PASS và FAIL) và MỌI step**: mỗi case PASS/FAIL phải có evidence cụ thể (ảnh); mỗi step phải đánh dấu PASS/FAIL riêng và có 1 ảnh **highlight vào đúng element/vùng đang kiểm**. Case `TODO`/chưa chạy KHÔNG cần. Dùng `scripts/utils/evidence_recorder.js` để capture per-step + ghi `test-results/testcase-status.json` (`steps[]` kèm `status`+`evidence`). Push kèm `--with-evidence`; bật `--require-step-evidence` (hoặc `XRAY_REQUIRE_STEP_EVIDENCE=1`) để chặn push khi có case execute thiếu step-evidence.
- Không được skip testcase chỉ để tăng pass rate.
- Không được sửa test theo hướng làm giảm chất lượng kiểm thử hoặc giảm coverage.
- Không được đổi expected result nếu chưa chứng minh expected cũ sai bằng requirement, BA/PO confirmation, Swagger/OpenAPI, design, hoặc tài liệu nguồn đáng tin cậy.
- Mock/stub chỉ được dùng khi testcase yêu cầu fault injection, dependency ngoài scope, hoặc setup/rollback dữ liệu an toàn. Nếu mock làm testcase không còn validate đúng logic thật, phải điều chỉnh lại hoặc chạy bằng dữ liệu thật.
- Ưu tiên sửa root cause thay vì workaround: locator, timing, setup, test data, auth, dependency, cleanup, API/factory data, mock, timeout, hoặc execute flow.
- Không dựng state bằng DB và không dùng `TEST_DB_*`/`TEST_DATABASE_URL`/`DATABASE_URL`/`PG*`, không đọc toàn bộ source backend để execute. Ngoại lệ DUY NHẤT: read-only verify/chẩn đoán trên **UAT DB** qua guarded client `tests/support/setup/db/uatPgClient.ts` (chỉ `LIB_MASTER_DB_*`, read-only, chỉ SELECT). Kho UAT/PROD tách biệt — không cấu hình creds thì không truy cập được. Case cần trạng thái sâu mà không dựng được qua UI/API/fixture/hook thì ghi manual/semi-auto.
- Với testcase Design/Visual compliance (đối chiếu Figma): execute bằng `getComputedStyle` (màu/font/border-radius/padding) + `boundingBox` (kích thước/thứ tự/alignment/gap) so token trích từ Figma node, dùng dung sai; kiểm vị trí TƯƠNG ĐỐI, KHÔNG so pixel toạ độ tuyệt đối. Lệch ngoài dung sai ghi FAIL kèm giá trị build vs Figma; không tự nới dung sai để pass.
- Với testcase **Display/Field Conformance** (tên cột/label/format dữ liệu/thứ tự/số cột/field bắt buộc/empty-state): oracle phải **so khớp CHÍNH XÁC** với giá trị trong `requirements/ui_catalog.md`/FS — equality từng ký tự cho title/label; **regex** cho format (vd giờ `^\d{2}:\d{2}$`, datetime theo spec); đếm **đủ + đúng thứ tự + đúng tên** cột. **CẤM dùng "contains / tồn tại / count>0" làm oracle cho case hiển thị** (dễ pass ảo). Pattern bắt buộc: **extract-all** header/label/format hiển thị qua DOM rồi **compare vs catalog** → mọi khác biệt (kể cả nhỏ: hoa/thường, `-` vs `/`, thiếu 1 cột) = FAIL. Expected lấy từ catalog/tài liệu, **KHÔNG từ build**. Chụp **full-page/scroll ngang** để không sót cột ở bảng rộng.

## Shared Change Gate

Shared files gồm `tests/fe/**`, `tests/api/**`, `playwright.config.js`, `package.json`, runtime helper, fixture/page object/helper dùng chung và prompt/rule chung.

- Trước khi sửa shared file, phải xác định thay đổi đó là task-specific hay thay đổi chung.
- Nếu task-specific, ưu tiên sinh/sửa dưới `<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/automation/`.
- Nếu là thay đổi chung, phải có xác nhận rõ của user trước khi sửa.
- Nếu phải sửa shared file để execute đúng, execution summary bắt buộc ghi: file đã sửa, lý do, story có thể bị ảnh hưởng, regression scope đã chạy hoặc chưa chạy.
- Không sửa shared helper/config chỉ để một story pass nhanh nếu có thể xử lý bằng task-scoped automation.

## Automation Promote Review

Task-scoped automation không tự động trở thành regression suite chung.

- Sau khi Phase 2 PASS ổn định, có thể đề xuất promote automation vào `tests/fe/` hoặc `tests/api/`.
- Promote chỉ thực hiện khi user/QA/Automation review approve rõ.
- File promote vào core phải namespace theo `[TASK_KEY]`.
- Không xóa artifact gốc trong `<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/automation/`.
- Nếu chưa approve promote, ghi rõ `Automation promotion: Not requested / Pending review` trong execution summary.

## Review template và executor trước khi chạy

Trước khi execute, phải rà soát prompt/template/executor hiện tại và ghi nhận ngắn trong report:
- Template/executor đang hướng dẫn execute như thế nào.
- Điểm nào có thể làm testcase bị skip quá dễ, fail sai, flaky hoặc không validate đúng logic.
- Case nào đang có nguy cơ pass ảo vì thiếu assertion, mock sai mục đích, chỉ kiểm API thay UI khi testcase yêu cầu UI, hoặc không kiểm side-effect.
- Case hiển thị/format/label (Conformance/Design) có đang dùng oracle LỎNG (`contains`/tồn tại/`count>0`) thay vì **so exact vs `ui_catalog.md`** không; expected có bị lấy từ build thay vì tài liệu không (dễ pass ảo, mù lỗi tên cột/format/thiếu cột).
- Các rule skip hiện có có quá dễ dãi không.
- Thay đổi đã thực hiện để giảm skip/fail sai và tăng độ tin cậy.

## Thứ tự Phase 2 bắt buộc

0. **Nguồn testcase (mặc định `xray`)** — kéo testcase từ Xray về canonical local trước khi execute:
   `node scripts/integrations/jira/pull_testcases.js --dry-run` (xem trước) → kiểm tra số TC/steps đúng kỳ vọng → chạy lại với `--write` để ghi `test-cases/from-xray/[TASK_KEY]_from_xray.xlsx` + report `reports/xray-pull-summary.md`. Truyền `PROJECT_OUTPUT_DIR`/`TASK_KEY` (hoặc `TASK_ENV`) như mọi command. Yêu cầu `XRAY_CLIENT_ID`/`XRAY_CLIENT_SECRET` + Phase 1 ĐÃ publish testcase lên Xray; nếu pull không thấy Test nào → chưa publish (publish trước, hoặc tạm chạy `TESTCASE_SOURCE=excel`). Nếu report cảnh báo TC thiếu steps thì DỪNG và báo user. Từ Bước 1 trở đi, "Excel canonical" = file `from-xray/*.xlsx`. **Nếu `TESTCASE_SOURCE=excel`**: bỏ qua bước này, dùng `test-cases/*.xlsx` local.
1. Đọc `reports/phase1-summary.md` và `task.md` trước để xác định scope, coverage, testcase Excel files và rủi ro.
2. Đọc reviewed testcase từ nguồn canonical local (theo `TESTCASE_SOURCE`: mặc định `test-cases/from-xray/*.xlsx`, hoặc `test-cases/*.xlsx`) theo selected TC IDs/module; nếu chạy toàn bộ thì lập danh sách TC trước rồi mở Markdown liên quan khi cần Setup Strategy chi tiết.
3. Generate/update Playwright automation scripts nếu missing hoặc stale; mặc định sinh task-scoped automation dưới `<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/automation/`, chỉ sửa/generate spec/helper bị ảnh hưởng.
   Nếu cần sửa shared file, áp dụng `Shared Change Gate` trước.
4. Chuẩn bị dữ liệu test an toàn:
   - Ưu tiên tạo data bằng API/factory và rollback/cleanup sau test.
   - Không mutate dữ liệu business thật nếu không có rollback.
   - Nếu cần fixture có sẵn, phải verify fixture tồn tại qua API/UI/fixture verifier trước khi chạy.
   - Không setup/dựng state bằng DB. Read-only verify/chẩn đoán trên UAT DB được phép qua guarded client `tests/support/setup/db/uatPgClient.ts` (read-only, chỉ SELECT).
5. Execute selected testcases thật; nếu mode là ALL thì chạy suite theo nhóm hợp lý thay vì nhồi toàn bộ vào một lệnh khó debug.
6. Auto-heal lỗi automation/setup nếu có, tối đa 5 vòng cho mỗi nhóm lỗi nhưng mỗi vòng chỉ đọc/sửa file liên quan trực tiếp.
7. Rerun targeted các case FAIL/SKIP/flaky ít nhất 2 vòng sau khi đã sửa nguyên nhân không thuộc product bug. Chỉ rerun toàn suite khi thay đổi shared helper/auth/setup hoặc cần regression rộng.
8. Sau mỗi vòng chạy, phân tích:
   - Case nào PASS.
   - Case nào FAIL.
   - Case nào SKIP.
   - Vì sao FAIL/SKIP.
   - Fail/skip đến từ product bug, automation/harness, test data, setup/environment, dependency, mock/stub, timeout, flaky hay prompt chưa rõ.
9. Nếu FAIL/SKIP do setup, dữ liệu test, mock, timeout, dependency, auth, locator, cleanup hoặc execute flow, phải sửa và rerun.
10. Nếu FAIL còn lại là product/API contract issue, phải rerun testcase fail ít nhất 2-3 lần hoặc đủ để loại trừ flaky/setup trước khi kết luận.
11. Lưu Playwright JSON/HTML/evidence dưới:
    `<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/test-results/`
11b. **Cổng review hiển thị/visual (BẮT BUỘC nếu scope có UI)**: sau khi có screenshot, với MỖI màn đối chiếu (a) DOM-extract toàn bộ tên cột/label/format và (b) ảnh full-page vs `requirements/ui_catalog.md` + Figma/FS; liệt kê **MỌI deviation** (tên cột sai, format sai, thiếu/thừa/sai thứ tự cột, thiếu field, spacing/màu/radius/font lệch). Chụp full-page/scroll ngang để không sót cột. **KHÔNG tự lọc "lỗi nhỏ"**; mỗi deviation là 1 finding ứng viên, map về TC Conformance/Design tương ứng và ghi FAIL nếu lệch spec. Text-step automation không "nhìn" được toàn cảnh — nếu có vision-model/visual-diff thì dùng; nếu không, review ảnh có cấu trúc theo từng dòng của catalog (không bỏ dòng nào).
12. Phân loại mọi testcase đã execute thành `PASS`, `FAIL`, hoặc `SKIP` và cập nhật testcase output với `Actual Result` rõ ràng.
    Nếu có `RUN_ID`, không sửa testcase Markdown/Excel chính trong lúc execute; ghi phân loại vào run-scoped report/status.
    Đồng thời ghi file máy-đọc để đẩy trạng thái lên Xray: `test-results/testcase-status.json` (có `RUN_ID` thì `test-results/runs/[RUN_ID]/testcase-status.json`). **`status` dùng ĐÚNG tên trạng thái Xray**: `PASSED` | `FAILED` | `TO DO` | `EXECUTING` (case SKIP/blocker → `TO DO`, giữ lý do ở `comment`; đang chạy dở → `EXECUTING`). Schema:
    `{ "taskKey": "[TASK_KEY]", "generatedAt": "<ISO>", "tests": [ { "tcId": "<TC ID chính xác như Excel>", "status": "PASSED|FAILED|TO DO|EXECUTING", "comment": "<actual/lý do; nêu rõ nếu vốn là SKIP/BLOCKED>", "evidence": ["<path ảnh/video, tùy chọn>"], "steps": [ { "status": "PASSED|FAILED|TODO", "comment": "<tùy chọn>", "evidence": ["<path>"] } ], "failedStep": <index 1-based — shortcut thay cho steps[]>, "failedStepEvidence": ["<path>"] } ] }` — `tcId` phải khớp TC ID canonical để map đúng sang Xray Test. (Script vẫn nhận alias `PASS/FAIL/SKIP/BLOCKED` và tự map, nhưng ưu tiên tên Xray.)
    - **Case FAILED — BẮT BUỘC ghi rõ step nào fail + evidence ở step đó** (để Test Run hiện đúng bước lỗi, không chỉ FAIL tổng): dùng **`steps[]`** (status từng bước; bước lỗi `FAILED` kèm `evidence` là ảnh/video của chính bước đó; bước chưa chạy để `TODO`) HOẶC shortcut **`failedStep`** (index 1-based) + **`failedStepEvidence`** (kit tự suy: trước = PASSED, tại đó = FAILED + evidence, sau = TODO). `push_test_execution` map positional theo số step thật trên Xray (dư → cắt, thiếu → TODO).
    - **Case PASSED KHÔNG cần `steps[]`** — mặc định `XRAY_EXEC_STEP_STATUS=pass` tự set mọi step = PASSED. Nhưng **case PASSED VẪN bắt buộc có evidence cấp case là ảnh/video** (highlight + mask PII), không được bỏ trống.
    - **`evidence` CHỈ nhận ảnh (`.png/.jpg/.jpeg/.webp`) hoặc video (`.mp4/.webm`)** — cấm `.json/.md/.txt/.log/.html/.csv/trace.zip` hay file dữ liệu thô (kể cả `order_state.json`, dump API/state). Cần chứng minh dữ liệu → chụp ảnh màn hiển thị dữ liệu. Ảnh phải đúng màn (không 404/blank/sai bước), highlight đúng element, mask PII khách. Chi tiết: mục **Evidence — Quy chuẩn bắt buộc** trong `RULE_GLOBAL.md`.
    - **`comment` phải gọn, dễ đọc — KHÔNG dán debug.** 1–2 câu kết quả quan sát được; cấm `key=value`/dump state (`tx 2→2`, `editable=false`, `match=true`, `val="…"`, regex/selector); KHÔNG mở đầu bằng `[PASS]`/`[Positive]`/`[Negative]` (status đã có badge; kit tự tag SKIP/BLOCKED); caveat xuống dòng `Lưu ý:`; số/tiền dạng người đọc (`6.000.000đ`); KHÔNG placeholder kiểu `Xem xxx_results.json`. Chi tiết: mục **Comment kết quả (Test Execution) — Quy chuẩn trình bày** trong `RULE_GLOBAL.md`.
13. Sinh/cập nhật local execution summary dưới:
    `<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/reports/`
    Nếu có `RUN_ID`, ghi summary của run vào:
    `<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/reports/runs/[RUN_ID]/`
13b. **Đẩy trạng thái testcase lên Xray — tạo Test Execution từ `testcase-status.json`.** MẶC ĐỊNH `PUSH_XRAY_EXECUTION=confirm`: khi ĐÃ HOÀN TẤT cycle execute chính thức (đã triage, run conclusive), chạy **`--dry-run` trình PREVIEW** (tên execution, số PASS/FAIL/TO DO, Test Plan sẽ link) **cho QA duyệt; CHỈ chạy `--write` sau khi QA XÁC NHẬN**. **KHÔNG** đề xuất push cho run debug/chạy dở/`setup_failure` diện rộng. `=auto` để tạo ngay không cần hỏi (unattended/CI); `=0` để tắt hẳn.
    Lệnh: `node scripts/integrations/jira/push_test_execution.js --task [TASK_KEY] --story [JIRA_STORY_KEY] --project-output [PROJECT_OUTPUT_DIR]` (+ `--run-id [RUN_ID]` nếu có) → xem preview → **QA OK** → thêm `--write`.
    - **Guard**: thiếu Xray creds/status → bỏ qua mềm (không vỡ pipeline); run **0 PASSED/FAILED** (toàn TO DO) → KHÔNG tạo execution rác (`--force` nếu vẫn muốn).
    - **Title**: mỗi lần push tạo **1 Test Execution mới** — `[TASK_KEY] Test Execution - Lần <N> - <scope> - <version>`.
    - **Status map**: PASS→PASSED · FAIL→FAILED · SKIP/BLOCKED→"TO DO".
    - **Step-level** (mặc định `XRAY_EXEC_STEP_STATUS=pass`): test PASSED → MỌI step = PASSED (hết "TO DO"); case **FAILED** khai `steps[]` hoặc `failedStep` + evidence để hiện đúng bước lỗi; `off`/`mirror`/`--step-status` để đổi.
    - **Test Plan**: tự dò & link theo sprint + tự điền Sprint/Start date/SAPP-Due date (chi tiết `run_phase_re-run_template.md` 7b). Override `--test-plan`/`--no-test-plan`. **KHÔNG** auto-gắn **Fix versions** vào cột Details của Test Execution (bật lại nếu cần: `--fill-fixversions` hoặc `XRAY_EXECUTION_FILL_FIXVERSIONS=1`). *(Version vẫn hiển thị trong TÊN execution, không phải field Details.)*
    - **Assignee**: theo `JIRA_XRAY_ASSIGNEE` (task.env — QA điền tên/email); trống = không gán.
    - **Đóng execution**: `XRAY_EXECUTION_DONE_STATUS` (vd `Done`) → sau `--write` (đã QA duyệt) kit tự transition; trống = giữ Open; **KHÔNG** Done lúc tạo/khi chưa conclusive. (Test Plan Done cuối sprint — tách biệt.)
    - **Evidence & creds**: `--with-evidence` để đính ảnh; cần `XRAY_CLIENT_ID`/`XRAY_CLIENT_SECRET`.
    - **⚠️ Coverage (bài học)**: panel Test Coverage lấy **execution MỚI NHẤT** (theo `finishedOn`). ĐỪNG sửa tay step/status của execution CŨ khi đã có execution mới hơn — thao tác đó bump `finishedOn` khiến run cũ thành "mới nhất" → coverage lấy nhầm kết quả cũ. Panel NOK dù lần mới nhất đã pass → kiểm tra Xray *Requirement Coverage strategy = "Latest Execution"* (admin) + requirement type có trong *Coverable Issue Types*.
    - **Vòng giảm skip**: còn nhiều skip thì CHƯA push; skip tối thiểu → QA duyệt push (hoặc append `--execution-key`).
14. Đánh giá `Automation Promote Review`: giữ task-scoped, pending review, hoặc đã promote nếu có approval.
15. Chỉ chạy bước log bug Jira khi thỏa mãn toàn bộ điều kiện log bug bên dưới và user/prompt hiện tại cho phép.
16. Cập nhật:
    `<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/task.md`

## Chính sách SKIP

Chỉ được SKIP khi có lý do hợp lệ, rõ ràng và không thể tránh trong phạm vi hiện tại.

Lý do SKIP hợp lệ ví dụ:
- Hệ thống/endpoint ngoài scope hoặc chưa triển khai thật.
- Requirement mâu thuẫn khiến không thể xác định expected result.
- Môi trường không có quyền truy cập bắt buộc và không có cách thay thế an toàn.
- Dependency bên thứ ba bắt buộc không khả dụng và testcase không thể mock mà vẫn giữ đúng mục tiêu kiểm thử.
- Testcase cần dữ liệu không thể tạo/rollback an toàn trong môi trường hiện tại.
- Testcase cần trạng thái chỉ có thể dựng bằng DB/backend internal state nhưng workflow hiện tại không cho phép DB/backend access.

Không được SKIP vì:
- Locator khó.
- Test data chưa chuẩn nhưng có thể tạo bằng API/factory.
- Auth token/env sai nhưng có thể cấu hình lại.
- Timeout/timing/flaky chưa được xử lý.
- Mock hoặc setup chưa viết.
- Muốn tăng pass rate.

Với mỗi testcase SKIP còn lại, report bắt buộc ghi:
- TC ID.
- Tên testcase.
- Lý do SKIP cụ thể.
- Đã thử sửa gì.
- Có thể sửa để chạy được không.
- Nếu có thể sửa, plan sửa và lý do chưa sửa được trong lần này.
- Chủ sở hữu/blocker cần hỗ trợ nếu có.

Mỗi testcase SKIP/BLOCKED phải gắn ĐÚNG 1 **Blocker Root Cause** để route đúng owner (KHÔNG gộp thành "cần backend state", KHÔNG dùng DB):
- `needs_hook` (thiếu test hook) · `needs_account` (thiếu account/role) · `needs_sandbox` (thiếu sandbox dependency ngoài) → đưa vào `reports/capability-request.md`, owner Dev/DevOps.
- `spec_mismatch` (build khác spec) → nhánh Partial Rerun + BA/Dev align, KHÔNG phải product bug.
- `manual_inherent` (bản chất manual: file thật rất lớn, thao tác vật lý) → QA chạy tay.
- `external_dependency` (dependency thật ngoài scope/chưa sẵn sàng) → ghi blocker.
Bảng route chi tiết: skill `precondition_setup_planner` mục Blocker Root Cause.

## Nguyên tắc sửa lỗi khi rerun

- Không xóa assertion quan trọng.
- Không giảm phạm vi verify nếu testcase đang cover business rule/high-risk flow.
- Không đổi expected result nếu chưa có bằng chứng requirement/API/design xác nhận expected cũ sai.
- Không thay UI test bằng API-only test nếu testcase yêu cầu verify UI behavior, trừ khi ghi rõ phần UI không khả dụng và case được phân loại lại sau review.
- Không dùng mock/stub để bypass logic chính cần kiểm thử.
- Nếu dùng mock để test network/server error, mock phải đúng mục tiêu negative/fault-injection của testcase.
- Nếu tạo dữ liệu tạm, phải rollback/cleanup và report rõ.
- Nếu evidence screenshot/video trắng, phải capture lại bằng visual evidence page hoặc rerun với UI đã render.

## Tiêu chí hoàn thành Phase 2

Chỉ coi Phase 2 hoàn tất khi:
- Test suite đã được execute nhiều vòng theo rule trên.
- Số case SKIP là thấp nhất có thể.
- Mọi case SKIP còn lại đều có lý do hợp lệ và không thể tránh trong phạm vi hiện tại.
- Các case PASS thật sự validate đúng behavior/expected result, không pass do thiếu assertion hoặc skip logic.
- Không còn FAIL do prompt template chưa rõ, setup, test data, mock/stub sai, timeout, dependency, auth, locator hoặc execute flow.
- FAIL còn lại đã được rerun đủ để loại trừ flaky/setup và có evidence rõ ràng.
- Report cuối cùng có đủ tổng case, PASS/FAIL/SKIP, danh sách skip, lỗi đã sửa, rủi ro còn lại và Jira logging status.
- Report ghi rõ shared files có sửa hay không và trạng thái automation promotion.
- Không còn lỗi do output thiếu thông tin, artifact trắng/hỏng, report tiếng Việt không chuẩn, hoặc thiếu mapping testcase -> kết quả -> evidence.

## Execution summary bắt buộc

File chính:
`<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/reports/execution-summary.md`

Summary phải có:
- Tổng testcase trong scope.
- Tổng testcase đã execute.
- PASS / FAIL / SKIP / chưa chạy nếu có.
- Automation coverage: số case auto-executed, semi-auto/manual, blocker do thiếu API/hook/fixture/sandbox; không tính manual-only là product fail.
- Pass rate (thô) = `PASS / executed * 100`.
- **Unassisted pass rate** = `PASS không cần người can thiệp giữa chừng / executed * 100`. Bắt buộc tách riêng với pass rate thô để không che giấu chi phí human-in-the-loop.
- **Autonomy log**: số vòng execute, và số lần phải nhờ người cấp input giữa chừng (account/role, URL/route, seeded data, xác nhận thủ công); mỗi lần 1 dòng (loại input + vì sao automation không tự có được). Nếu = 0 ghi rõ `Không cần input người giữa chừng`.
- **Blocker root-cause breakdown**: đếm SKIP/BLOCKED theo `needs_hook`/`needs_account`/`needs_sandbox`/`spec_mismatch`/`manual_inherent`/`external_dependency` (skill `precondition_setup_planner`); mỗi nhóm kèm TC + owner/route. Capability gap (`needs_hook`/`needs_account`/`needs_sandbox`) đồng bộ vào `reports/capability-request.md`.
- Số vòng execute đã chạy, thời gian từng vòng, command từng vòng ở dạng ngắn gọn; không paste full console log.
- Bảng so sánh từng vòng: total, pass, fail, skip, flaky/retry nếu có.
- Danh sách lỗi automation/setup đã sửa giữa các vòng.
- Shared change log: file shared đã sửa, lý do, regression scope, hoặc ghi `Không sửa shared file`.
- Automation promotion status: `Not requested`, `Pending review`, `Approved and promoted`, hoặc `Rejected/Deferred`.
- Breakdown theo nhóm chức năng lấy động từ phần trước dấu `/` trong cột `Module`; không hardcode danh sách nhóm của một task cụ thể.
- Breakdown theo layer/site nếu xác định được: UI, API, E2E và các app/site thực tế trong scope.
- Danh sách testcase SKIP và lý do chi tiết theo chính sách SKIP. Nếu không có SKIP, ghi rõ `SKIP = 0`.
- Danh sách testcase FAIL gồm: failed step, expected result, actual result, main error, phân loại nguyên nhân, số lần rerun, evidence path.
- Với mỗi FAIL, phân loại nguyên nhân: automation/harness, test data/environment, dependency, timeout/flaky, requirement unclear, product bug, hoặc API contract mismatch.
- Evidence quality check: ảnh/video mở được, không trắng (log/response/trace là diagnostic, đối chiếu khi cần).
- **Display/Visual deviations**: danh sách khác biệt hiển thị phát hiện qua cổng review (mục 11b) — tên cột sai, format sai, thiếu/thừa/sai thứ tự cột, thiếu field, token màu/spacing/radius/font — **kể cả minor**; mỗi dòng map về TC Conformance/Design + verdict. Nếu không có, ghi rõ `Không có deviation hiển thị`.
- Jira logging status: chưa chạy, dry-run, đã tạo bug, hoặc bị skip theo yêu cầu user.

`task.md`, execution summary và execution results phải viết bằng tiếng Việt chuẩn có dấu; technical terms, endpoint, command, enum/status có thể giữ nguyên tiếng Anh.

## Điều kiện log bug lên Jira

Chỉ được log bug lên Jira khi đã đảm bảo đầy đủ các yếu tố sau:

- Testcase đã được execute thực sự, không phải pass/fail do skip hoặc chạy thiếu bước.
- Case fail đã được chạy lại ít nhất 2-3 lần để loại trừ flaky issue.
- Đã kiểm tra lỗi không đến từ:
  - Prompt template chưa rõ.
  - Test data sai hoặc thiếu.
  - Setup/environment lỗi.
  - Mock/stub không đúng.
  - Dependency chưa sẵn sàng.
  - Timeout hoặc lỗi execute flow.
  - Locator/test harness/cleanup/auth lỗi.
- Đã cố gắng sửa các lỗi khiến case bị skip/fail do test setup hoặc execute process.
- Case fail vẫn còn fail sau khi đã sửa các nguyên nhân không thuộc product bug.
- Expected result đã được xác nhận là đúng bằng requirement/API/design hoặc review hợp lệ.
- Actual result có evidence rõ ràng đã sanitize. Log/response/trace/error-context có thể dùng cho phân tích local, nhưng evidence upload lên Jira chỉ được là ảnh/video.
- Video evidence không bắt buộc cho mọi bug. Với case phức tạp mà screenshot không mô tả đủ chuỗi thao tác/trạng thái trước-sau lỗi, phải rerun với video và upload video kèm screenshot nếu có thể.

Không được log Jira bug nếu:
- Case đang bị SKIP.
- Case fail do prompt/test/setup chưa chuẩn.
- Chưa rerun để xác nhận.
- Chưa có evidence rõ ràng.
- Chưa xác nhận expected result.
- Failure có khả năng flaky nhưng chưa được phân loại/rerun đủ.

Khi log Jira bug:
- Jira Description chỉ được có đúng 4 phần, theo testcase/requirement:
  1. `Tiền điều kiện`
  2. `Bước`
  3. `Kết quả hiện tại`
  4. `Kết quả mong muốn`
- Không đưa `Evidence`, `Xác nhận trước khi log`, `Mức độ ảnh hưởng`, `Execution summary`, `TC ID`, `Source`, `Generated`, bảng kết quả test, link report hoặc metadata automation vào Jira Description.
- Evidence phải nằm ở Jira attachment bên dưới issue, không phải trong description.
- Với Jira attachment, chỉ dùng screenshot/video; không upload `.md`, `.txt`, `.log`, `.json`, `.zip`, `trace.zip`, `error-context.md` hoặc execution summary.
- Testcase liên quan, số lần rerun, các nguyên nhân đã loại trừ, mức độ ảnh hưởng và ghi chú flaky/environment phải ghi trong execution summary/report local, không ghi vào description.
- Không tự động tạo Jira comment/Activity khi log bug hoặc cập nhật bug. Chỉ comment lên Jira khi user yêu cầu rõ, hoặc khi có tình huống đặc biệt bắt buộc cần lưu vết trong Activity (vd báo kết quả re-verify sau khi Dev fix); khi đó phải nêu lý do trong report local. **Khi comment**: trình bày ngắn gọn + gạch đầu dòng, tag Dev bằng mention `[~accountid:...]`, và **nhúng ảnh evidence đã annotate/highlight inline** (đỏ=điểm lỗi, xanh=đã đúng) qua REST v2 wiki `!file|width=900!` — chi tiết ở `prompt_templates/phase2/08_log_bug_jira.md` (mục Evidence attachment + Jira comment).

Nếu đủ điều kiện log bug và user/prompt cho phép:
- Đọc prompt con: `prompt_templates/phase2/08_log_bug_jira.md`.
- Chạy dry-run trước:
  `node scripts/integrations/jira/bug_reporter.js --task [TASK_KEY] --story [JIRA_STORY_KEY] --project-output [PROJECT_OUTPUT_DIR] --dry-run`
- Chỉ tạo Jira thật khi user yêu cầu hoặc prompt hiện tại cho phép thay đổi Jira:
  `node scripts/integrations/jira/bug_reporter.js --task [TASK_KEY] --story [JIRA_STORY_KEY] --project-output [PROJECT_OUTPUT_DIR]`
- Bug Jira phải là child/sub-bug của đúng Story/Task `[JIRA_STORY_KEY]`, không tạo bug độc lập.
- Không in Jira token/credential.

Execution mode:
- [ALL_TESTCASES hoặc SELECTED_TESTCASES]
- Selected TC IDs: [SELECTED_TC_IDS hoặc N/A]

Extra instruction:
- [ANY_EXTRA_REQUEST hoặc N/A]
```
