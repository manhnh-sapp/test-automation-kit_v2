# Phase 2 - Bước 4: Report, Promote Review Và Jira Gate

> Tổng hợp kết quả execute, ghi shared change/promotion status và chỉ log Jira bug khi case fail đủ điều kiện.

## Mục Đích

Tạo report Phase 2 rõ ràng, không log bug sai do setup/prompt/test data, không upload evidence sai loại lên Jira và không âm thầm đưa task automation vào regression suite chung.

## Workflow

1. Ghi execution summary:
   - Tổng case.
   - PASS/FAIL/SKIP.
   - Pass rate thô + **unassisted pass rate** (loại các case cần người can thiệp giữa chừng).
   - **Autonomy log**: số vòng execute + số lần nhờ người cấp input (account/URL/data/xác nhận tay); nếu 0 ghi rõ.
   - Lý do skip.
   - Fail classification.
   - **Blocker root cause** cho mỗi SKIP/BLOCKED: `needs_hook`/`needs_account`/`needs_sandbox`/`spec_mismatch`/`manual_inherent`/`external_dependency` + owner/route (skill `precondition_setup_planner`).
   - Lỗi đã sửa.
   - Rủi ro còn lại.
2. Ghi Shared Change Log:
   - Nếu không sửa shared file, ghi `Không sửa shared file`.
   - Nếu có sửa, ghi file đã sửa, lý do, story có thể bị ảnh hưởng và regression scope đã chạy/chưa chạy.
3. Ghi Automation Promotion Status:
   - `Not requested`
   - `Pending review`
   - `Approved and promoted`
   - `Rejected/Deferred`
4. Với từng fail nghi product bug, kiểm tra gate:
   - Đã execute thật.
   - Đã rerun đủ để loại flaky/setup/data/prompt issue.
   - Expected result đã xác nhận đúng.
   - Actual result có evidence rõ.
4b. **Gate chất lượng output — THỰC THI, tự chạy (không phải kiểm bằng mắt).**
   - Test Execution: `push_test_execution.js` **tự chạy `scripts/qa/output_gate.js`** trước khi push → CHẶN khi comment run-on/dính debug `key=value`, step thiếu status/evidence, evidence không phải ảnh/video, hoặc case phức tạp thiếu video. Xem/tự sửa trước: `npm run gate:output -- --status <testcase-status.json>` (thêm `--fix` để tự dọn comment).
   - **Gate CHẶN → TỰ SỬA trong session rồi chạy lại tới khi PASS**; KHÔNG push kèm vi phạm, KHÔNG chờ user nhắc. Chỉ `--qa-approved` khi QA có lý do rõ (được log).
   - **Bắt buộc tạo bug/Test Execution QUA script kit** (`bug_reporter.js`/`push_test_execution.js`) — KHÔNG tạo tay bằng Atlassian MCP/API (tạo tay = bỏ qua gate → sai 4 phần/evidence/comment).
5. Chạy Jira dry-run trước.
6. Chỉ log Jira thật khi user yêu cầu hoặc prompt hiện tại cho phép.
7. Jira description chỉ gồm:
   - Tiền điều kiện.
   - Bước.
   - Kết quả hiện tại.
   - Kết quả mong muốn.
8. Evidence upload lên Jira chỉ là ảnh/video.
9. Ghi Knowledge Entry (skill `learning_recorder`, Suggest-only) — **chỉ cho bug đã qua gate ở Bước 4**:
   - Với mỗi bug đã qua gate (đã loại flaky/setup/data/prompt), ghi `knowledge/bugs/<TASK_KEY>__<slug>.json`; nếu đã xác định root cause thì ghi/nối `knowledge/root_causes/<slug>.json` (link 2 chiều).
   - Ghi snapshot pass/fail theo module vào `knowledge/historical_execution/<TASK_KEY>__<date>.json` (lấy số liệu từ execution summary, gồm unassisted pass rate).
   - Cập nhật `knowledge/index.json`.
   - KHÔNG ghi case `BLOCKED_SETUP`/`SKIP_SETUP`/flaky/setup vào `knowledge/bugs/`. Không ghi secret/PII.

## Rules

- Không log Jira cho case skip.
- Không log Jira nếu fail do prompt/test/setup chưa chuẩn.
- Không upload `.md`, `.txt`, `.log`, `.json`, `.zip`, `trace.zip` hoặc execution summary lên Jira.
- Không tự comment Jira nếu workflow không yêu cầu comment.
- Không promote task-scoped automation vào `tests/fe/` hoặc `tests/api/` nếu chưa có review/approval rõ.
- Chỉ ghi Knowledge Entry (`knowledge/bugs/`) cho bug đã qua Jira gate (Bước 4); không ghi setup/flaky/skip vào learning data.

## Outputs

| Output | Vị trí |
|---|---|
| Execution summary | `<TASK_OUTPUT_DIR>/reports/execution-summary.md` (gồm unassisted pass rate + autonomy log + blocker root-cause) |
| Capability gap cập nhật | `<TASK_OUTPUT_DIR>/reports/capability-request.md` (nếu Phase 2 phát hiện thêm `needs_hook`/`needs_account`/`needs_sandbox`) |
| Shared change log | Trong execution summary |
| Automation promotion status | Trong execution summary |
| Jira dry-run result | Report liên quan |
| Jira bug log nếu có | Execution summary hoặc local bug log |
| Knowledge entry (bug/root cause) | `knowledge/bugs/`, `knowledge/root_causes/` (chỉ bug đã qua gate) + `knowledge/index.json` |
| Execution snapshot | `knowledge/historical_execution/<TASK_KEY>__<date>.json` |
