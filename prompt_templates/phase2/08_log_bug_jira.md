# Prompt Phase 2 - Ghi bug Jira

> Chạy: `Đọc file này và chạy với TASK_KEY=<TASK_KEY>`. Tuân thủ `RULE_GLOBAL.md` và `.agent/rules/`.

Dùng prompt này như một bước con của Phase 2, chỉ chạy sau khi đã execute testcase, auto-heal và sinh local execution summary PASS/FAIL/SKIP. Không chạy prompt này như một phase độc lập.

Prompt này chỉ để log Jira bug sau execute. Nếu cần Auto Publish Jira testcase trong Phase 1, dùng `prompt_templates/phase1/04_auto_publish_jira.md`.

```text
Chạy bước log bug Jira trong Phase 2.

Điều kiện bắt buộc trước khi chạy:
- Đã execute testcase.
- Đã auto-heal lỗi automation nếu có.
- Đã cập nhật testcase output với `Status` và `Actual Result`.
- Đã có execution summary phân loại `PASS` / `FAIL` / `SKIP`.
- Testcase FAIL đã được rerun ít nhất 2-3 lần hoặc report ghi rõ số lần rerun đủ để loại trừ flaky/setup.
- Execution summary đã loại trừ các nguyên nhân không thuộc product bug: prompt chưa rõ, test data sai/thiếu, setup/environment lỗi, mock/stub sai, dependency chưa sẵn sàng, timeout, locator/test harness/cleanup/auth lỗi.
- Expected result đã được xác nhận đúng bằng requirement/API/design hoặc review hợp lệ.
- Actual result có evidence rõ ràng đã sanitize. Evidence dùng để phân tích local có thể gồm response log, trace, error-context hoặc error message; evidence upload lên Jira chỉ được là ảnh/video.
- Video evidence không bắt buộc cho mọi bug. Tuy nhiên với case phức tạp mà một ảnh fail không mô tả đủ chuỗi thao tác/trạng thái trước-sau lỗi, phải rerun với video và upload video kèm screenshot nếu có thể.
- Không log Jira cho testcase đang SKIP hoặc testcase FAIL do test/prompt/setup chưa chuẩn (gồm `setup_failure` từ Precondition Resolution Pass).

Phạm vi:
- Task key/scope folder: [TASK_KEY]
- Jira Story/Task parent: [JIRA_STORY_KEY]
- Jira project key: [JIRA_PROJECT_KEY_OR_EMPTY]
- Output root: [PROJECT_OUTPUT_DIR]
- Task output dir: `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/`
- Run ID nếu đang chạy song song cùng task: [RUN_ID hoặc N/A]

Parallel story safety:
- Trước khi đọc result hoặc gọi bug reporter, echo `PROJECT_OUTPUT_DIR`, `TASK_KEY`, `TASK_OUTPUT_DIR`, `RUN_ID` nếu có.
- Nếu `TASK_KEY` không khớp task user yêu cầu, dừng ngay.
- Không sửa `.env` hoặc `.env.local` chung khi có session khác đang chạy.

Input artifacts:
- Playwright JSON result:
  `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/test-results/results.json`
- Evidence/artifacts:
  `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/test-results/artifacts/`
- Nếu có `RUN_ID`, dùng:
  `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/test-results/runs/<RUN_ID>/results.json`
  `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/test-results/runs/<RUN_ID>/artifacts/`
- Testcase output:
  `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/test-cases/`
- Execution summary:
  `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/reports/execution-summary.md`
- Nếu có `RUN_ID`, execution/Jira local summary của run nằm dưới:
  `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/reports/runs/<RUN_ID>/`
- Task tracker:
  `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/task.md`

Env/config:
- Đọc biến môi trường từ `.env.local`, `.env`, `scripts/integrations/jira/.env.local`, `scripts/integrations/jira/.env`.
- Không in password, API token, PAT, cookie hoặc private key ra console, markdown, testcase output, report hoặc log.
- Tạo Jira thật cần:
  - `JIRA_BASE_URL` hoặc `JIRA_URL`
  - `JIRA_EMAIL` hoặc `JIRA_USERNAME`
  - `JIRA_API_TOKEN` hoặc `JIRA_PAT`
  - `JIRA_STORY_KEY` hoặc flag `--story [JIRA_STORY_KEY]`
  - Assignee theo layer bug lấy từ `JIRA_FE_ASSIGNEE`, `JIRA_BE_ASSIGNEE` hoặc `JIRA_DEV_ASSIGNEE`.
  - Nếu không cấu hình assignee riêng, fallback sang assignee của Jira Story/Task parent khi Jira cho phép.
- `JIRA_BUG_ISSUE_TYPE` phải là issue type con `Sub-bug`. Không dùng `Sub-task` cho bug.
- Khi tạo/update Sub-bug, phải tự động copy `Sprint` và `Fix versions` từ Jira Story/Task parent `[JIRA_STORY_KEY]`.
  - `Fix versions` dùng field chuẩn Jira `fixVersions`.
  - `Sprint` tự resolve theo Jira field name `Sprint`; nếu Jira instance dùng field khác thì cấu hình `JIRA_SPRINT_FIELD_ID`.
  - Nếu parent không có `Sprint` hoặc `Fix versions`, bỏ qua field trống và ghi nhận trong summary nếu cần.
- `Priority` của Jira Sub-bug phải lấy từ cột `Ưu tiên`/`Priority` của testcase. Chỉ dùng đúng 5 giá trị Jira: `Highest`, `High`, `Medium`, `Low`, `Lowest`.
- Nếu `JIRA_PROJECT_KEY` bỏ trống, không truyền flag `--project`; reporter sẽ suy ra project key từ `JIRA_STORY_KEY` khi có thể.

Mode:
- [DRY_RUN / CREATE]
- Mặc định chạy DRY_RUN trước để preview.
- Chỉ chạy CREATE khi user yêu cầu tạo bug thật hoặc prompt Phase 2 hiện tại cho phép thay đổi Jira.

Các bước thực hiện:
1. Kiểm tra `results.json` tồn tại.
2. Kiểm tra `reports/execution-summary.md` đã có tổng hợp `PASS` / `FAIL` / `SKIP`.
3. Đọc Playwright result và lọc testcase có trạng thái `failed`, `timedOut`, hoặc `interrupted`.
4. Đối chiếu danh sách fail với execution summary để chỉ log bug cho testcase đã được report là FAIL sau auto-heal.
5. Với từng testcase FAIL, kiểm tra điều kiện log bug:
   - Không phải SKIP.
   - Đã rerun 2-3 lần hoặc có ghi nhận rerun đủ trong summary.
   - Không còn nguyên nhân automation/harness/setup/test data/mock/dependency/timeout/auth/locator/cleanup.
   - Expected result đã xác nhận đúng.
   - Evidence rõ ràng và không trắng.
   - Nếu thiếu bất kỳ điều kiện nào, không log Jira; ghi `Not eligible` vào Jira Bug Report Log kèm lý do.
6. Xác định đúng Jira Story/Task parent từ `[JIRA_STORY_KEY]`.
   - CREATE phải verify parent issue tồn tại và agent có quyền tạo child issue dưới parent đó.
   - Nếu không tìm thấy parent hoặc parent không đúng task đang test, dừng lại và báo lỗi.
7. Nếu không có testcase fail đủ điều kiện, ghi thêm vào execution summary: `Không có testcase fail đủ điều kiện log Jira`.
8. Với mỗi testcase fail đủ điều kiện, tổng hợp:
   - TC ID
   - loại bug: `FE` hoặc `BE`
   - tên bug ngắn gọn
   - tiền điều kiện nếu có
   - các bước reproduce
   - kết quả hiện tại
   - kết quả mong muốn
   - số lần đã rerun
   - các nguyên nhân đã loại trừ
   - mức độ ảnh hưởng
   - ghi chú nếu bug có khả năng flaky hoặc phụ thuộc environment
   - Priority từ cột `Ưu tiên`/`Priority` của testcase
   - evidence path: screenshot/video từ lần execute trước đó
   - xác định screenshot đã đủ mô tả lỗi hay cần video; nếu cần video nhưng chưa có, phải ghi rõ blocker và ưu tiên capture lại trước khi log
   - source testcase path
9. Chạy dry-run:
   `node scripts/integrations/jira/bug_reporter.js --task [TASK_KEY] --story [JIRA_STORY_KEY] --project-output [PROJECT_OUTPUT_DIR] --dry-run`
   - Nếu có `RUN_ID`, thêm `--run-id [RUN_ID]`.
   - Nếu có Jira project key riêng, thêm `--project [JIRA_PROJECT_KEY]`.
   - Nếu muốn ép loại bug, thêm `--layer FE` hoặc `--layer BE`.
10. Nếu được phép tạo Jira thật, chạy:
   `node scripts/integrations/jira/bug_reporter.js --task [TASK_KEY] --story [JIRA_STORY_KEY] --project-output [PROJECT_OUTPUT_DIR]`
   - Nếu có `RUN_ID`, thêm `--run-id [RUN_ID]`.
   - Nếu có Jira project key riêng, thêm `--project [JIRA_PROJECT_KEY]`.
   - Nếu muốn ép loại bug, thêm `--layer FE` hoặc `--layer BE`.
11. Chống duplicate:
   - Kiểm tra bug Jira đang mở theo label `auto-bug` và TC ID.
   - Nếu đã có bug mở cho TC ID đó, không tạo bug mới; ghi trạng thái duplicate/skipped vào report.
12. Upload evidence:
   - Chỉ upload screenshot hoặc video đã được sinh trong lần execute trước đó.
   - Không upload `trace.zip`, file markdown, file text/log hoặc `error-context.md`; các file này chỉ dùng để đọc context local khi viết description.
   - Với bug đơn giản, screenshot fail không trắng thường là đủ.
   - Với bug phức tạp, nhiều bước, nhiều màn hình, state thay đổi theo thời gian, toast/modal auto-close, async update, drag/drop, pagination/filter debounce, create/edit/delete flow dài, hoặc ảnh tĩnh không thể hiện được nguyên nhân, phải có video evidence nếu môi trường cho phép.
   - Nếu bug phức tạp nhưng chưa capture được video do blocker môi trường/setup, ghi rõ trong execution summary/report local rằng bug cần bổ sung video/re-validation; không được giả vờ evidence đã đủ.
   - Không upload file có chứa secret hoặc credential chưa sanitize.
13. Ghi thêm `Jira Bug Report Log` vào execution summary.
14. Cập nhật `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/task.md` với tổng số:
    - Created
    - Duplicate/Skipped
    - Error
    - đường dẫn report chi tiết

Quy tắc Jira issue:
- Bug phải được tạo là child/sub-bug của Jira Story/Task `[JIRA_STORY_KEY]`, work type là `Sub-bug`, không tạo issue độc lập và không dùng `Sub-task`.
- Parent field của Jira issue phải trỏ đúng Story/Task `[JIRA_STORY_KEY]`.
- `Sprint` và `Fix versions` của Sub-bug phải được điền theo đúng giá trị đang có trên Story/Task parent `[JIRA_STORY_KEY]`.
- Không tự chọn Sprint/Fix versions khác parent và không hard-code theo task cụ thể; luôn lấy từ parent issue ở thời điểm log bug.
- `Priority` phải được set theo testcase:
  - Giá trị hợp lệ: `Highest`, `High`, `Medium`, `Low`, `Lowest`.
  - Nếu testcase không có priority hợp lệ, không ép field để Jira dùng default.
- Assignee phải lấy từ cấu hình:
  - FE bug: ưu tiên `JIRA_FE_ASSIGNEE`.
  - BE bug: ưu tiên `JIRA_BE_ASSIGNEE`.
  - `JIRA_DEV_ASSIGNEE` dùng khi muốn ép cùng một assignee cho mọi layer.
  - Nếu không có env assignee, dùng assignee của Jira Story/Task parent nếu có.
- Labels (chỉ giữ tối thiểu cần thiết, không gắn dư):
  - `<TC_ID>` (truy vết testcase)
  - `fe` hoặc `be` (layer)
  - `auto-bug` (đánh dấu QA auto-log + phục vụ chống trùng)
  - KHÔNG gắn `phase2` hay `<TASK_KEY>` vào label: phase ít giá trị, còn task/story đã thể hiện qua parent của Sub-bug nên thừa.

Form bug bắt buộc:

Title:
`[FE hoặc BE] Tên bug (mô tả ngắn gọn lỗi)`

Quy tắc chọn prefix title:
- Prefix `[FE]` / `[BE]` trên title phải theo layer/surface của testcase fail tại thời điểm log bug.
- Case execute bằng UI hoặc bug quan sát trực tiếp trên UI dùng `[FE]`, kể cả khi nghi ngờ root cause có thể nằm ở API/backend.
- Case execute trực tiếp API/backend dùng `[BE]`.
- Không tự đổi title UI bug sang `[BE]` chỉ vì phỏng đoán root cause; nếu cần, ghi nhận nghi ngờ root cause trong report/triage local.

Ví dụ:
- `[FE] Không đăng nhập được App 2 sau khi submit form`
- `[BE] API tạo bản ghi trả sai status khi thiếu required_field`

Description:

Jira description chỉ được có đúng 4 phần bên dưới, theo đúng thứ tự. Tất cả nội dung phải mô tả theo testcase/requirement đang fail:
1. `Tiền điều kiện`
2. `Bước`
3. `Kết quả hiện tại`
4. `Kết quả mong muốn`

Không thêm các phần khác vào Jira description như `Tham chiếu`, `Reference`, `Evidence`, `Xác nhận trước khi log`, `Mức độ ảnh hưởng`, `Execution summary`, `TC ID`, `Source`, `Generated`, `Finding`, đường dẫn report/file, link tài liệu, bảng kết quả test, hoặc metadata automation. Các thông tin đó nếu cần thì ghi ở execution summary/report local, không đưa vào description.

Tiền điều kiện:
- Nếu có tiền điều kiện, ghi rõ dữ liệu/account/trạng thái cần có.
- Nếu không có, ghi `Không có`.

Bước:
- Bắt buộc dùng danh sách đánh số theo định dạng `1.`, `2.`, `3.` cho từng bước reproduce.
- Không dùng bullet `-`, `*`, `•` cho phần `Bước`.
- Mỗi bước phải là một hành động/kiểm tra cụ thể; không gộp nhiều hành động không liên quan vào cùng một bước.
1. Bước 1 rõ ràng, có dữ liệu test nếu cần.
2. Bước 2 rõ ràng.
3. Bước 3 rõ ràng.

Kết quả hiện tại:
- **Trình bày theo từng ý, mỗi ý một gạch đầu dòng `-` (một dòng riêng), KHÔNG viết một đoạn văn dài dồn nhiều ý.** Bug reporter sẽ render mỗi dòng thành 1 bullet trong Jira (mục có ≥2 ý → bullet list; 1 ý → 1 đoạn).
  - Tách các ý độc lập: mỗi hiện tượng/quan sát/số liệu là một dòng riêng (vd một dòng cho triệu chứng chính, một dòng cho số liệu minh hoạ, một dòng cho phạm vi ảnh hưởng).
  - Mỗi dòng là một câu/ý gọn; không nhồi nhiều mệnh đề ngăn bằng dấu `;` hay `,` dài lê thê trong cùng một dòng.
  - Không đánh số `1. 2.` (số dành cho mục `Bước`); dùng gạch đầu dòng.
- Mô tả actual result quan sát được khi execute.
- Bắt buộc viết bằng tiếng Việt chuẩn có dấu, chi tiết đủ để dev/BA hiểu lỗi mà không cần mở Playwright stack trace.
- Ưu tiên diễn giải theo hành vi sản phẩm/người dùng nhìn thấy, không paste raw Playwright locator, stack trace, call log hoặc assertion nội bộ vào Jira.
- Nếu lỗi automation dùng để phát hiện bug, chuyển thành mô tả nghiệp vụ ngắn gọn.
  Ví dụ không ghi: `expect(locator).toBeVisible() failed`, `Call log`, `waiting for getByText(...)`.
  Ví dụ nên ghi: `Sau khi nhập dữ liệu hợp lệ và bấm Save, hệ thống không hiển thị thông báo tạo thành công và vẫn ở màn Create`.
- Nếu là lỗi API/backend, tóm tắt theo ngôn ngữ nghiệp vụ kèm status/error code chính, không dán full response có thể chứa dữ liệu nhạy cảm.
- Không ghi nguyên văn bảng execution summary, bảng kết quả test, hoặc raw JSON response dài vào description.

Kết quả mong muốn:
- **Trình bày theo từng ý, mỗi ý một gạch đầu dòng `-` (một dòng riêng), KHÔNG viết một đoạn văn dài** — cùng quy tắc như `Kết quả hiện tại`. Bug reporter render mỗi dòng thành 1 bullet.
  - Mỗi yêu cầu/kỳ vọng là một dòng riêng; nếu có yêu cầu cho nhiều layer (vd BE cần trả field, FE cần render) thì mỗi layer một dòng.
  - Không đánh số; dùng gạch đầu dòng, câu gọn.
- Mô tả expected result theo testcase/requirement.

Cách truyền dữ liệu cho reporter:
- Khi tổng hợp payload cho `bug_reporter.js`, `actualResult` và `expectedResult` nên là **mảng các ý** (mỗi phần tử một bullet), hoặc chuỗi có các ý ngăn bằng xuống dòng/`<br>`. Reporter tự tách dòng và render bullet list.

Thông tin xác nhận trước khi log:
- Testcase liên quan, số lần rerun, nguyên nhân đã loại trừ, mức độ ảnh hưởng, flaky/environment note phải được ghi trong execution summary/report local.
- Không đưa các thông tin này vào Jira description vì description chỉ có 4 phần bắt buộc ở trên.

Jira comment/Activity:
- Không tự động tạo comment trong Jira Activity khi log bug hoặc update bug.
- Chỉ tạo Jira comment khi user yêu cầu rõ, hoặc khi có tình huống đặc biệt bắt buộc cần lưu vết trong Activity, ví dụ cần thông báo blocker/re-validation cho team dev sau khi issue đã tạo, hoặc báo kết quả **re-verify sau khi Dev fix**.
- Nếu bắt buộc phải comment, phải ghi rõ lý do trong execution summary/report local và comment phải ngắn, không chứa secret, không lặp lại nguyên văn description.
- **Format comment (dễ nhìn, ngắn gọn)**: KHÔNG viết một đoạn dài. Dùng cấu trúc:
  - 1 dòng tiêu đề trạng thái, vd `QA re-verify (build staging <ngày>): ✅ Đã fix` hoặc `⚠️ Chưa fix hẳn`.
  - **Gạch đầu dòng cho từng ý**; nếu vừa có phần đúng vừa có phần lỗi thì tách 2 nhóm ("Đã đúng:" / "Còn lỗi (<màn>):"), mỗi nhóm 1-3 bullet ngắn.
  - Tag người cần xử lý bằng mention `[~accountid:<accountId>]` (vd tag Dev FE/BE khi còn lỗi cần fix).
- **Nhúng ảnh evidence INLINE trong comment** (đặt ngay dưới các dòng text) để dev/reviewer xem không phải mở attachment:
  - Jira Cloud REST **v3 (ADF) KHÔNG** nhúng attachment inline được (media node cần media-UUID mà API attachment không trả → lỗi `ATTACHMENT_VALIDATION_ERROR`/`INVALID_INPUT`).
  - Dùng **REST v2 + wiki-markup**: `POST`/`PUT /rest/api/2/issue/{key}/comment` với body chứa `!<tên file đã attach>|width=900!` — Jira tự resolve tên file thành media node (có UUID) → ảnh render inline. (File phải được attach lên issue TRƯỚC.)
  - Ảnh nhúng nên là ảnh **đã annotate/highlight** (mục Evidence attachment). Kiểm chứng render bằng `GET .../comment/{id}?expand=renderedBody` (có thẻ `<img>` là OK).

Evidence attachment:
- Evidence không phải là một section trong Jira description.
- Không ghi dòng `Evidence`, `Evidance`, `Evidence summary` hoặc link/file evidence trong Jira description.
- Upload screenshot hoặc video từ `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/test-results/artifacts/` hoặc `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/test-results/runs/<RUN_ID>/artifacts/` dưới dạng Jira attachment riêng.
- Jira attachment chỉ được là ảnh hoặc video, ví dụ `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.mp4`, `.webm`.
- Không upload `.md`, `.txt`, `.log`, `.json`, `.zip`, `trace.zip`, `error-context.md`, execution summary hoặc bất kỳ file text/diagnostic nào lên Jira.
- Nếu có nhiều evidence, chỉ upload file ảnh/video liên quan trực tiếp tới testcase fail.
- Video là optional với bug đơn giản, nhưng bắt buộc với flow phức tạp nếu screenshot không đủ mô tả trình tự lỗi.
- **Annotate/highlight evidence (khuyến nghị mạnh)**: trước khi attach, ảnh nên được khoanh vùng + gắn nhãn để dev/reviewer thấy NGAY điểm cần chú ý thay vì tự dò cả màn.
  - Quy ước màu: **đỏ = điểm còn lỗi** (kèm nhãn ngắn nêu sai gì + đúng phải thế nào, vd "✗ SAI: MM/DD/YYYY — cần DD/MM/YYYY"); **xanh lá = điểm đã đúng/đã fix** (vd "✓ Title cột đúng FS").
  - Cách làm (không cần thư viện ngoài): dùng Playwright inject overlay lên đúng element rồi chụp — với mỗi target lấy `getBoundingClientRect()`, thêm 1 `div` viền màu (absolute theo `scrollX/scrollY`) + 1 `div` nhãn nền màu, sau đó `screenshot({ fullPage: true })`; xoá overlay giữa các lần chụp. Mẫu tham khảo: `outputs/**/automation/annotate_*.js`.
  - Chụp full-page/scroll để không cắt vùng cần highlight (bảng rộng).

Output bắt buộc:
- Console summary không chứa secret.
- Execution summary có bảng:
  `TC ID | Jira Issue | Status | URL`
- Nếu CREATE fail, report phải ghi rõ lỗi API đã sanitize.
- Nếu DRY_RUN, report/console phải thể hiện rõ là preview và Jira chưa bị thay đổi.
```
