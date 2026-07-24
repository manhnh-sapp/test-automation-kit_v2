# Prompt Phase 2 - Thực thi Playwright UI

> Chạy: `Đọc file này và chạy với TASK_KEY=<TASK_KEY>`. Tuân thủ `RULE_GLOBAL.md` và `.agent/rules/`.

> ⚡ **Kỷ luật execute (RULE_GLOBAL §"Execution Discipline"):** batch NHIỀU case/1 lượt (ÍT script toàn diện, chạy song song — không "mỗi case 1 vòng"); KHÔNG mặc định TODO/SKIP khi chưa thử (dùng hết fixture/deal/account đã cấp, case negative tự tạo input); KHÔNG hỏi lắt nhắt (gom câu hỏi 1 lần); báo cáo gộp, ít vòng.

> 🛑 **CHECKLIST 6 KHỐI — xác nhận TRƯỚC KHI execute** (forcing function; `output_gate` sẽ **CHẶN** nếu output vi phạm — đọc & làm, đừng lướt):
> 1. **Nguồn & scope** — `TASK_KEY`+`PROJECT_OUTPUT_DIR` có; đọc testcase canonical LOCAL (Xray/excel) + `.agent/config/project_context.md` + catalog Setup Strategy. KHÔNG dựa hội thoại cũ.
> 2. **Oracle độc lập** — mỗi case có "Kết quả mong đợi" cụ thể (giá trị/URL/element theo spec). Oracle rỗng hoặc app==app (tautology) → DỪNG, lấy giá trị spec. *(gate: oracle-rỗng = CHẶN · tautology = cảnh báo)*
> 3. **Batch & drive thật** — gom NHIỀU case/ÍT script chạy song song; dùng hết fixture/deal/account; case negative tự tạo input. KHÔNG TODO/SKIP khi chưa thử.
> 4. **Phân tầng kết quả** — mỗi case → PASS/FAIL/SKIP/BLOCKED_SETUP/SKIP_SETUP. FAIL phải PHÂN TẦNG: product bug vs `setup_failure` vs infra/flaky. "Không phán được" KHÔNG thành PASS. *(gate: FAIL thiếu tầng-lỗi = CHẶN)*
> 5. **Loại flaky** — FAIL rerun 2–3 lần loại flaky/setup TRƯỚC khi kết luận product bug / log Jira.
> 6. **Evidence** — mọi case (PASS+FAIL)+step có ảnh/video đúng màn, highlight, mask PII; case phức tạp có video. CẤM `.json/.md/.log`. *(gate: thiếu evidence/step-status = CHẶN)*

# Vai trò
Bạn là Senior Automation Engineer chuyên Playwright TypeScript.

# Nhiệm vụ
Thực thi FE/UI/E2E test cases bằng Playwright browser mode.

# Đầu vào
Framework:
- Language: TypeScript
- Tool: Playwright Test + Playwright MCP
- Pattern: Page Object Model (POM)
- Report: Playwright HTML Reporter
- Testcase output: cập nhật `Status` = PASS/FAIL/SKIP và `Actual Result` sau execution.

Input:
- Test Cases: nguồn canonical local theo `TESTCASE_SOURCE` — **mặc định `xray`** (`<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/test-cases/from-xray/*.xlsx`, kéo từ Xray ở Bước 0), hoặc `excel` (`[PATH_TO_TESTCASE_XLSX]` / `test-cases/*.xlsx`). Execute đọc file local — không gọi Jira/Xray từng case.
- URL: [URL staging]
- Credentials: lấy từ env variables, không hardcode credential.
- Project Context: `.agent/config/project_context.md`
- Env Template: `.env.example`
- Project Output: `<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/`
- RUN_ID: optional; bắt buộc nếu chạy song song cùng một `TASK_KEY`.
  Khi có `RUN_ID`, không sửa testcase Markdown/Excel chính trong lúc execute; ghi status/actual/evidence vào run-scoped report/status.

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
4. Verify precondition theo `Setup Verification` TRƯỚC khi mở UI/gọi assertion chính. Verify fail thì KHÔNG chạy bước test chính.
5. Nếu setup/verify fail → phân loại `setup_failure` (KHÔNG phải product bug, KHÔNG log Jira): sửa setup/data/auth/hook/env rồi rerun. `Readiness=Needs hook` mà capability (hook/mock/sandbox) chưa có → `BLOCKED_SETUP` + nêu missing capability cụ thể. `Readiness=Manual-only` → `SKIP_SETUP` + lý do.
6. Sau khi chạy xong (PASS/FAIL), cleanup theo `Cleanup/Rollback`, scope theo `RUN_ID`; ghi rõ data đã dọn / lý do không dọn được.

Ghi kết quả vào execution summary mục `Precondition Resolution`: mỗi TC → setup method, verify pass/fail, blocker (nếu có), cleanup status. Chỉ khi precondition đã verify đạt mà behavior vẫn sai mới được phân loại product bug.
Nếu precondition chỉ có thể DỰNG bằng DB hoặc backend internal state → `Manual-only`/`BLOCKED_SETUP` + manual steps (không dựng state bằng DB). VERIFY state có thể dùng read-only UAT DB qua guarded client `tests/support/setup/db/uatPgClient.ts` (read-only, chỉ SELECT) khi API/UI không expose.

# Các bước thực thi
1. Echo `PROJECT_OUTPUT_DIR`, `TASK_KEY`, `TASK_OUTPUT_DIR`, `RUN_ID` nếu có; nếu sai task thì dừng.
2. Đọc `.agent/config/project_context.md` và testcase từ nguồn canonical local theo `TESTCASE_SOURCE` (mặc định `test-cases/from-xray/*.xlsx`; `excel` → `test-cases/*.xlsx`).
3. Chạy `Precondition Resolution Pass` (section ở trên) cho toàn bộ selected TC trước khi generate/execute. KHÔNG tự đoán endpoint/payload/fixture nếu contract đã có; nếu contract sai/khác thực tế thì sửa contract và ghi rõ, không đoán ngầm.
4. Generate/update Playwright script nếu missing/stale. Mặc định ghi spec/helper story-specific dưới `<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/automation/`; chỉ ghi vào `tests/fe/` khi cần core suite và file đã namespace theo `[TASK_KEY]`.
5. Execute testcase thật theo đúng steps/expected, không được skip để tăng pass rate.
6. Chạy selected suite/TC IDs trước; chỉ chạy toàn bộ FE/UI/E2E suite khi mode yêu cầu ALL hoặc vừa sửa shared helper/auth/setup có rủi ro regression rộng.
7. Với case FAIL/SKIP/flaky, sửa nguyên nhân không thuộc product bug rồi rerun targeted ít nhất 2 vòng; chỉ chạy vòng full-suite bổ sung khi lỗi/fix ảnh hưởng shared layer.
8. Sau mỗi vòng chạy, phân tích PASS/FAIL/SKIP và nguyên nhân fail/skip.
9. Nếu automation fail do locator/timing/test code/setup/data/mock/timeout/dependency, auto-heal và rerun tối đa 5 vòng cho từng nhóm lỗi.
10. Nếu testcase bị SKIP, phải ghi TC ID, lý do skip, đã thử sửa gì, có thể sửa để chạy được không; nếu sửa được thì ưu tiên sửa và rerun thay vì giữ skip.
11. Nếu product fail, rerun case fail 2-3 lần để loại trừ flaky/setup, rồi lưu evidence theo rule bên dưới.
12. Cập nhật testcase output và execution summary. Nếu có `RUN_ID`, chỉ cập nhật run-scoped report/status, không ghi trực tiếp testcase Markdown/Excel chính.
13. Chỉ log Jira sau khi report PASS/FAIL/SKIP hoàn tất, fail đã được rerun/xác nhận và user/prompt cho phép.

# Quy tắc bắt buộc
- Không được xóa assertion quan trọng hoặc giảm phạm vi verify để làm case PASS.
- Không được đổi expected result nếu chưa có bằng chứng requirement/API/design xác nhận expected cũ sai.
- Không được mock/stub logic chính mà testcase cần kiểm thử thật.
- Mock chỉ dùng cho fault injection hoặc dependency ngoài scope và phải ghi rõ trong actual result/report.
- PASS chỉ hợp lệ khi testcase thực sự validate behavior/expected result.
- SKIP chỉ hợp lệ khi không thể chạy sau khi đã thử sửa setup/data/dependency hợp lý.
- SKIP vì setup chỉ hợp lệ khi `Automation Readiness = Manual-only` trong Setup Strategy contract. Với `Ready`, phải setup theo `Setup Source`, không được skip vì setup. Với `Needs hook` mà hook chưa tồn tại, ghi blocker + đề xuất hook, không false-pass và không skip âm thầm.
- Không dùng direct DB connection, `TEST_DB_*`, `TEST_DATABASE_URL`, `DATABASE_URL`, `PG*` hoặc backend source inspection để làm tiền điều kiện (DỰNG state). Read-only verify/chẩn đoán trên **UAT DB** được phép qua guarded client `tests/support/setup/db/uatPgClient.ts` (chỉ `LIB_MASTER_DB_*`, read-only, chỉ SELECT); DB không phải evidence Jira, PII phải mask.
- Không coi FE/UI/E2E execution hoàn tất nếu còn fail do prompt chưa rõ, locator, setup, data, auth, mock sai, timeout hoặc execute flow.

# Quan sát sâu khi execute — Nghi ngờ hiển thị & đối chiếu Network/API (BẮT BUỘC)

Automation dễ **false PASS/false FAIL** khi chỉ tin DOM đã render. Với MỌI giá trị hiển thị đáng ngờ, phải soi xuống tầng dữ liệu TRƯỚC khi kết luận — không đoán.

**Phải NHẠY BÉN khi execute**: áp đầy đủ phản xạ điều tra trong **`.agent/rules/qa_instincts.md`** (khoanh tầng lỗi FE/BE/setup/env/auth, đối chiếu source of truth = API response, signal catalog Nhóm 1–4) cho MỌI tín hiệu là lạ — field trống, số 0, "thành công" nhưng không đổi, count=0, data cũ, 200-mà-body-lỗi, latency cao... KHÔNG kết luận PASS/FAIL trước khi khoanh được tầng lỗi. Đây là bắt buộc, không phải tùy chọn.

## Khi nào phải nghi ngờ (trigger)
Bất kỳ field/ô/cột nào: **trống**, `-`, `N/A`, `0`, `--:--`, `undefined`/`null`/`[object Object]`, sai format, số/tổng trông lạ, danh sách rỗng, badge/trạng thái không khớp, ảnh/label không lên. "Trống" CÓ THỂ đúng (spec cho phép) HOẶC sai (BE không trả / FE không render) — BẮT BUỘC kiểm, KHÔNG mặc định đúng.

## Cách kiểm (inspect → Network → API → preview)
1. **Inspect DOM thật**: đọc giá trị thực qua `locator.textContent()` / `inputValue()` / `evaluate(el => getComputedStyle(el))` — xác nhận trống thật hay chỉ bị ẩn/overflow/màu trùng nền/chưa load xong.
2. **Bắt Network**: capture response API của màn đó — `page.waitForResponse(/<endpoint>/)` hoặc `page.on('response', ...)`; với Playwright MCP mở DevTools → tab **Network** → chọn request → **Preview/Response** xem body thực trả về.
3. **Đối chiếu response ↔ UI**, phân loại 3 nhánh:
   - BE **CÓ** trả giá trị nhưng UI trống/sai → **FE render/mapping bug** (product bug → log).
   - BE trả `null`/`""`/`[]`/thiếu key/`0` **trái spec** → **BE/data bug** (product bug → log).
   - BE trả rỗng và **spec cho phép rỗng** → **PASS đúng** (không phải bug), nhưng phải ghi rõ "đã xác nhận bằng response".
4. **Chốt Actual bằng cả 2 tầng**: ghi giá trị UI quan sát + giá trị response tương ứng (redact token, mask PII) để phân loại đúng FE-bug vs BE-bug vs đúng-rỗng, không kết luận chỉ dựa DOM.

## Responsive (khi requirement/design có đề cập)
Chạy lại màn ở nhiều viewport (mobile 375 / tablet 768 / desktop ≥1440): kiểm reflow, ẩn-hiện đúng, không overflow ngang, không mất nội dung/nút, không đè chồng — qua `boundingBox()` / `getComputedStyle` + screenshot mỗi breakpoint. Kiểm **hiện diện & không tràn**, KHÔNG so toạ độ tuyệt đối.

## Mobile-web behavior (thiết bị thật, KHÔNG chỉ viewport hẹp)
Viewport 375 chỉ là desktop thu nhỏ — KHÔNG có touch/UA/isMobile nên bỏ lọt hành vi mobile-only. Khi scope có mobile web, **emulate thiết bị thật** trong script task-scoped:

```js
const { chromium, devices } = require('@playwright/test');
const ctx = await browser.newContext({ ...devices['iPhone 13'] }); // có hasTouch/isMobile/userAgent
const page = await ctx.newPage();
```
(Chạy suite `tests/mobile-web/` thì đã có sẵn qua project `iphone-13`/`pixel-7` trong `playwright.config.js` — `npm run test:mobile-web`.)

Kiểm khi execute:
- **Touch target ≥ 44px**: `boundingBox()` của nút/link bấm được, `Math.min(w,h) >= 44`.
- **Cử chỉ cảm ứng**: dùng `.tap()` (không phải `.click()`), swipe/scroll; hamburger/bottom-sheet/drawer mở đúng.
- **Orientation**: đổi `viewport` portrait ↔ landscape, kiểm reflow không mất nút/nội dung.
- **Mạng yếu/offline**: `context.setOffline(true)` (offline) hoặc CDP `Network.emulateNetworkConditions` (slow-3G, chỉ chromium) → báo lỗi, không crash, không tạo bản ghi mồ côi (bắc cầu Resilience).
- Ghi rõ thiết bị đã test trong Actual; evidence là screenshot ở device emulation.

## Kỷ luật
- KHÔNG kết luận PASS/FAIL cho case có giá trị đáng ngờ nếu CHƯA đối chiếu response.
- Response chỉ để **chẩn đoán/phân loại**; **evidence Jira vẫn phải là ẢNH màn UI** hiển thị giá trị đó. Cần chứng minh data BE → render **visual evidence page** hiển thị response đã redact rồi screenshot, KHÔNG đính file JSON thô (theo Evidence rule bên dưới).

# Phủ dropdown/filter khi execute — testcase ghi 1 giá trị, execute VÉT HẾT (BẮT BUỘC)

Gen chỉ ghi 1 giá trị mẫu trong testcase (tránh nổ số case). Khi execute thì **phải check hết tất cả giá trị**, KHÔNG dừng ở giá trị mẫu:
- **Kiểm kê option (vét hết, rẻ)**: đọc TOÀN BỘ option 1 lần, verify đủ số lượng + đúng label/thứ tự/default so spec/tài liệu (KHÔNG lấy oracle từ build).
- **Hành vi lọc — mặc định vét hết bằng data-driven loop**: lặp qua **từng option**, chọn → verify kết quả lọc đúng **tập con của chính option đó** (không thừa/thiếu). Đây là default, không rút về 1 giá trị.
  - Ngoại lệ rút gọn: danh sách option **không giới hạn / rất lớn** (async search, hàng nghìn giá trị) → chạy đại diện mỗi lớp + biên và **ghi rõ lý do rút gọn** trong Actual (không im lặng).
  - Option **khác lớp hành vi** (mỗi lựa chọn ra kết quả/nhánh/field/quyền khác) → verify expected riêng cho từng option, không gộp chung 1 assertion.
- Luôn kèm: default selection, **empty/no-match**, reset filter, và **giao điều kiện** khi filter kết hợp.
- Ghi rõ trong Actual **đã cover bao nhiêu / loại option nào** (vét hết N, hay rút gọn + lý do), để không đọc nhầm "1 giá trị = đã phủ".

# Evidence BẮT BUỘC cho MỌI case đã execute (PASS và FAIL) + MỌI step
Đây là yêu cầu chung, áp cho mọi case đã chạy (không chỉ case FAIL). Tuân thủ đầy đủ mục **Evidence — Quy chuẩn bắt buộc** trong `RULE_GLOBAL.md`. Vi phạm bất kỳ điểm nào = evidence KHÔNG hợp lệ, KHÔNG push:
- **Mọi case có kết quả PASS hoặc FAIL đều phải có evidence cụ thể** (ảnh/video). Case `TODO`/chưa chạy thì KHÔNG cần.
- **CHỈ ảnh (`.png/.jpg/.jpeg/.webp`) hoặc video (`.mp4/.webm`) mới là evidence hợp lệ** — cho CẢ case PASS lẫn step. TUYỆT ĐỐI KHÔNG dùng `.json`, `.md`, `.txt`, `.log`, `.html`, `.csv`, `trace.zip` làm evidence của case/step (kể cả `order_state.json`, `api_response.json`, dump state). Cần chứng minh dữ liệu API/DB/state → **chụp ảnh màn UI hiển thị giá trị đó**, KHÔNG đính file dữ liệu thô.
- **Mọi step đều phải: (a) đánh dấu trạng thái PASS/FAIL riêng, (b) có 1 ảnh evidence của chính step đó**, và ảnh phải **highlight vào đúng element/vùng đang kiểm** (khoanh viền/tô đậm element được assert), không chỉ chụp cả trang chung chung.
- **PII khách hàng phải mask.** Màn có Email/SĐT/họ tên/địa chỉ/mã định danh khách (kể cả trong `<input>`) → dùng `mask` của helper che trước khi chụp; vẫn giữ highlight ở element cần kiểm. Artifact KHÔNG được để lộ PII khách (đồng bộ rule bảo mật).
- **Video cho case phức tạp.** Case nhiều bước / tương tác động — thanh toán qua cổng ngoài, trạng thái async, luồng qua nhiều màn, iframe/popup, drag & drop / upload — PHẢI quay video (đặt `PW_VIDEO=on`/`retain-on-failure` hoặc `context({recordVideo})`) đính kèm cùng ảnh step, không chỉ chờ đến khi FAIL. Case đơn giản (1 màn) thì ảnh highlight là đủ.
- **Verify đúng màn trước khi chấp nhận.** Sau khi chụp, PHẢI kiểm ảnh đúng màn/kết quả của case: KHÔNG phải trang lỗi (404/500/blank/timeout/"can't find that page"), KHÔNG phải màn sai bước, KHÔNG phải loading dở, KHÔNG phải cổng/màn của bước khác. Sai màn → sửa selector/điều hướng và chụp lại; không push evidence sai. (Với data động: xác nhận order/link còn sống trước khi drive — link chết trả 404.)
- **Mỗi case dùng evidence của chính nó** — không mượn ảnh case khác, không placeholder. Không re-drive được (order đã tiêu, link chết) thì dùng đúng ảnh gốc thật của chính case đó và ghi rõ lý do.
- Dùng helper chuẩn **`scripts/utils/evidence_recorder.js`** để tự động: highlight element → screenshot vào `test-results/artifacts/<TC_ID>/step-NN-<status>.png` → ghi `steps[]` (status + evidence từng bước) + evidence cấp case vào `test-results/testcase-status.json`. (API: `new EvidenceRecorder({taskKey, projectOutputDir, runId})` → `rec.case(tcId)` → `await c.step(page, tên, {highlight, assert|status, mask})` → `await c.finish()` → `rec.write()`.)
- Khi push execution, chạy kèm `--with-evidence` để đính ảnh cấp case; per-step evidence luôn được đính từ `steps[]`. Push có gate `checkEvidenceCoverage`: nếu case execute thiếu step-evidence sẽ **WARN** (hoặc **lỗi** khi bật `--require-step-evidence`/`XRAY_REQUIRE_STEP_EVIDENCE=1`).

# Phân loại failure và yêu cầu evidence
Trước hết loại trừ `setup_failure` (failure ở bước setup/verify precondition trong Precondition Resolution Pass — sửa setup rồi rerun, KHÔNG log Jira bug). Chỉ khi precondition đã verify đạt mà behavior vẫn sai mới phân loại product failure theo 3 nhóm evidence:

## `simple_api`
Pure API/status/data validation, không cần quan sát UI thật.

Ví dụ:
- Status code mismatch.
- Required field validation.
- Duplicate validation.
- API accept dữ liệu sai rule.
- GET/PUT/DELETE non-existing id trả sai code.

Evidence bắt buộc:
- Request/response log đã redact token/password/cookie.
- Actual result ghi rõ method, endpoint, expected status, actual status, main error.
- Nếu chạy qua Playwright browser context, render một visual evidence page trước khi fail để screenshot/video không bị trắng.

Jira upload:
- Upload screenshot visual evidence nếu có.
- Video optional nếu giúp đọc actual/expected nhanh hơn.
- Không upload request/response log, `trace.zip`, markdown, text/log, JSON hoặc `error-context.md` lên Jira.

## `simple_ui`
UI fail đơn giản, một màn hình hoặc một state tĩnh.

Ví dụ:
- Missing label/button/text.
- Inline validation message sai.
- Static layout/state không đúng.
- API-backed UI validation đã được render thành visual evidence page.

Evidence bắt buộc:
- Screenshot fail.
- Error-context/log.
- Actual result ghi rõ step fail, expected, actual.

Jira upload:
- Upload screenshot.
- Upload video nếu thao tác trước fail cần nhìn sequence ngắn.
- Không upload `trace.zip`, markdown, text/log, JSON hoặc `error-context.md` lên Jira.

## `complex_ui_e2e`
Flow UI/E2E phức tạp hoặc khó tái hiện chỉ bằng ảnh.

Luôn phân loại `complex_ui_e2e` nếu case có:
- Nhiều bước nhiều màn hình/site.
- Cross-app cross-site.
- Create/edit/delete qua UI với nhiều transition.
- Upload/import/progress.
- Async/background sync, polling, websocket, realtime update.
- Permission/session/role switching.
- Animation/transition/loading/skeleton/spinner.
- Toast/modal/drawer auto close/open-close.
- Hover/flyout/dropdown async/drag-drop.
- Virtualized table, pagination/filter debounce.
- Flaky/timing-sensitive behavior.

Evidence bắt buộc:
- Screenshot fail.
- Video showing before/during/after failure.
- Error-context/log.

Trace policy:
- `trace.zip` là diagnostic artifact, không phải default Jira evidence.
- Không upload `trace.zip` lên Jira. Trace chỉ được giữ local để debug và ghi rõ `trace retained locally only` trong report nếu có sinh trace.
- Với bug phức tạp liên quan route/state nhiều page, network race, async job, console/runtime error cần timeline hoặc flaky timing, ưu tiên capture video; trace chỉ là diagnostic local.

# Quy tắc evidence Jira
- Với `complex_ui_e2e`, set `PW_VIDEO=retain-on-failure` trước khi chạy hoặc rerun case fail với video enabled.
- Set `PW_TRACE=retain-on-failure` chỉ khi case thuộc nhóm cần trace theo policy ở trên.
- Nếu screenshot/video trắng do fail trước khi render UI, phải render visual evidence page có TC ID, expected, actual, sanitized response/context rồi rerun để sinh evidence mới.
- Jira evidence attachment chỉ được là ảnh/video: `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.mp4`, `.webm`.
- Không upload `.md`, `.txt`, `.log`, `.json`, `.zip`, `trace.zip`, `error-context.md` hoặc execution summary lên Jira.
- Không lưu hoặc upload password/token/API key/cookie trong evidence/report/Jira.
- Evidence path nên có hoặc map được về TC ID:
  - `test-results/artifacts/[TC_ID]/screenshot-fail.png`
  - `test-results/artifacts/[TC_ID]/video.webm`
  - local-only diagnostic nếu cần: `trace.zip`, `error-context.md`, `console-network-summary.md`

# Quy tắc kỹ thuật Playwright
- Không đoán locator; inspect DOM thực tế.
- Locator priority: `getByRole` > `getByLabel` > `getByText` > `getByTestId` > CSS.
- Site URLs và credentials lấy từ env variables (`App 1_*`, `APP2_*`).
- Không dùng `waitForTimeout()` làm wait chính; chỉ dùng ngắn để ổn định evidence visual page nếu cần.
- Sau mỗi TC, cập nhật testcase output với `Status` và `Actual Result`.
- `Actual Result` của FAIL phải rõ: failed step, expected result, actual UI/API observed, main error, evidence path.
- Khi ghi `testcase-status.json`, **case FAILED phải kèm step nào fail + evidence của bước đó**: điền `steps[]` (bước lỗi `FAILED` + `evidence`; bước chưa chạy `TODO`) hoặc shortcut `failedStep` + `failedStepEvidence` (schema ở `run_phase2_template.md`) — để Test Execution hiện đúng bước lỗi thay vì chỉ FAIL tổng.
- **`comment` phải gọn, dễ đọc** (QA đọc trực tiếp trên Test Run): 1–2 câu kết quả, KHÔNG dán debug (`key=value`, `tx 2→2`, `match=true`, `val="…"`, regex), KHÔNG prefix `[PASS]/[Positive]/[Negative]`, caveat xuống dòng `Lưu ý:`, số/tiền dạng người đọc, KHÔNG placeholder `Xem xxx.json`. Chi tiết: mục **Comment kết quả (Test Execution) — Quy chuẩn trình bày** trong `RULE_GLOBAL.md`.

# Đầu ra
- Playwright spec/page objects nếu cần.
- Task-scoped automation mặc định: `<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/automation/`.
- Core spec chỉ khi được approve/merge vào regression: `tests/fe/[TASK_KEY].spec.ts` hoặc file tương đương có namespace theo `[TASK_KEY]`.
- `<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/test-results/results.json`
- `<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/test-results/playwright-report/`
- `<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/test-results/artifacts/`
- Nếu có `RUN_ID`, dùng:
  - `<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/test-results/runs/[RUN_ID]/results.json`
  - `<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/test-results/runs/[RUN_ID]/playwright-report/`
  - `<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/test-results/runs/[RUN_ID]/artifacts/`
- Testcase output đã cập nhật `Status`, `Actual Result`, `Evidence`.
- Nếu có `RUN_ID`, `Status`, `Actual Result`, `Evidence` nằm trong run-scoped report/status và không ghi đè testcase Markdown chính.
