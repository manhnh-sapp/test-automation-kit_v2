# Prompt Phase 2 - Thực thi Playwright API

> Chạy: `Đọc file này và chạy với TASK_KEY=<TASK_KEY>`. Tuân thủ `RULE_GLOBAL.md` và `.agent/rules/`.

> ⚡ **Kỷ luật execute (RULE_GLOBAL §"Execution Discipline"):** batch NHIỀU case/1 lượt (ÍT script toàn diện, chạy song song — không "mỗi case 1 vòng"); KHÔNG mặc định TODO/SKIP khi chưa thử (dùng hết fixture/deal/account đã cấp, case negative tự tạo input); KHÔNG hỏi lắt nhắt (gom câu hỏi 1 lần); báo cáo gộp, ít vòng.

> 🛑 **CHECKLIST 6 KHỐI — xác nhận TRƯỚC KHI execute** (forcing function; `output_gate` sẽ **CHẶN** nếu output vi phạm — đọc & làm, đừng lướt):
> 1. **Nguồn & scope** — `TASK_KEY`+`PROJECT_OUTPUT_DIR` có; đọc testcase canonical LOCAL (Xray/excel) + `.agent/config/project_context.md` + catalog Setup Strategy. KHÔNG dựa hội thoại cũ.
> 2. **Oracle độc lập** — mỗi case có "Kết quả mong đợi" cụ thể (status code/field/giá trị theo API contract). Oracle rỗng hoặc app==app (tautology) → DỪNG, lấy giá trị spec. *(gate: oracle-rỗng = CHẶN · tautology = cảnh báo)*
> 3. **Batch & drive thật** — gom NHIỀU case/ÍT script chạy song song; dùng hết fixture/deal/account; case negative tự tạo input (payload lỗi, ID không tồn tại). KHÔNG TODO/SKIP khi chưa thử.
> 4. **Phân tầng kết quả** — mỗi case → PASS/FAIL/SKIP/BLOCKED_SETUP/SKIP_SETUP. FAIL phải PHÂN TẦNG: product/API bug vs `setup_failure` vs infra/flaky. "Không phán được" KHÔNG thành PASS. *(gate: FAIL thiếu tầng-lỗi = CHẶN)*
> 5. **Loại flaky** — FAIL rerun 2–3 lần loại flaky/setup TRƯỚC khi kết luận product/API bug / log Jira.
> 6. **Evidence** — mọi case (PASS+FAIL)+step có ảnh/video đúng màn (response/assertion hiển thị), highlight, mask PII; case phức tạp có video. CẤM `.json/.md/.log`. *(gate: thiếu evidence/step-status = CHẶN)*

> 📋 **Attestation (G6) — sau execute, ghi vào `testcase-status.json`:** field `attestation` = `{ "oracleSource": "<xray|spec|api-contract>", "executed": <số case đã chạy>, "allEvidenceAttached": true, "failuresClassified": true, "rerunDone": true }`. Gate ĐỐI CHIẾU tự-khai với sự thật (executed thật, evidence, tầng-lỗi) — lệch = cảnh báo. Khai ĐÚNG, đừng tick suông.

> 🧩 **Helper (tuỳ chọn) — `scripts/utils/test_context.js`:** automation standalone có thể `const ctx = createTestContext({ taskKey, tcId })` để gom sẵn 1 chỗ: `ctx.evidence()` (EvidenceRecorder đúng task/run), `ctx.onCleanup(fn)`/`ctx.runCleanup()` (dọn data LIFO), `ctx.taskOutputDir`/`ctx.metadata` — thay vì tự wire rời rạc.

# Vai trò
Bạn là Senior API Test Engineer dùng Playwright API mode.

# Nhiệm vụ
Thực thi BE API testcases bằng Playwright request context, không mở browser.

# Đầu vào
- Swagger URL: [SWAGGER_URL_OR_ENV_KEY]
- Base URL: [BASE_URL_OR_ENV_KEY]
- Auth: lấy động từ API login hoặc env, không hardcode token.
  - **App KHÔNG có login API sạch (SPA tự refresh token, vd OPS)**: dùng **Token Broker** (`tests/fe/support/auth/tokenBroker.ts`) — giữ 1 phiên SPA đã login sống (`ensureOpsAuth`/`loginOps`) rồi gọi `brokerRequest(page, method, url, {data})`; token lấy TƯƠI từ request thật của SPA, 401/403 tự reload→refresh→retry. **KHÔNG dán `OPS_API_TOKEN` thủ công / KHÔNG F12 lại giữa chừng** — chỉ cần user/password trong `task.env`, execute không đứt dù token 30' hết.
- Project Context: `.agent/config/project_context.md`
- Env Template: `.env.example`
- Project Output: `<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/`
- RUN_ID: optional; bắt buộc nếu chạy song song cùng một `TASK_KEY`.
  Khi có `RUN_ID`, không sửa testcase Markdown/Excel chính trong lúc execute; ghi status/actual/evidence vào run-scoped report/status.
- Swagger env: `App 1_SWAGGER_URL`, `APP2_SWAGGER_URL`
- API base env: `App 1_API_BASE_URL`, `APP2_API_BASE_URL`
- Testcases: nguồn canonical local theo `TESTCASE_SOURCE` — **mặc định `xray`** (`<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/test-cases/from-xray/*.xlsx`, kéo từ Xray ở Bước 0), hoặc `excel` (`[PATH_TO_TESTCASE_XLSX]` / `test-cases/*.xlsx`). Execute đọc file local — không gọi Jira/Xray từng case.

# Precondition Resolution Pass (bắt buộc, chạy TRƯỚC khi generate/execute)

Cho toàn bộ selected TC, chạy pass này trước khi sinh hoặc chạy bất kỳ spec nào:

1. Đọc selected TC từ nguồn canonical local (theo `TESTCASE_SOURCE`: mặc định `test-cases/from-xray/*.xlsx`) trước, sau đó đọc `### Precondition Execution Matrix` trong `reports/phase1-summary.md` (và catalog `## Setup Strategy (Hợp đồng tiền điều kiện)` trong file testcase Markdown khi cần chi tiết).
2. Với mỗi selected TC, map `Setup Method`:
   - `api` → gọi business/public test API theo `Setup Source`.
   - `factory`/`test_hook` → dùng factory/hook tương ứng.
   - `pre_existing`/`pre_existing_fixture` → verify fixture tồn tại, không tạo mới.
   - `ui` → chỉ setup qua UI khi không có API/factory và vẫn đúng mục tiêu testcase.
   - `manual` (`Readiness=Manual-only`) → không tự setup, đánh dấu SKIP hợp lệ kèm lý do.
3. Reuse setup layer dùng chung `tests/support/setup/` (factories/hooks/fixtures/cleanup/contracts); phần đặc thù story tạo task-scoped trong `<TASK_OUTPUT_DIR>/automation/setup/` (namespace theo `RUN_ID` nếu chạy song song). Không sửa shared khi story khác đang chạy. Không thêm DB client/DB query mới (chỉ dùng guarded client `db/uatPgClient.ts` cho read-only verify UAT). Setup/verify fail ném/được phân loại `SetupFailure` → `setup_failure`.
4. Verify precondition theo `Setup Verification` TRƯỚC khi gọi request chính/assertion. Verify fail thì KHÔNG chạy bước test chính.
5. Nếu setup/verify fail → phân loại `setup_failure` (KHÔNG phải product/API bug, KHÔNG log Jira): sửa setup/data/auth/hook/env rồi rerun. `Readiness=Needs hook` mà capability (hook/mock/sandbox) chưa có → `BLOCKED_SETUP` + nêu missing capability cụ thể. `Readiness=Manual-only` → `SKIP_SETUP` + lý do.
6. Sau khi chạy xong (PASS/FAIL), cleanup theo `Cleanup/Rollback`, scope theo `RUN_ID`; ghi rõ data đã dọn / lý do không dọn được.

Ghi kết quả vào execution summary mục `Precondition Resolution`: mỗi TC → setup method, verify pass/fail, blocker (nếu có), cleanup status. Chỉ khi precondition đã verify đạt mà response vẫn sai contract mới được phân loại product/API bug.
Nếu precondition chỉ có thể DỰNG bằng DB hoặc backend internal state → `Manual-only`/`BLOCKED_SETUP` + manual steps (không dựng state bằng DB). VERIFY state có thể dùng read-only UAT DB qua guarded client `tests/support/setup/db/uatPgClient.ts` (read-only, chỉ SELECT) khi API/UI không expose.

# Các bước thực thi
1. Echo `PROJECT_OUTPUT_DIR`, `TASK_KEY`, `TASK_OUTPUT_DIR`, `RUN_ID` nếu có; nếu sai task thì dừng.
2. Đọc `.agent/config/project_context.md` và testcase API từ nguồn canonical local theo `TESTCASE_SOURCE` (mặc định `test-cases/from-xray/*.xlsx`; `excel` → `test-cases/*.xlsx`).
3. Chạy `Precondition Resolution Pass` (section ở trên) cho toàn bộ selected TC trước khi generate/execute. Dùng Swagger spec từ App 1 hoặc App 2 theo testcase; KHÔNG tự đoán payload nếu contract đã có.
4. Gọi request.post/get/put/delete theo từng TC.
5. Assert status code, response body schema, headers và response time.
6. Cập nhật testcase output: Status + Actual Result + Evidence/log path.
   Nếu có `RUN_ID`, chỉ cập nhật run-scoped report/status, không ghi trực tiếp testcase Markdown/Excel chính.
   - Với API FAIL thuần, chụp ảnh visual evidence page hiển thị request/response đã redact (log text chỉ để debug local, KHÔNG phải evidence).
   - Khi log Jira cho API FAIL, không upload log/text/markdown/JSON; nếu cần attachment Jira, render visual evidence page hoặc screenshot response summary đã sanitize.
   - Với API FAIL nằm trong UI/E2E flow hoặc cần chứng minh hành vi người dùng, kèm screenshot fail; flow phức tạp cần video.
7. Chạy selected API suite/TC IDs/endpoints trước; chỉ chạy toàn bộ API suite khi mode yêu cầu ALL hoặc vừa sửa shared API client/auth/schema helper.
   Automation mới sinh mặc định ghi dưới `<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/automation/`; chỉ ghi vào `tests/api/` khi cần core suite và file đã namespace theo `[TASK_KEY]`.
8. Với case FAIL/SKIP/flaky, sửa nguyên nhân không thuộc product bug rồi rerun targeted ít nhất 2 vòng; chỉ full rerun khi thay đổi shared layer.
9. Sau mỗi vòng chạy, phân tích PASS/FAIL/SKIP và nguyên nhân fail/skip.
10. PASS -> next TC khi assertion thực sự validate đúng status/schema/body/business rule.
11. FAIL -> retry/auto-heal nếu lỗi do auth/setup/data/mock/dependency/timeout/test code; sau khi sửa phải rerun.
12. Nếu FAIL còn lại là product/API contract issue, rerun case fail theo ngưỡng `.agent/config/verdict_taxonomy.json` §rerun (min–max, hiện 2–3 lần) để loại trừ flaky/setup trước khi kết luận.
13. SKIP chỉ được phép khi không thể chạy sau khi đã thử sửa setup/data/dependency hợp lý; report phải ghi TC ID, lý do skip, có thể sửa để chạy được không.
14. Jira bug chỉ xử lý sau khi execution report hoàn tất, fail đã được rerun/xác nhận và user/prompt cho phép.

# Quy tắc bắt buộc
- Không được đổi expected status/body tùy tiện để làm test PASS.
- Không được bỏ schema/body assertion quan trọng.
- Không được mock API chính đang cần kiểm thử contract thật, trừ khi testcase là fault injection hoặc dependency ngoài scope.
- Không được skip case vì thiếu data nếu có thể tạo data bằng API/factory và rollback.
- Setup phải theo Setup Strategy contract (PRE-NN): setup bằng `Setup Source`, verify bằng `Setup Verification`, rollback bằng `Cleanup/Rollback`. Skip vì setup chỉ hợp lệ khi `Automation Readiness = Manual-only`; `Needs hook` thiếu hook thì ghi blocker + đề xuất hook, không false-pass.
- Không dùng direct DB connection, `TEST_DB_*`, `TEST_DATABASE_URL`, `DATABASE_URL`, `PG*` hoặc backend source inspection để làm tiền điều kiện (DỰNG state). Read-only verify/chẩn đoán trên **UAT DB** được phép qua guarded client `tests/support/setup/db/uatPgClient.ts` (chỉ `LIB_MASTER_DB_*`, read-only, chỉ SELECT); DB không phải evidence Jira, PII phải mask.
- Nếu token/auth/env sai, phải sửa cấu hình và rerun trước khi cân nhắc skip.
- Không coi API execution hoàn tất nếu còn fail do prompt chưa rõ, setup, test data, auth, dependency, timeout hoặc execute flow.

# Verify GIÁ TRỊ dữ liệu BE trả về — không chỉ status/schema (BẮT BUỘC)

**Phải NHẠY BÉN khi execute**: áp phản xạ điều tra trong **`.agent/rules/qa_instincts.md`** — `200` KHÔNG có nghĩa là đúng (đọc body: `errors`/`success:false`/`data` rỗng; GraphQL gần như luôn 200 kể cả khi lỗi). Đọc response message cho 4xx/5xx để phân loại đúng (input test vs auth `BLOCKED` vs BE `FAIL`).

Status `200` + schema đúng KHÔNG đủ để PASS. Bug logic/dữ liệu BE lọt nhiều nhất ở tầng **giá trị**:
- **Value đúng, không chỉ kiểu**: assert đúng GIÁ TRỊ nghiệp vụ trong body (id/tên/số/tổng/trạng thái/quan hệ) so với giá trị đã **tính độc lập**, không chỉ "có field, đúng type".
- **Phân biệt trạng thái rỗng**: `null` vs `""` vs `[]` vs thiếu hẳn key vs `0` theo spec. Field "trống" **trái spec** = bug, KHÔNG bỏ qua.
- **Tính toán/tổng/đếm/pagination**: kết quả tính, `total`/`page`/`hasNext` khớp dữ liệu thực; foreign key resolve đúng tên (không lộ id thô / `undefined`).
- **Data consistency**: cùng dữ liệu ở nhiều endpoint/nhiều màn phải KHỚP nhau — đối chiếu chéo.
- **Sensitive/internal field**: response KHÔNG lộ password/hash/token/PII vượt quyền/internal flag; nếu lộ = **security bug** (log theo mục Security).
- Khi kết quả bất thường/nghi ngờ, đối chiếu lại request đã gửi (query/path/body/header) để loại trừ lỗi test trước khi kết luận product/API bug.

# Evidence & Comment (BẮT BUỘC — theo RULE_GLOBAL)
- Evidence bắt buộc cho MỌI case đã execute (PASS và FAIL) + MỌI step. Hợp lệ CHỈ ảnh/video (`.png/.jpg/.jpeg/.webp/.mp4/.webm`) — CẤM `.json/.md/.txt/.log/.html/.csv/trace.zip`. Với API: chụp ảnh visual evidence page hiển thị response/data đã render; log request/response chỉ là diagnostic local, KHÔNG phải evidence. Mask PII khách + redact token/secret. Luồng phức tạp/cross-app → kèm video.
- `comment` (Test Run) gọn 1–2 câu kết quả; KHÔNG dán debug (key=value, dump response, regex); KHÔNG prefix trạng thái (`[PASS]/[Positive]/[Negative]`); caveat xuống dòng `Lưu ý:`; KHÔNG placeholder `Xem xxx.json`. Chi tiết: RULE_GLOBAL §Evidence + §Comment.

# Quy tắc kỹ thuật API
- Dùng request context, không dùng page/browser.
- Token lấy động qua API login hoặc env; không hardcode.
- Site URLs, credential và integration links lấy từ env variables hoặc `.agent/config/project_context.md`.
- API base URL và Swagger URL phải lấy từ `App 1_API_BASE_URL` / `App 1_SWAGGER_URL` hoặc `APP2_API_BASE_URL` / `APP2_SWAGGER_URL`.
- Không ghi password/token vào logs, `task.md` hoặc testcase output.
- Test data: `auto_api_[testName]_[timestamp]@test.com`.
- Validate contract schema bằng zod hoặc `expect().toMatchObject`.
- Sau mỗi TC, bắt buộc cập nhật testcase output với `Status`, `Actual Result`, `Evidence`.
- `Actual Result` của case FAIL phải rõ: endpoint/method, request data chính, expected status/body, actual status/body, assertion error và log/evidence path.
- Khi ghi `testcase-status.json`, **case FAILED phải kèm step nào fail + evidence của bước đó**: điền `steps[]` (bước lỗi `FAILED` + `evidence`; bước chưa chạy `TODO`) hoặc shortcut `failedStep` + `failedStepEvidence` (schema ở `run_phase2_template.md`) — để Test Execution hiện đúng bước lỗi thay vì chỉ FAIL tổng.
- API evidence không được chứa bearer token, password, cookie, API key hoặc secret khác; phải redact trước khi ghi file/report/Jira.
- Nếu testcase API là một phần của luồng phức tạp, nhiều bước hoặc cross-site, lưu thêm video/screenshot từ browser flow liên quan nếu có.
- Jira attachment chỉ được là ảnh/video. Không upload `.md`, `.txt`, `.log`, `.json`, `.zip`, `trace.zip`, `error-context.md` hoặc execution summary lên Jira.
- Không ghi actual result chung chung như `API failed`; phải nêu response thực tế quan sát được.

# Đầu ra
- Task-scoped automation mặc định: `<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/automation/`
- Core API spec chỉ khi được approve/merge vào regression: `tests/api/[TASK_KEY].api.spec.ts`
- Shared API fixture/helper chỉ sửa khi cần thay đổi chung và đã ghi rõ trong report: `tests/api/fixtures/api-auth.ts`
- `<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/test-results/playwright-report/`
- `<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/test-results/results.json`
- Nếu có `RUN_ID`, dùng:
  - `<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/test-results/runs/[RUN_ID]/playwright-report/`
  - `<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/test-results/runs/[RUN_ID]/results.json`
  - `<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/test-results/runs/[RUN_ID]/artifacts/`
- Testcase output đã cập nhật Status, Actual Result, Evidence.
- Nếu có `RUN_ID`, Status, Actual Result, Evidence nằm trong run-scoped report/status và không ghi đè testcase Markdown chính.
