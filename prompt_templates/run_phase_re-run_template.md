# Prompt Re-run - Chạy lại bug và testcase fail

> Prompt chuẩn để chạy Re-run: chạy lại testcase fail hoặc Jira bug đã fix, cập nhật bằng chứng/trạng thái khi kết quả PASS thật.

## Mục đích

Dùng prompt này khi cần chạy lại testcase fail trước đó hoặc verify Jira bug sau khi Dev fix. Rerun chỉ xử lý bug/case đã có kết quả execute trước đó; không dùng để kiểm tra, đồng bộ hoặc xử lý tài liệu nguồn mới.

## Khi nào dùng

| Tình huống | Dùng prompt này |
|---|---|
| Re-run testcase fail trước đó | Có |
| Xác minh Jira bug đã fix | Có |
| Re-run bug Jira và chuyển `Done` nếu PASS thật | Có |
| Sửa locator do lỗi automation khi đang rerun bug | Chỉ khi không đổi requirement/design/API |
| Confluence/Jira requirement đổi | Không, không thuộc rerun |
| Figma/UIUX đổi | Không, không thuộc rerun |
| Swagger/OpenAPI/API behavior đổi | Không, không thuộc rerun |
| Chạy lại toàn bộ Phase 2 từ đầu | Không, dùng `prompt_templates/run_phase2_template.md` |

## Đầu vào

| Đầu vào | Bắt buộc | Ghi chú |
|---|---|---|
| `PROJECT_OUTPUT_DIR` | Có | Thư mục output gốc của project. |
| `TASK_KEY` | Có | Phạm vi task/feature. |
| `TESTCASE_SOURCE` | Không bắt buộc | **`xray` (mặc định)** hoặc `excel`. `xray`: kéo testcase liên quan từ Xray về local trước khi rerun (xem dưới); `excel`: dùng Excel local. |
| `PUSH_XRAY_EXECUTION` | Không bắt buộc | `1` để đẩy trạng thái các TC vừa rerun lên Xray dưới dạng Test Execution mới (xem dưới). |
| `RUN_ID` | Không bắt buộc | Bắt buộc nếu rerun song song cùng một `TASK_KEY`. |
| `TC_IDS_OR_N/A` | Không bắt buộc | Danh sách testcase cần rerun. |
| `JIRA_BUG_KEYS_OR_N/A` | Không bắt buộc | Bug cần verify hoặc giữ mở. |
| `RERUN_SCOPE_OR_ERROR` | Không bắt buộc | Lỗi, vấn đề setup, vấn đề locator hoặc phạm vi cần xử lý trong rerun bug. |

## Đầu ra

| Đầu ra | Vị trí |
|---|---|
| Report rerun | `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/reports/rerun/` |
| Evidence được cập nhật | `test-results/artifacts/` hoặc Jira attachment/comment khi đủ điều kiện |
| Trạng thái Jira được cập nhật | Chỉ chuyển `Done` khi testcase `PASS` thật và có evidence ảnh/video |
| Task/report được cập nhật | `task.md`, `reports/execution-summary.md` hoặc rerun report liên quan |

## Quy trình

| Bước | Hành động |
|---:|---|
| 1 | Echo scope `PROJECT_OUTPUT_DIR`, `TASK_KEY`, `TASK_OUTPUT_DIR`, `RUN_ID` nếu có; nếu sai task thì dừng. |
| 1b | **Mặc định (`TESTCASE_SOURCE=xray`)**: kéo testcase liên quan từ Xray về local trước khi rerun — `node scripts/integrations/jira/pull_testcases.js --only <TC_IDS> --write` (bỏ `--only` để kéo cả task). Dùng `test-cases/from-xray/*.xlsx` làm nguồn expected. Cần `XRAY_CLIENT_ID`/`XRAY_CLIENT_SECRET`; nếu report cảnh báo TC thiếu steps thì dừng và báo user. Bỏ qua bước này nếu `TESTCASE_SOURCE=excel`. |
| 2 | Xác định rerun type: failed testcase, fixed Jira bug hoặc automation/setup issue trong phạm vi bug rerun. |
| 3 | Đọc report/task artifact gần nhất theo file priority bên dưới. |
| 4 | Rerun targeted scope trước, không chạy full suite nếu không cần. |
| 5 | Nếu fail/skip do automation/setup/data/env, sửa root cause và rerun lại. |
| 6 | Nếu `PASS` thật cho Jira bug đã fix, attach evidence **đã annotate** + comment ngắn gọn **nhúng ảnh inline** rồi chuyển bug sang `Done` (chi tiết ở mục "Re-run bug Jira đã được fix"). |
| 7 | Nếu `FAIL`, `SKIP` hoặc `BLOCKED`, giữ bug mở, ghi lý do vào report local; nếu user yêu cầu thì comment tag Dev + evidence annotate (đỏ = điểm lỗi). |
| 7b | **Sau khi rerun xong — TỰ TẠO Test Execution, KHÔNG cần QA xác nhận** (re-run là mốc verify rõ ràng; trừ `PUSH_XRAY_EXECUTION=0`): cập nhật `test-results[/runs/RUN_ID]/testcase-status.json` cho các TC vừa chạy — **case FAILED phải kèm `steps[]`/`failedStep` + evidence bước lỗi** → `node scripts/integrations/jira/push_test_execution.js --task [TASK_KEY] --story [JIRA_STORY_KEY] --project-output [PROJECT_OUTPUT_DIR] --auto` (+ `--run-id [RUN_ID]`), `--dry-run` xem nhanh rồi `--write` luôn (không chờ QA). **Cơ chế chung** (guard · status-map · step-level · assignee · đóng execution · lưu ý coverage · evidence ảnh/video cho MỌI case+step · comment Test Run gọn) **giống Phase 2 §13b** (`run_phase2_template.md`) — không lặp lại ở đây. **Đặc thù re-run (built-in):** title `Lần <N>` (N = số execution + 1); tự dò & link Test Plan theo sprint (`[Test Plan] <tên sprint>`); tự điền field (Test Execution ← copy từ Story: Sprint/Start date/SAPP-Due date — **KHÔNG** gắn Fix versions vào Details, bật lại `--fill-fixversions`/`XRAY_EXECUTION_FILL_FIXVERSIONS=1`; Test Plan ← theo sprint, chỉ khi trống). Override `--test-plan`/`--no-test-plan`; `--execution-key [KEY]` để append vào execution có sẵn (giữ tên). |
| 8 | Lặp lại cho đến khi toàn bộ bug trong scope đã `Done` hoặc còn blocker/product fail cần Dev xử lý. |

## An toàn khi chạy song song nhiều story

- Không sửa `.env` hoặc `.env.local` chung khi có session khác đang chạy.
- Nếu yêu cầu hiện tại của user không nêu rõ `TASK_KEY`, không dùng `TASK_KEY` từ `.env` hoặc context cũ để chạy; phải hỏi lại.
- Mỗi command rerun phải truyền đúng `PROJECT_OUTPUT_DIR`, `TASK_KEY` và `RUN_ID` nếu cần.
- Nếu chạy song song cùng một `TASK_KEY`, bắt buộc dùng `RUN_ID`.
- Khi có `RUN_ID`, đọc/ghi Playwright output dưới:
  `<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/test-results/runs/[RUN_ID]/`
- Khi có `RUN_ID`, ghi rerun summary dưới:
  `<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/reports/runs/[RUN_ID]/`
- Khi có `RUN_ID`, không ghi đè testcase Markdown/Excel chính trong lúc rerun; ghi kết quả vào run-scoped rerun summary/status.

## Thứ tự ưu tiên đọc file

Đọc theo thứ tự ưu tiên để tiết kiệm token:

| Ưu tiên | File/Artifact |
|---:|---|
| 1 | `<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/task.md` |
| 2 | `<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/reports/execution-summary.md` hoặc report rerun gần nhất |
| 3 | Jira bug mapping local: `reports/jira_bug_log.md`, `reports/execution-summary.md`, `task.md` |
| 4 | Testcase/spec/helper liên quan trực tiếp tới `TC_ID`, endpoint hoặc locator |
| 5 | Artifact trực tiếp: `results.json`, `phase2-status.json`, `error-context.md`, screenshot/video path |
| 6 | Raw requirement/design/API chỉ đọc khi cần xác nhận expected result của bug/case đang rerun; không kiểm tra source change trong rerun |

## Quy tắc tiết kiệm token

- Không paste lại toàn bộ testcase, requirement, Swagger, Playwright report, trace, DOM hoặc execution summary vào câu trả lời.
- Ưu tiên đọc file theo đường dẫn và chỉ mở đoạn liên quan bằng search/line range.
- Chỉ đọc sâu các file liên quan trực tiếp tới `TC_ID`, endpoint, locator, module hoặc error đang xử lý.
- Nếu đã có report/snapshot local, dùng report/snapshot làm source chính thay vì đọc lại raw requirement lớn.
- Mọi raw artifact lớn phải lưu vào file local dưới `<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/reports/rerun/`.
- Final chỉ tóm tắt đường dẫn và kết quả, không paste diff dài hoặc raw log lớn.
- Không sinh/cập nhật testcase theo tài liệu mới trong rerun.
- Không chạy toàn suite nếu chỉ cần verify subset.
- Chỉ chạy full suite khi thay đổi shared helper, auth/setup hoặc user yêu cầu.

## Quy tắc chất lượng

- Tiết kiệm token không được làm giảm độ tin cậy rerun.
- Không được bỏ sót bug còn mở, bỏ qua evidence hoặc tạo `PASS` ảo.
- Nếu report/snapshot local không đủ để xác định TC ID, expected result, Jira mapping hoặc root cause, phải đọc thêm testcase gốc, requirement/API/design hoặc Jira issue liên quan.
- Nếu expected result không còn đủ rõ trong artifact hiện tại, ghi blocker hoặc yêu cầu xác nhận; không tự xử lý tài liệu mới trong rerun.
- Nếu targeted rerun không đủ chứng minh phạm vi ảnh hưởng, mở rộng scope rerun hợp lý.
- Không kết thúc rerun chỉ vì số liệu tổng quan đẹp nếu vẫn còn Jira bug mở, case `SKIP` chưa rõ lý do hoặc evidence `PASS` chưa đủ.
- Nếu có trade-off giữa ít token và xác nhận bug fix chắc chắn, ưu tiên xác nhận chắc chắn.

## Cache và output

| Đầu ra | Mẫu đường dẫn |
|---|---|
| Rerun folder | `<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/reports/rerun/` |
| Markdown summary | `<YYYYMMDD-HHMMSS>-[rerun-type].md` |
| Machine-readable summary | `<YYYYMMDD-HHMMSS>-[rerun-type].json` |

## Quy tắc cập nhật file

- Sửa tối thiểu đúng file liên quan.
- Không refactor ngoài phạm vi rerun.
- Không đổi expected result nếu chưa có requirement/API/design xác nhận.
- Không cập nhật testcase/automation theo tài liệu mới trong rerun, trừ lỗi automation/setup cần sửa để bug rerun chạy được và không làm đổi business expectation.
- Không xóa assertion quan trọng để làm test pass.
- Không dùng mock/stub làm mất mục tiêu kiểm thử thật.
- Không ghi secret/token/password/cookie/API key vào code/report/log.

## Chiến lược rerun

| Bước | Quy tắc |
|---:|---|
| 1 | Ưu tiên chạy lại testcase `FAIL` trước đó theo `TC_ID` hoặc Jira bug mapping. |
| 2 | Chạy targeted test trước theo `TC_ID`, file spec hoặc endpoint liên quan. |
| 3 | Với lỗi locator/flaky/setup đã sửa, rerun targeted 2 lần nếu chi phí thấp. |
| 4 | Chỉ chạy full suite khi thay đổi helper dùng chung hoặc có rủi ro regression rộng. |
| 5 | Nếu command fail do environment/auth/dependency, ghi blocker rõ trong report local và không log Jira product bug. |

## Quality gate theo từng lần rerun

| Trạng thái | Yêu cầu |
|---|---|
| `PASS` | Có assertion thật và evidence ảnh/video không trắng khi liên quan Jira bug. |
| `FAIL` | Có actual result mới, phân loại nguyên nhân và evidence/local artifact đủ rõ. |
| `SKIP` | Có lý do cụ thể và đánh giá có thể sửa để chạy được không. |
| `BLOCKED` | Ghi rõ blocker, owner hoặc điều kiện cần để chạy tiếp. |

## Re-run bug Jira đã được fix

| Điều kiện | Quy tắc |
|---|---|
| Mapping Jira/TC | Chỉ xử lý khi có mapping rõ giữa `JIRA_BUG_KEY` và `TC_ID`. |
| Testcase PASS thật | Execute thật, không skip, không pass do bỏ assertion/mock sai/sửa expected tùy tiện. |
| Bug đã fix | Upload/add evidence ảnh/video, comment Re-run PASS, chuyển Jira bug sang `Done`. |
| Testcase FAIL/SKIP | Không chuyển Jira sang `Done`; ghi report local. |
| Evidence | Chỉ dùng `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.mp4`, `.webm`. |

Khi testcase `PASS` thật:

1. **Chụp lại evidence và ANNOTATE**: khoanh vùng + nhãn ngắn, **xanh lá = điểm đã đúng/đã fix** (đối chiếu tài liệu). Nếu đang cập nhật lại evidence cũ → **xóa attachment cũ rồi upload bản mới** (không để trùng nhiều bản trên 1 bug). Kỹ thuật annotate + replace: xem `prompt_templates/phase2/08_log_bug_jira.md`, mẫu `outputs/**/automation/annotate_*.js`.
2. Upload/add evidence ảnh/video (đã annotate) vào Jira bug.
3. **Comment ngắn gọn, dễ nhìn** (không viết đoạn dài):
   - 1 dòng tiêu đề trạng thái, vd `✅ Re-run PASS: [TC_ID] đã chạy lại sau fix`.
   - Gạch đầu dòng các điểm đã đúng nếu nhiều ý.
   - **Nhúng ảnh evidence INLINE** ngay dưới text bằng REST v2 wiki `!<tên file>|width=900!` (v3/ADF không nhúng attachment được); kiểm render bằng `?expand=renderedBody`.
4. Chuyển status Jira bug sang `Done` bằng transition hợp lệ của project.
5. Cập nhật report local với Jira key, TC ID, status cũ, status mới, evidence path, comment/transition result.

Khi testcase vẫn `FAIL`/`SKIP` (bug **chưa fix**): không chuyển `Done`, giữ nguyên trạng thái. Nếu user yêu cầu báo lại Dev:

- Comment ngắn gọn, tách nhóm **"Đã đúng" / "Còn lỗi"**, **tag Dev** bằng mention `[~accountid:<id>]`.
- Nhúng evidence đã annotate INLINE, **đỏ = điểm còn lỗi** (nêu rõ sai gì + đúng phải thế nào).
- Ghi actual mới + evidence path vào report local.

Nếu user không yêu cầu, chỉ ghi report local, không comment Jira mặc định.

## Vòng rerun đến khi bug được fix

Chu trình rerun phải lặp lại cho đến khi tất cả Jira bug thuộc phạm vi task/story đã được verify `PASS` và chuyển sang `Done`, hoặc còn blocker rõ ràng không thể tự xử lý.

| Bước | Hành động |
|---:|---|
| 1 | Lấy danh sách Jira bug còn mở theo scope hiện tại. |
| 2 | Xác định TC ID/spec/endpoint liên quan cho từng bug. |
| 3 | Rerun targeted testcase. |
| 4 | Nếu `PASS` thật, attach evidence annotate (xanh = đã đúng) + comment ngắn gọn nhúng ảnh inline, rồi chuyển Jira bug sang `Done`. |
| 5 | Nếu `FAIL`, giữ bug mở, ghi actual mới/evidence local vào report và chờ Dev fix tiếp; nếu user yêu cầu thì comment tag Dev + evidence annotate (đỏ = điểm lỗi). |
| 6 | Nếu `SKIP`, giữ bug mở, ghi lý do skip và ưu tiên fix nguyên nhân skip nếu thuộc setup/automation. |

Sau mỗi vòng, report local phải gồm:

- Tổng bug trong scope.

- Số bug đã chuyển `Done`.
- Số bug còn `Open/In Progress/To Do`.
- Bug còn fail/skip và lý do.
- Evidence path cho các bug đã `PASS`.

## Ngoài phạm vi: thay đổi tài liệu nguồn

Rerun không xử lý cập nhật tài liệu nguồn và không tự kiểm tra source change. Những việc sau chỉ được xử lý bằng nhánh phụ riêng khi user yêu cầu rõ:

| Change | Reason |
|---|---|
| Requirement/AC/business rule đổi | Expected result và coverage có thể thay đổi. |
| Figma/UIUX flow đổi | Test steps, locator hoặc visual assertion có thể thay đổi. |
| Swagger/OpenAPI đổi | API contract/status/schema có thể thay đổi. |
| Bug cũ có thể không còn valid do spec đổi | Cần re-triage trước khi Re-run. |

## Stop Criteria

Dừng rerun khi:

- Tất cả bug trong scope đã `Done`, hoặc
- Bug vẫn fail do product chưa fix và cần Dev xử lý tiếp, hoặc
- Bị chặn bởi auth/env/dependency/quyền Jira/evidence không capture được.

## Final Output To User

- Tối đa 8 bullet.
- Gồm phạm vi đã xử lý, file đã sửa, test đã chạy, kết quả, artifact/report path, blocker/rủi ro nếu có.
- Nếu có Re-run Jira bug, nêu bug nào đã chuyển `Done`, evidence ảnh/video nào đã được comment/attach, bug nào chưa đủ điều kiện.
- Nếu còn Jira bug chưa `Done`, nêu số lượng còn lại và lý do dừng vòng rerun.
- Không paste diff dài; chỉ dẫn file path.

## Ví dụ

```text
Đọc prompt_templates/run_phase_re-run_template.md và rerun các bug còn mở cho:
PROJECT_OUTPUT_DIR=outputs/<YOUR_PROJECT>
TASK_KEY=<TASK_KEY>
JIRA_BUG_KEYS_OR_N/A=<BUG-1>, <BUG-2>
TC_IDS_OR_N/A=<TC_ID_1>, <TC_ID_2>
RERUN_SCOPE_OR_ERROR=N/A
```

## Tài liệu tham chiếu

| Tài liệu | Mục đích |
|---|---|
| `prompt_templates/run_phase2_template.md` | Full Phase 2 execution template. |
