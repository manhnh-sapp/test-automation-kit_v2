# Global Rules

> Quy tắc bắt buộc để giữ Test Automation Kit an toàn, nhất quán và dễ audit.

## Purpose

Tài liệu này định nghĩa các rule chung áp dụng cho mọi workflow, prompt, skill, script và report trong kit.

## When To Use

| Scenario | Apply These Rules |
|---|---|
| Sinh testcase | Có |
| Publish testcase Jira | Có |
| Execute automation | Có |
| Log Jira bug | Có |
| Rerun bug đã fix | Có |
| Viết report/output | Có |
| Dọn file tạm | Có |

## Inputs

| Input | Source |
|---|---|
| Task profile (giá trị ĐỘNG per-task) | `profiles/<TASK_KEY>/task.env` (`TASK_ENV=...`). Sinh từ template `profiles/task.env.example`. |
| Project output root | `PROJECT_OUTPUT_DIR` (trong task.env) |
| Task scope | `TASK_KEY` (trong task.env) |
| Parallel run scope | `RUN_ID` nếu chạy nhiều session cùng `TASK_KEY` |
| Runtime secrets (TĨNH, dùng chung) | `.env.local`, `.env`, CI env hoặc secret store (base URL + API key Figma/Confluence/Jira/Xray/HubSpot) |
| Workflow-specific context | Prompt template hoặc `.agent/config/project_context.md` |

**Tạo profile task (một lần, chỉ 1 lệnh):** khi user yêu cầu "Tạo profile cho `<TASK_KEY>`" → chạy `node scripts/utils/create_profile.js <TASK_KEY> [--project-output outputs/<PROJECT>]` (hoặc `npm run profile:create -- <TASK_KEY>`). Lệnh copy `profiles/task.env.example` → `profiles/<TASK_KEY>/task.env`, prefill `TASK_KEY`+`JIRA_STORY_KEY`, KHÔNG ghi đè nếu đã tồn tại; QA điền credential + link. Profile CHỈ chứa giá trị động: `PROJECT_OUTPUT_DIR, TASK_KEY, JIRA_STORY_KEY, JIRA_STORY_URL, CONFLUENCE_REQUIREMENT_URL, CONFLUENCE_BRD_URL, FIGMA_FILE_URL, GOOGLE_DOCUMENT_ID, GOOGLE_SHEET_URL, LMS_USERNAME/PASSWORD/API_TOKEN, OPS_USERNAME/PASSWORD/API_TOKEN` (+ assignee/HubSpot per-task nếu cần). File task.env KHÔNG commit (gitignore `profiles/**/task.env`).

## Outputs

| Output | Rule |
|---|---|
| Markdown/report | Tiếng Việt chuẩn có dấu, UTF-8, không lộ secret. |
| Test results | Nằm dưới `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/test-results/`. |
| Evidence | Chỉ **ảnh/video** làm evidence (xem §"Evidence — Quy chuẩn bắt buộc"); `trace/log` là diagnostic local, KHÔNG phải evidence. Lưu đúng scope task. |
| Jira testcase publish | Step riêng trong phạm vi Phase 1; chỉ publish từ Excel canonical sau khi QA xác nhận. Excel là source of truth khi gen/publish; **Phase 2 execute mặc định lấy nguồn từ Xray** (`TESTCASE_SOURCE=xray`, kéo về canonical local `from-xray/*.xlsx`), `excel` là opt-out. |
| Jira bug | Chỉ tạo khi fail đã được xác nhận là product/API bug. |
| Testcase (md/Excel) | Cột "Kết quả mong đợi" đánh số **KHỚP từng bước** (bước 1→KQ 1, 2→2…), xuống dòng `<br>`; **CẤM gộp range** kiểu `1-2.`/`2-3.`; không ghi chung chung ("thành công"/"đúng"). Áp cả khi gen VÀ khi chỉnh sửa TC thủ công. Chi tiết: prompt gen Phase 1 §6. |

## Rules

### Language

- Giao tiếp, phân tích, report và delivery note mặc định dùng tiếng Việt chuẩn có dấu.
- Tên biến, hàm, class và file nên dùng tiếng Anh.
- Technical terms, endpoint, method, enum/status và code identifier có thể giữ nguyên tiếng Anh.
- Comment trong code chỉ thêm khi giúp hiểu logic không hiển nhiên.

### Security

- Không in API key, password, token, cookie, private key hoặc connection string ra chat, logs, Markdown, testcase output hoặc reports.
- Không commit `.env`, `.env.local`, service-account JSON hoặc file chứa credential thật.
- Nếu secret từng bị chia sẻ hoặc commit, phải rotate trong provider console.
- Không dùng direct DB connection trong workflow chuẩn của kit. Ngoại lệ DUY NHẤT: read-only verify/chẩn đoán trên **UAT DB** qua guarded client `tests/support/setup/db/uatPgClient.ts` (read-only: chỉ SELECT trong transaction READ ONLY). Chỉ cấu hình credential kho UAT (`LIB_MASTER_DB_*`) — kho UAT/PROD tách biệt, không cấu hình creds thì không truy cập được. Vẫn cấm biến generic `TEST_DB_*`/`TEST_DATABASE_URL`/`DATABASE_URL`/`PG*` và mọi import `pg` ngoài client đó. DB là oracle PHỤ (verify/chẩn đoán): KHÔNG dựng/mutate state, KHÔNG phải evidence Jira, KHÔNG thay oracle từ spec; PII đọc ra phải mask + cấm export file.
- Không yêu cầu AI đọc toàn bộ source backend để execute testcase. Phase 2 chỉ dùng UI/API public-business contract, artifact Phase 1, credential test, fixture có sẵn, test hook/sandbox nếu team cung cấp.

### Project And Output

- Project name, URL, domain, Jira key và module name phải lấy từ config/env/prompt.
- Không hardcode theo project cụ thể trong workflow hoặc script dùng chung.
- `PROJECT_OUTPUT_DIR` là output root bắt buộc, ví dụ `outputs/<YOUR_PROJECT>`.
- `TASK_KEY` là scope của task/feature và luôn nằm dưới `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/`.
- Playwright report, evidence và results nằm dưới `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/test-results/**`.
- Nếu chạy nhiều session cùng một `TASK_KEY`, bắt buộc truyền `RUN_ID` qua env/CLI để output execute nằm dưới `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/test-results/runs/<RUN_ID>/`.
- Khi có `RUN_ID`, execution/rerun/Jira local report nên nằm dưới `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/reports/runs/<RUN_ID>/`.
- Khi có `RUN_ID`, không cập nhật trực tiếp testcase Markdown/Excel chính trong `test-cases/` trong lúc execute; ghi `Status`, `Actual Result` và `Evidence` vào run-scoped report/status trước. Chỉ merge ngược vào testcase chính khi user chọn run đó làm kết quả canonical.
- `RUN_ID` chỉ được chứa chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.

### Parallel Story Safety

- Mỗi story nên chạy trong một conversation AI riêng để giữ context sạch.
- Câu lệnh đầu tiên của mỗi conversation phải nêu rõ `TASK_KEY`.
- Trước mọi thao tác ghi file hoặc chạy command, agent phải echo scope:
  - `PROJECT_OUTPUT_DIR`
  - `TASK_KEY`
  - `TASK_OUTPUT_DIR`
  - `RUN_ID` nếu có
  - Workflow/phase đang chạy
- Nếu scope echo không khớp yêu cầu user, phải dừng trước khi ghi file/chạy lệnh.
- Không sửa `.env` hoặc `.env.local` chung khi có session khác đang chạy.
- Với command execute/report/Jira, ưu tiên truyền `PROJECT_OUTPUT_DIR`, `TASK_KEY` và `RUN_ID` qua env hoặc CLI args từng lệnh.
- Không chạy song song cùng một `TASK_KEY` nếu không có `RUN_ID`.
- Không chạy song song các workflow có ghi đè requirement/testcase chính của cùng một `TASK_KEY`, trừ khi user xác nhận chiến lược merge riêng.
- Không sửa shared config/helper như `playwright.config.js`, `package.json`, runtime helper hoặc common prompt khi story khác đang execute, trừ khi user xác nhận đây là thay đổi chung.

### Phase-Separated Story Execution

- Mỗi story không bắt buộc chạy liền một mạch. Luồng chuẩn là:
  `Requirement -> Generate Testcase -> Excel (source of truth) -> QA confirmation -> Auto Publish Jira -> chờ Dev implement -> Phase 2 -> chờ Dev fix bug nếu có -> Re-run`.
- Sau bước generate testcase, Excel trong `<TASK_OUTPUT_DIR>/test-cases/` là source of truth khi **gen/publish**. Nội dung testcase phải sửa ở Excel rồi re-publish — không sửa trực tiếp trên Xray làm nguồn authoring.
- **Phase 2 execute mặc định lấy nguồn từ Xray** (`TESTCASE_SOURCE=xray`): kéo về canonical local `<TASK_OUTPUT_DIR>/test-cases/from-xray/*.xlsx` rồi execute từ đó (Xray publish TỪ Excel nên nhất quán). `TESTCASE_SOURCE=excel` (opt-out) đọc `<TASK_OUTPUT_DIR>/test-cases/*.xlsx`. Dù nguồn nào, execute đọc file canonical LOCAL — không gọi Jira/Xray cho từng case.
- Auto Publish Jira là step riêng trong phạm vi Phase 1, chạy bằng prompt riêng sau khi QA xác nhận Excel/testcase. Không publish Jira thật khi chưa có QA confirmation rõ ràng.
- Test management tool là Xray: testcase publish mặc định tạo Xray `Test` issue (`JIRA_TESTCASE_ISSUE_TYPE=Test`), không dùng generic `Test Case` nếu project đã cấu hình Xray.
- Publish testcase lên Jira phải đọc từ Excel canonical. Chạy dry-run trước nếu cần preview; publish thật chỉ khi QA/user approve. Ghi kết quả vào `<TASK_OUTPUT_DIR>/reports/jira-testcase-publish-summary.md`.
- Phase 1 có thể tự động hóa gần như toàn bộ phần thiết kế testcase khi input đủ. Phase 2 chỉ execute phần có thể chạy an toàn qua UI/API public hoặc setup capability đã có; case không dựng được state qua API/factory/hook/fixture/sandbox an toàn thì ghi `Manual-only`, `SKIP_SETUP` hoặc `BLOCKED_SETUP` kèm capability còn thiếu — KHÔNG dùng DB để DỰNG state thay thế (DB chỉ được read-only verify trên UAT, xem ngoại lệ ở trên).
- Mỗi case chưa tự động hoá được phải gắn 1 Blocker Root Cause (`needs_hook`/`needs_account`/`needs_sandbox`/`spec_mismatch`/`manual_inherent`/`external_dependency`), không gộp chung thành "backend state" (xem skill `precondition_setup_planner`). Capability gap (`needs_hook`/`needs_account`/`needs_sandbox`) phải đưa vào `reports/capability-request.md` và được review như Definition of Ready trước khi kickoff Phase 2. Pass rate phải kèm unassisted pass rate (loại các case cần người can thiệp giữa chừng) để không che giấu chi phí human-in-the-loop.
- Khi bắt đầu mỗi phase mới, agent phải đọc lại artifact canonical của task hiện tại:
  - `task.md`
  - `reports/phase1-summary.md` nếu chạy Phase 2
  - `reports/execution-summary.md` hoặc Jira bug log nếu chạy Re-run
- Không dùng context hội thoại cũ làm source chính nếu artifact local đã có; artifact dưới `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/` là nguồn chuẩn.
- Không reuse `TASK_KEY`, `RUN_ID`, testcase scope hoặc Jira bug scope từ phase/story khác nếu user chưa nhắc lại rõ.
- Nếu user không nêu `TASK_KEY` trong yêu cầu hiện tại, agent không được dùng `TASK_KEY` từ `.env`, `.env.local` hoặc context cũ để quyết định scope; phải hỏi lại hoặc dừng.
- `.env` chỉ là nguồn runtime config sau khi scope đã được user xác nhận, không phải nguồn quyết định story đang chạy.
- Nếu Phase 2 hoặc Re-run bắt đầu sau thời gian chờ Dev, phải echo lại scope trước khi ghi file/chạy command, dù cùng conversation.

### Task-Scoped Automation Code

- Khi nhiều story có thể chạy song song, automation mới sinh cho một story phải ưu tiên nằm trong phạm vi task:
  `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/automation/`
- Nếu bắt buộc ghi vào `tests/fe/` hoặc `tests/api/`, file spec phải có namespace theo `TASK_KEY`, ví dụ `<TASK_KEY>.spec.js`.
- Nếu chạy song song cùng một `TASK_KEY`, spec/output thử nghiệm phải thêm `RUN_ID` hoặc nằm trong run-scoped folder.
- Setup layer (factory/hook/fixture/cleanup/contract) dùng chung ở `tests/support/setup/`. Setup mới của một story tạo trước ở `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/automation/setup/`, reuse tối đa `tests/support/setup/`; chỉ promote phần generic vào shared khi đã ổn định. Setup layer không dựng/mutate state bằng DB; chỉ được read-only verify qua guarded client `tests/support/setup/db/uatPgClient.ts` (UAT, read-only, chỉ SELECT).
- Không sửa shared helper/page object/fixture/config nếu có session khác đang execute, trừ khi user xác nhận đây là thay đổi chung.
- Nếu cần sửa shared helper để fix automation thật, phải ghi rõ trong report: file đã sửa, story bị ảnh hưởng, scope regression cần rerun.
- Không để spec task-specific mặc định thành shared regression suite nếu chưa qua review/merge.

### Shared Change Gate

- Shared files gồm `tests/fe/**`, `tests/api/**`, `tests/support/**`, `playwright.config.js`, `package.json`, runtime helper, fixture/page object/helper dùng chung và prompt/rule chung.
- Trước khi sửa shared file, agent phải xác định đây là thay đổi task-specific hay thay đổi chung.
- Nếu là thay đổi task-specific, ưu tiên chuyển sang `<TASK_OUTPUT_DIR>/automation/` thay vì sửa shared file.
- Nếu là thay đổi chung, phải có xác nhận rõ của user hoặc ghi blocker chờ xác nhận.
- Khi đã sửa shared file, execution summary phải ghi: file đã sửa, lý do, story có thể bị ảnh hưởng, scope regression đã chạy hoặc chưa chạy.

### Automation Promote Review

- Task-scoped automation không tự động trở thành regression suite chung.
- Sau khi Phase 2 PASS ổn định, có thể đề xuất promote automation vào `tests/fe/` hoặc `tests/api/`.
- Setup helper task-scoped ở `<TASK_OUTPUT_DIR>/automation/setup/` chỉ promote vào `tests/support/setup/` khi đã generic (không gắn một task) và có review/approval.
- Promote chỉ thực hiện khi đã có review/approval rõ.
- Khi promote, file core phải namespace theo `TASK_KEY` và không làm mất task-scoped artifact gốc.
- Nếu chưa approve promote, giữ automation trong `<TASK_OUTPUT_DIR>/automation/` và report là task-scoped only.

### Execution Discipline (Kỷ luật thực thi — chạy thông suốt)

Áp dụng khi execute (Phase 2, Re-run, Partial Rerun). Mục tiêu: **tối đa coverage mỗi lượt, tối thiểu gián đoạn**. Vi phạm = execute lắt nhắt, đứt đoạn, phải làm lại.

1. **Batch tối đa mỗi lượt — KHÔNG lắt nhắt.** Trước khi chạy, liệt kê TẤT CẢ case khả thi của đợt rồi gom vào ÍT script toàn diện phủ NHIỀU case; case độc lập chạy song song. CẤM kiểu "mỗi case một script / một vòng rồi dừng-báo". Một lượt phải verify được nhiều case, không phải 1–2 cái.
2. **KHÔNG mặc định `TODO`/`SKIP` khi CHƯA THỬ.** Trước khi đánh 1 case là chưa chạy: (a) rà và DÙNG HẾT fixture/Deal ID/tài khoản/data đã được cấp trong task — không bỏ sót input đã nhận; (b) case negative/lỗi → **tự tạo input để tái hiện** (vd ID không tồn tại, giá trị biên) thay vì chờ fixture; (c) drive thật UI/API rồi mới kết luận. Chỉ để `TODO`/`BLOCKED` khi **chặn thật**: capability chưa có (payment/sandbox chưa reconcile, account phân quyền), fixture đặc thù chưa được cấp, hoặc cần BA/dev làm rõ scope / fix bug. Khi để lại phải ghi **lý do cụ thể + điều kiện để chạy được** (không ghi chung chung).
3. **KHÔNG hỏi lắt nhắt.** Việc read-only / verify / tạo fixture trong quyền hạn đã thiết lập → thực thi ngay, không xin xác nhận từng bước ("chạy luôn không?"). Nếu buộc phải hỏi (thiếu input hoặc cần quyết định nghiệp vụ) → **GOM toàn bộ câu hỏi + input cần thiết vào MỘT lần**, không hỏi rải rác.
4. **Báo cáo gộp, ít vòng.** Chỉ dừng để báo khi đã xong MỘT CỤM lớn hoặc gặp chặn thật; không tường thuật từng thao tác nhỏ. Mỗi lần báo = nhiều kết quả.
5. Ranh giới không đổi: vẫn tuân thủ **Jira Bug Gate**, **Evidence**, **PII/Security**, **Parallel Story Safety**, **Shared Change Gate** — siết coverage/tốc độ KHÔNG được nới các gate này.

### Execute Results

Sau mỗi testcase đã execute, cập nhật testcase/report với:

| Field | Requirement |
|---|---|
| `Status` | `PASS`, `FAIL` hoặc `SKIP`. |
| `Actual Result` | Kết quả quan sát được, không ghi chung chung. |
| `Evidence` | **Bắt buộc cho MỌI case đã execute (PASS và FAIL)** + **MỌI step** (mỗi step có status PASS/FAIL riêng và ảnh riêng). Case `TODO`/chưa chạy không cần. Capture bằng `scripts/utils/evidence_recorder.js`; ảnh/video dưới `test-results/artifacts/<TC_ID>/`. Phải tuân thủ đầy đủ mục **Evidence — Quy chuẩn bắt buộc** bên dưới. |

Với testcase `FAIL`, `Actual Result` phải có:

| Required Detail | Why It Matters |
|---|---|
| Step fail | Xác định điểm lỗi. |
| Expected result | Xác nhận rule đang kiểm. |
| Actual UI/API result | Chứng minh behavior thực tế. |
| Main error message | Hỗ trợ dev debug. |
| Evidence path | Đảm bảo audit và Jira triage. |

### Evidence — Quy chuẩn bắt buộc

Áp dụng cho MỌI case đã execute (PASS và FAIL) và MỌI step. Vi phạm bất kỳ điểm nào bên dưới = evidence KHÔNG hợp lệ, KHÔNG được đưa vào report/push Xray/Jira.

1. **Chỉ ảnh hoặc video — cấm file dữ liệu thô.** Evidence hợp lệ chỉ là ảnh (`.png/.jpg/.jpeg/.webp`) hoặc video (`.mp4/.webm`). TUYỆT ĐỐI KHÔNG dùng `.json`, `.md`, `.txt`, `.log`, `.html`, `.csv`, `trace.zip` hay file dữ liệu thô nào làm evidence của case/step — kể cả `order_state.json`, `api_response.json`, execution summary. Cần chứng minh dữ liệu API/DB/state thì **chụp ảnh màn UI** hiển thị dữ liệu đó (hoặc màn có giá trị tương ứng), không đính file dữ liệu.
2. **Highlight đúng element đang kiểm.** Mỗi ảnh phải khoanh (tham số `highlight` của `evidence_recorder`) đúng phần tử của step đó: nút / field / dòng bảng / nhãn / thông báo / giá trị. Cấm ảnh full-page chung chung không chỉ rõ điểm kiểm.
3. **Mask PII khách hàng.** Che (mask) mọi dữ liệu nhạy cảm của khách trong ảnh/video: email, số điện thoại, họ tên, địa chỉ, mã định danh cá nhân — kể cả khi nằm trong `<input>`. Dùng tham số `mask` của `evidence_recorder`. Đồng bộ rule bảo mật: artifact KHÔNG được để lộ email/SĐT/PII khách. (Dữ liệu của hệ thống/công ty như STK công ty, hotline không bắt buộc che.)
4. **Video cho case phức tạp.** Case nhiều bước hoặc tương tác động — thanh toán qua cổng ngoài, trạng thái cập nhật bất đồng bộ, luồng qua nhiều màn, iframe/popup, drag & drop / upload — PHẢI quay video (giống evidence khi log bug) đính kèm cùng ảnh step, để tái hiện được hành vi. Case đơn giản (1 màn, kiểm hiển thị) thì ảnh highlight là đủ.
5. **Verify đúng màn trước khi chấp nhận.** Sau khi chụp, PHẢI mở ảnh/kiểm nội dung để chắc chắn evidence đúng màn/kết quả của case: KHÔNG phải trang lỗi (404/500/blank/timeout/"can't find that page"), KHÔNG phải màn sai bước, KHÔNG phải trạng thái loading dở, KHÔNG phải cổng/màn của bước khác. Sai màn → sửa selector/điều hướng và chụp lại; không push evidence sai.
6. **Mỗi case dùng evidence của chính nó.** Không mượn/tham chiếu ảnh của case khác, không dùng placeholder. Nếu không re-drive được (order đã tiêu, link chết…) thì dùng đúng ảnh gốc thật của chính case đó và ghi rõ lý do không re-capture — không thay bằng ảnh không đúng nội dung.
7. **Lưu đúng nơi + gắn đủ.** Ảnh/video dưới `test-results/artifacts/<TC_ID>/`; đường dẫn ghi vào `Evidence` của case và của TỪNG step (mỗi step: status PASS/FAIL riêng + ảnh riêng).

### Comment kết quả (Test Execution) — Quy chuẩn trình bày

Field `comment` của mỗi case (trong `testcase-status.json`, đẩy lên Test Run của Xray) là chỗ QA đọc để hiểu kết quả — phải gọn, dễ nhìn, KHÔNG dán debug.

1. **Văn xuôi gọn, không debug.** Comment là 1–2 câu mô tả kết quả quan sát được. CẤM dán dấu vết kỹ thuật: `key=value` (`editable=false`, `disabled=true`, `atGateway=true`, `match=true`), dump state kiểu `A→A` / `tx 2→2` / `paid 6000000→6000000`, mảng regex/selector, `val="…"`, `matched=[…]`. Viết lại thành ý người đọc hiểu.
2. **Không lặp trạng thái ở đầu comment.** KHÔNG mở đầu bằng `[PASS]`/`[FAIL]`/`[PASSED]`/`[Positive]`/`[Negative]` — status đã có badge riêng trên Test Run. (Kit tự thêm tag cho SKIP/BLOCKED/EXECUTING để phân biệt "TO DO" — đừng tự viết tag đó.)
3. **Caveat tách dòng riêng.** Điều cần QA xác nhận thêm / giới hạn / phụ thuộc Dev → xuống dòng mới, mở đầu bằng `Lưu ý:` (đừng nhồi vào cùng câu kết quả).
4. **Nhiều ý → gạch đầu dòng.** Nếu case kiểm nhiều điểm, mỗi điểm một dòng `- …` thay vì câu chạy dài một mạch.
5. **Số/tiền ở dạng người đọc.** Viết `6.000.000đ`, `23tr`, ngày `2026-07-13` — không để số thô `6000000`, không để timestamp máy.
6. **Không placeholder / con trỏ file.** CẤM comment kiểu `Xem xxx_results.json`, `TODO`, `(auto)` — phải là nội dung thật của kết quả. Không nhét ID thô (order/deal) trừ khi cần cho truy vết, và nếu cần thì rút gọn.
7. **Case FAILED:** comment nêu rõ **kỳ vọng vs thực tế** ở bước lỗi (ngắn gọn), chi tiết bước/evidence để ở `steps[]`/`failedStep` (không nhồi hết vào comment).

### Jira Bug Gate

Jira bug gate khác với Jira testcase publish. Jira testcase publish diễn ra sau Excel/Phase 1 để mirror testcase lên Jira; Jira bug chỉ diễn ra sau Phase 2 khi fail đã được xác nhận là product/API bug.

- Không log Jira nếu case đang `SKIP`.
- Không log Jira nếu fail do prompt/test/setup/data/env/dependency.
- Không log Jira nếu chưa rerun đủ để loại trừ flaky issue.
- Jira evidence chỉ dùng ảnh hoặc video khi log/upload bug.
- Không upload `.md`, `.txt`, `.log`, `.json`, `trace.zip` hoặc execution summary làm Jira evidence trừ khi user yêu cầu riêng.

### Executable QA capabilities (autonomy & safety)

Các năng lực chạy thật trong `scripts/qa/` + `exploratory/` phải khai rõ mức tự chủ và tuân ràng buộc an toàn:

- **Autonomy Gate**: Suggest-only (learning_recorder, risk_score, git_impact, scope_planner) · threshold-gated (locator healing `LOCATOR_HEAL=1`, perf advisory, risk_gate `--enforce`) · never-auto (exploratory, security_check, load_check — chỉ chạy khi user yêu cầu tường minh).
- **Non-destructive & non-prod**: `security_check` chỉ GET/read-only + `--confirm-nonprod`; `load_check` non-prod + cap + `--confirm-nonprod`; fuzzing/exploit/brute-force/ZAP là Manual-only opt-in có phê duyệt người. TUYỆT ĐỐI không chạy trên production.
- **Mask PII/secret** trong mọi report (security/knowledge/dashboard); không ghi credential/PII khách hàng.
- **Learning data chỉ ghi fact đã qua gate** (bug đã qua Jira gate); band/risk máy chấm luôn cho phép QA override.
- **Output Quality Gate (THỰC THI, không phải prose)**: `scripts/qa/output_gate.js` + `scripts/qa/lib/output_rules.js` biến rule chất lượng thành check máy — `push_test_execution.js` tự chạy trước khi push (comment gọn/không debug, mọi step có status + evidence ảnh/video, video cho case phức tạp). Vi phạm → CHẶN; agent tự sửa trong session, không chờ nhắc. `--qa-approved` bỏ qua có chủ đích (log lại). Bug/Test Execution **bắt buộc qua script kit**, không tạo tay MCP/API.
- **Không thêm dependency nặng**: axe-core (npm) đủ cho a11y; k6 là binary ngoài (Docker/PATH, không vào deps), thiếu → skip sạch.

## Workflow

```text
Read config/env
↓
Run selected workflow
↓
Write outputs under PROJECT_OUTPUT_DIR/TASK_KEY
↓
Validate status/evidence/report
↓
Clean temporary files
```

## Cleanup Rules

Trước khi kết thúc task, scan workspace root và subfolder cấp 1 để dọn file tạm/debug rõ ràng. Không xóa deliverable hoặc dữ liệu người dùng chưa được phép xóa.

| Pattern | Meaning |
|---|---|
| `*_debug.txt` | Debug dump tạm. |
| `debug_output.txt`, `*_output.txt` | Output dump tạm. |
| `*.tmp`, `*.temp` | File tạm. |
| `page_snapshot.md`, `snapshot_*.md` | Browser snapshot tạm. |
| `dom_dump.txt`, `html_dump.html` | DOM dump tạm. |
| `network_requests.txt`, `console_log.txt` | Network/console log tạm. |
| `scratch_*.py`, `scratch_*.js`, `scratch_*.ts` | Script nháp. |

Không xóa:

| Path/Pattern | Reason |
|---|---|
| `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/test-results/**` | Deliverable của task hiện tại. |
| `logs/`, `artifacts/` | Có thể là output được yêu cầu. |
| `node_modules/`, `.git/`, `target/`, `build/` | Dependency/build/system folders. |
| `*.config.ts`, `*.config.js`, `package.json`, `.gitignore` | Project config. |
| File user yêu cầu giữ lại | User-owned data. |

## Examples

| Good | Bad |
|---|---|
| `PROJECT_OUTPUT_DIR=outputs/<YOUR_PROJECT>` | Hardcode `outputs/lms-operations-automation` trong template chung. |
| Evidence path dưới `test-results/artifacts/` | Screenshot tạm ở workspace root. |
| Bug Jira có steps, expected, actual, evidence | Bug Jira từ case skip hoặc lỗi setup. |

## References

| Document | Purpose |
|---|---|
| [README.md](README.md) | Architecture và overview. |
| [QUICKSTART.md](QUICKSTART.md) | Setup và chạy lần đầu. |
| `.agent/rules/` | Rule chi tiết theo domain. |
| `prompt_templates/run_phase_re-run_template.md` | Prompt canonical cho Re-run bug/case fail và cập nhật evidence/status. |
