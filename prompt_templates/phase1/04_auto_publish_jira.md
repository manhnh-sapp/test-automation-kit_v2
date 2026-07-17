# Prompt Phase 1 - Auto Publish Jira Testcase

> Chạy: `Đọc file này và chạy với TASK_KEY=<TASK_KEY>`. Tuân thủ `RULE_GLOBAL.md` và `.agent/rules/`.

Dùng prompt này như một step riêng trong phạm vi Phase 1, chỉ sau khi Phase 1 đã sinh testcase, export Excel và QA đã xác nhận Excel/testcase đủ điều kiện publish. Không dùng prompt này để log bug Jira.

```text
Chạy step Phase 1 - Auto Publish Jira testcase.

Điều kiện bắt buộc trước khi chạy:
- Testcase Markdown đã được sinh/cập nhật.
- Excel testcase đã export thành công và là source of truth.
- `reports/phase1-summary.md` đã có coverage/risk review và Final Decision.
- QA đã xác nhận Excel/testcase được phép publish Jira.
- Nếu QA chưa xác nhận rõ, chỉ được chạy DRY_RUN hoặc dừng chờ xác nhận; không publish thật.

QA confirmation:
- Status: [APPROVED / NOT_APPROVED]
- Người xác nhận: [QA_NAME_OR_ROLE]
- Thời điểm/xác nhận tham chiếu: [CHAT_CONFIRMATION / COMMENT / MEETING_NOTE / N/A]

Phạm vi:
- Task key/scope folder: [TASK_KEY]
- Jira Story/Task parent: [JIRA_STORY_KEY]
- Jira project key: [JIRA_PROJECT_KEY_OR_EMPTY]
- Output root: [PROJECT_OUTPUT_DIR]
- Task output dir: `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/`

Parallel story safety:
- Trước khi đọc Excel hoặc gọi publisher, echo `PROJECT_OUTPUT_DIR`, `TASK_KEY`, `TASK_OUTPUT_DIR`.
- Nếu `TASK_KEY` không khớp task user yêu cầu, dừng ngay.
- Không sửa `.env` hoặc `.env.local` chung khi có session khác đang chạy.

Input artifacts:
- Testcase Excel source of truth:
  `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/test-cases/*.xlsx`
- Testcase Markdown:
  `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/test-cases/*.md`
- Phase 1 summary:
  `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/reports/phase1-summary.md`
- Task tracker:
  `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/task.md`

Env/config:
- Đọc biến môi trường từ `.env.local`, `.env`, `scripts/integrations/jira/.env.local`, `scripts/integrations/jira/.env`.
- Không in password, API token, PAT, cookie hoặc private key ra console, markdown, testcase output, report hoặc log.
- Publish Jira thật cần:
  - `JIRA_BASE_URL` hoặc `JIRA_URL`
  - `JIRA_EMAIL` hoặc `JIRA_USERNAME`
  - `JIRA_API_TOKEN` hoặc `JIRA_PAT`
  - `JIRA_PROJECT_KEY` hoặc flag `--project [JIRA_PROJECT_KEY]`
  - `JIRA_STORY_KEY` hoặc flag `--story [JIRA_STORY_KEY]`
  - `TEST_MANAGEMENT_TOOL=xray`
  - `JIRA_TESTCASE_ISSUE_TYPE=Test` vì Jira test management dùng Xray.
  - `XRAY_TEST_TYPE=Manual`.
  - `XRAY_TEST_TYPE_FIELD_ID` nếu Jira/Xray instance bắt buộc field `Test Type` khi tạo issue qua Jira REST API.
  - `XRAY_REQUIREMENT_LINK_ENABLED=1` để link mỗi Xray Test về Jira Story/Task `[JIRA_STORY_KEY]` → hiện panel **Test Coverage**.
  - `XRAY_REQUIREMENT_LINK_TYPE=Test` — instance SAPP dùng link type `Test` (outward `tests`), **KHÔNG phải** `Tests`.
  - `XRAY_REQUIREMENT_LINK_DIRECTION=test_to_story` = kit tạo payload `{inwardIssue: Test, outwardIssue: requirement}` → Test ở slot `inwardIssue` (nhãn UI `is tested by`), requirement ở `outwardIssue` (nhãn UI `tests`). **ĐÂY là chiều ĐÚNG** (đã kiểm chứng live, coverage xanh); đảo 2 slot → coverage **TRỐNG**. Nhãn đọc ngược trực giác — bám theo slot/payload, đừng bám chữ.
  - **Điều kiện #2 để coverage hiển thị**: issue type của requirement (Task/Story) phải nằm trong Xray `Coverable Issue Types` (Xray Settings → Requirement Coverage) — chỉ **admin** đổi được, API không đọc/ghi. Thiếu → coverage trống dù chiều link đúng.
  - **Điều kiện #3 (chế độ tính)**: coverage strategy nên = **"Latest Execution"** (lấy lần chạy mới nhất) để re-run phản ánh đúng (fail Lần 1 → pass Lần 2 = OK). Panel NOK dù lần mới nhất đã pass = đang dùng chế độ gộp/"final" → admin đổi trong Xray Settings. ⚠️ ĐỪNG sửa tay step/status execution CŨ (bump `finishedOn` → lệch "mới nhất"). Chi tiết: USER_GUIDE §5.5.0.
- **Assignee (QUY ƯỚC PROJECT: KHÔNG gán cho ai)**: để trống `JIRA_XRAY_ASSIGNEE` → **KHÔNG gán assignee cho cả Test lẫn Precondition** (Precondition vốn không set assignee; Test chỉ set khi biến này có giá trị nên giữ trống). Đây là quy ước bắt buộc của project — không gán người cho Test/Precondition. (Nếu cần theo dõi người chạy thì đặt assignee ở Test Execution, KHÔNG ở Test/Precondition.)
- **Precondition KHÔNG link tới Story/Task cha**: requirement link ("is tested by"/`tests`) CHỈ áp cho **Test**. Precondition chỉ **associate vào Test** (tab Preconditions, `addPreconditionsToTest`), không tạo issue-link tới requirement. Coverage của task tính từ Test, không từ Precondition.
- **Sub-Project + SAPP Board TỰ KẾ THỪA từ Story cha (mặc định)**: kit đọc `customfield_10037` (Sub-Projects) + `customfield_10039` (SAPP Board) của Story rồi gắn cho MỌI Test/Precondition/Test Set → testcase luôn theo đúng sản phẩm/board của Task (LMS / OPs / QLVH / FinHub), không cần chỉnh tay từng task. Re-publish còn **tự đồng bộ lại test cũ** theo Story (self-heal). Tắt/đổi: `--no-inherit-story-fields` | `--inherit-story-fields "cf_a,cf_b"` | `JIRA_TESTCASE_INHERIT_STORY_FIELDS` (đặt `none` để tắt).
- Project SAPP bắt buộc vài custom field khi tạo `Test` (Jira 400 nếu thiếu). `JIRA_TESTCASE_EXTRA_FIELDS` (JSON map fieldId -> value) / `--extra-fields` giờ chỉ là **FALLBACK** — dùng khi Story không có giá trị field kế thừa, hoặc cho field required khác. **Giá trị kế thừa từ Story GHI ĐÈ EXTRA_FIELDS** ở field trùng.
  - Ví dụ fallback: `{"customfield_10039":{"id":"10025"},"customfield_10037":[{"id":"10023"}]}` = SAPP Board `Operations Board` + Sub-Projects `Operations`. Lấy allowedValues qua Jira createmeta nếu cần.
- Đẩy test steps vào panel Xray `Test details` (Action/Data/Expected), thay vì chỉ nằm trong Description:
  - Test steps, Precondition và Test Type là dữ liệu riêng của Xray, KHÔNG phải field Jira; phải ghi qua Xray Cloud API.
  - Cần Xray API Key: `XRAY_CLIENT_ID` + `XRAY_CLIENT_SECRET` (tạo ở Xray > Global Settings > API Keys). Jira API token KHÔNG ghi được Xray steps.
  - Bật bằng `XRAY_PUSH_STEPS=1` hoặc `--push-xray-steps`. Khi bật, script set Test Type=`Manual`, clear step cũ rồi add lại step từ cột `Các bước thực hiện` ghép `Kết quả mong đợi` **theo số thứ tự** (expected không khớp số step thì dồn vào step cuối). `Dữ liệu Test` là cấp testcase nên để ở Description, KHÔNG nhồi vào Data của step (idempotent, re-run an toàn).
  - Nếu không bật hoặc thiếu Xray API key, steps chỉ nằm trong Description (Jira mirror), panel `Test details` sẽ trống.
- Đẩy Preconditions vào tab `Preconditions` của Test (native Xray):
  - Bật bằng `XRAY_PUSH_PRECONDITIONS=1` hoặc `--push-xray-preconditions` (cần Xray API key).
  - Precondition dùng chung theo mã: tách từng `[PRE-xx]` trong cột `Tiền điều kiện` thành 1 issue `Precondition` riêng (dedup toàn task theo label `pre-<MÃ>`, definition lấy từ lần xuất hiện đầu, cảnh báo nếu mô tả lệch), 1 Test associate nhiều Precondition. Sync idempotent: gỡ association không còn cần rồi add cái thiếu.
  - TC không có mã `[PRE-xx]` → fallback tạo Precondition riêng theo `TC-<TC ID>` (không dùng chung).
- Test Set membership dùng association native Xray (`addTestsToTestSet`) khi có Xray API key, thay vì Jira issue link; chỉ khi đó Test mới hiển thị trong tab `Test Sets`. Không có Xray key thì fallback về issue link (không lên tab native).
- Sắp Test vào folder Test Repository: đặt `XRAY_TEST_REPO_FOLDER` (vd `Quản lý Exams`) hoặc `--test-repo-folder`. Cần Xray API key; folder sẽ được tạo nếu chưa có. Lưu ý trên Git Bash (MSYS) truyền path KHÔNG có dấu `/` đầu để tránh bị chuyển thành Windows path, script tự thêm `/`.
  - Subfolder theo sheet chức năng: bật `XRAY_TEST_REPO_SUBFOLDER_BY_SHEET=1` (hoặc `--subfolder-by-sheet`) để mỗi TC vào subfolder `<base>/<tên sheet chức năng>`. Sheet bỏ qua đặt ở `XRAY_TESTCASE_SHEET_EXCLUDE` (mặc định `Summary,Test Cases,Preconditions,Setup Contracts` — sheet `Preconditions` là tiền điều kiện, không push làm Test).
  - Folder cho Precondition: đặt `XRAY_PRECONDITION_FOLDER` (vd `Quản lý Exams/Preconditions`); toàn bộ Precondition sẽ được đưa vào folder này.
- Test Plans / Test Runs KHÔNG thuộc prompt này: Test Plan là artifact kế hoạch (QA quản lý), Test Runs là kết quả thực thi thuộc Phase 2 (import execution results).
- Description của Test chỉ giữ metadata truy vết (TC ID, Nhóm chức năng, Module, Priority, Risk, nguồn Excel, Story) + trỏ tới tab native, KHÔNG lặp lại steps/precondition khi đã đẩy native. Nếu không đẩy native (chỉ Jira mirror), Description giữ đầy đủ steps/data/expected/tiền điều kiện làm fallback. Khi đẩy native cho issue đã tồn tại, script tự refresh lại Description theo dạng gọn.
  - Test Set (MẶC ĐỊNH TẮT — chỉ dùng cho nhóm cắt ngang như Smoke/Regression, KHÔNG dùng theo chức năng vì đã có subfolder Test Repository):
    - `XRAY_TEST_SET_ENABLED=1` hoặc CLI `--with-test-sets`.
    - `XRAY_TEST_SET_ISSUE_TYPE=Test Set`.
    - `XRAY_TEST_SET_LINK_TYPE=Tests` hoặc link type Jira/Xray dùng để gắn Test vào Test Set.
    - `XRAY_TEST_SET_LINK_DIRECTION=testset_to_test`.
    - `XRAY_TEST_SET_STORY_LINK_ENABLED=1` nếu muốn link từng Test Set về Story/Task.
- `JIRA_TESTCASE_PARENT_MODE=auto` nghĩa là chỉ set parent khi issue type là child/sub type.
- `JIRA_TESTCASE_DEDUP=1` để tránh tạo trùng theo `TASK_KEY` + `TC ID`.
- Publish thật cần flag `--qa-approved` hoặc `JIRA_TESTCASE_QA_APPROVED=1`; nếu không có, script phải dừng.

Mode:
- [DRY_RUN / PUBLISH]
- Mặc định chạy DRY_RUN trước để preview.
- Chỉ chạy PUBLISH khi `QA confirmation Status = APPROVED` và user/prompt hiện tại cho phép ghi Jira thật.

Các bước thực hiện:
1. Echo scope và kiểm tra `TASK_OUTPUT_DIR`.
2. Kiểm tra tồn tại:
   - `test-cases/*.xlsx`
   - `reports/phase1-summary.md`
   - `task.md`
3. Đọc Excel source of truth, ưu tiên sheet `Test Cases`.
4. Xác nhận số lượng testcase đọc được từ Excel khớp kỳ vọng trong `phase1-summary.md` hoặc ghi rõ chênh lệch/blocker.
5. Nếu `QA confirmation Status != APPROVED`:
   - Chạy dry-run nếu cần preview.
   - Không chạy publish thật.
   - Ghi vào `task.md`: `Jira testcase publish: Pending QA confirmation`.
6. Chạy dry-run:
   `npm run jira:testcase-publish:dry-run -- --task [TASK_KEY] --story [JIRA_STORY_KEY] --project-output [PROJECT_OUTPUT_DIR]`
   - Nếu có Jira project key riêng, thêm `--project [JIRA_PROJECT_KEY]`.
   - Nếu cần chỉ định Excel cụ thể, thêm `--excel [PATH_TO_XLSX]`.
   - Với Xray mặc định dùng `--issue-type "Test"`.
   - Nếu Jira bắt field Xray Test Type, thêm `--xray-test-type-field [CUSTOMFIELD_ID] --xray-test-type Manual`.
   - KHÔNG dùng `--with-test-sets` cho nhóm chức năng (trùng subfolder); chỉ bật khi cần Test Set cắt ngang (Smoke/Regression...).
   - Nếu muốn đẩy steps vào panel Xray `Test details`, thêm `--push-xray-steps` (cần `XRAY_CLIENT_ID`/`XRAY_CLIENT_SECRET`). Lưu ý dry-run không gọi Xray API; steps chỉ được ghi ở chế độ publish thật.
   - Nếu muốn đẩy Preconditions native, thêm `--push-xray-preconditions`. (Không dùng `--with-test-sets` theo mặc định — xem quy tắc Test Set.)
7. Review dry-run summary:
   - Tổng testcase.
   - Payload summary.
   - Existing/dedup.
   - Error/blocker.
8. Nếu mode là `PUBLISH` và QA đã APPROVED, chạy publish thật:
   `npm run jira:testcase-publish -- --task [TASK_KEY] --story [JIRA_STORY_KEY] --project-output [PROJECT_OUTPUT_DIR] --publish --qa-approved`
   - Thêm các flag tương ứng như dry-run nếu cần.
   - Thêm `--push-xray-steps` nếu muốn ghi steps vào panel Xray `Test details` (cần Xray API key).
   - Sau khi tạo hoặc phát hiện Xray Test đã tồn tại, script phải tạo issue link về `[JIRA_STORY_KEY]` bằng `XRAY_REQUIREMENT_LINK_TYPE`.
   - Mặc định KHÔNG tạo Test Set (nhóm chức năng đã có subfolder Test Repository). Chỉ khi chủ động bật `--with-test-sets` cho nhóm cắt ngang, script mới tạo/tái sử dụng Xray `Test Set` rồi gắn Test tương ứng.
   - Label tối giản, chỉ gắn: marker (`automation-testcase`/`automation-precondition`) + khoá dedup (`task-<TASK_KEY>`, `tc-<TC_ID>`, `pre-<MÃ>`). KHÔNG gắn `group-*`, `layer-*`, `risk-*`, `priority-*`, `xray` (nhóm đã có subfolder Test Repository, priority đã ở field Jira, còn lại là metadata dư thừa/đã thể hiện qua issuetype).
   - Summary của Test chỉ là tên mô tả (cột `Trường hợp kiểm thử`), KHÔNG thêm prefix `[TC] <TC_ID> -` (TC ID đã ở description + label `tc-*` và Test đã nằm trong folder). Summary Precondition dạng `[<MÃ>] <mô tả>`, vd `[PRE-01] Ops Staff đã đăng nhập OPS`.
9. Ghi/cập nhật:
   - `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/reports/jira-testcase-publish-summary.md`
   - `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/reports/jira-testcase-publish.json`
   - `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/task.md`
10. Final cho user chỉ tóm tắt:
    - Mode đã chạy.
    - Tổng testcase đọc từ Excel.
    - Created / Existing skipped / Error.
    - Đường dẫn publish summary.

Quy tắc bắt buộc:
- Excel là source of truth. Không publish từ Markdown nếu Excel đã tồn tại.
- Jira test management tool là Xray: publish testcase thành Xray `Test` issue, không dùng generic `Test Case` nếu project đã cấu hình Xray.
- Mỗi Xray `Test` issue phải được link về đúng Jira Story/Task `[JIRA_STORY_KEY]` để nhìn được coverage theo task, ví dụ `SAPP-3255`.
- Nhóm chính của testcase lấy từ cột `Nhóm chức năng` (fallback đoạn đầu cột `Module` nếu không có), thể hiện qua **subfolder Test Repository** (không dùng label `group-*`, không dùng Test Set theo chức năng). Hạn chế label tối đa: chỉ marker + khoá dedup; không gắn group/layer/risk/priority/xray.
- KHÔNG dùng Test Set theo nhóm chức năng. Nhóm chức năng đã được thể hiện bằng subfolder Test Repository, nên tạo Test Set theo chức năng nữa là trùng lặp. Mặc định `XRAY_TEST_SET_ENABLED=0`, KHÔNG truyền `--with-test-sets`. Test Set chỉ nên dùng cho nhóm CẮT NGANG chức năng (vd `Smoke`, `Regression`, `Cross-app`) và thường chỉ cần khi execute trên Jira; theo dõi thực thi dùng Test Plan + Test Execution, không phải Test Set.
- Không publish thật khi QA chưa xác nhận `APPROVED`.
- Excel là source of truth khi authoring/publish; Phase 2 execute mặc định lấy nguồn từ Xray (`TESTCASE_SOURCE=xray`, kéo về canonical local `from-xray/*.xlsx`), `excel` là opt-out. Sửa nội dung testcase ở Excel rồi re-publish, không sửa thẳng trên Xray.
- Nếu Excel đã bỏ bớt TC sau khi đã publish, prompt này không xóa/deprecate Xray Test cũ; chạy nhánh phụ `partial-rerun/run_xray_test_cleanup.md` sau Human Review/QA approval để cleanup lifecycle.
- Không log Jira bug trong prompt này; log bug Jira thuộc `prompt_templates/phase2/08_log_bug_jira.md`.
- Không đưa secret vào Jira description, report hoặc console.
- Nếu dry-run hoặc publish lỗi, ghi blocker rõ trong publish summary/task.md; không sửa testcase để né lỗi publish.

Extra instruction:
- [ANY_EXTRA_REQUEST hoặc N/A]
```
