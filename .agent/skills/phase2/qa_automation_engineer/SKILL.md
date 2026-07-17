---
name: qa-automation-engineer
description: Generate, update và execute Playwright UI/API automation cho Phase 2.
---

# QA Automation Engineer

## Purpose

Thực hiện Phase 2 bằng Playwright: đọc testcase đã review, tạo/cập nhật spec/helper cần thiết, execute thật, auto-heal lỗi automation/setup hợp lý và sinh execution report.
Phase 2 chỉ execute phần có thể chạy an toàn qua UI/API public-business contract hoặc setup capability đã có; case cần direct DB/backend state thì chuyển manual/semi-auto thay vì connect DB.

## Responsibilities

| Trách nhiệm | Yêu cầu |
|---|---|
| Scope | Xác nhận `PROJECT_OUTPUT_DIR`, `TASK_KEY`, `TASK_OUTPUT_DIR`, `RUN_ID` trước khi ghi/chạy. |
| Automation | Ưu tiên task-scoped automation, chỉ sửa/generate spec/helper liên quan tới testcase trong scope. |
| Execution | Chạy thật UI/API/E2E theo expected result đã review. |
| Nhạy bén điều tra | Với MỌI tín hiệu bất thường (field trống, count=0, "thành công" nhưng không đổi, 200-mà-body-lỗi, data cũ, latency cao...), khoanh tầng lỗi FE/BE/setup/env/auth qua Console/Network/response TRƯỚC khi kết luận PASS/FAIL — theo `.agent/rules/qa_instincts.md`. Nguồn sự thật của data là API response, không phải UI. |
| Evidence | Ảnh/video (bắt buộc cho MỌI case PASS+FAIL và MỌI step, đã mask PII, highlight đúng element); log chỉ là artifact debug local, không phải evidence. |
| Report | Cập nhật PASS/FAIL/SKIP, actual result, blocker và shared change nếu có. |
| Promotion | Không promote task automation vào core regression nếu chưa có review/approval rõ. |

## Inputs

| Input | Nguồn |
|---|---|
| Testcase đã review | Canonical local theo `TESTCASE_SOURCE`: mặc định `test-cases/from-xray/*.xlsx` (xray), hoặc `test-cases/*.xlsx` (excel); Markdown cùng thư mục chỉ dùng để đọc chi tiết setup khi cần |
| Setup Strategy contract | Section `## Setup Strategy (Hợp đồng tiền điều kiện)` (catalog PRE-NN) trong file testcase |
| Phase 1 summary | `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/reports/phase1-summary.md` |
| Runtime config | `.env.local`, `.env`, CI env; không in secret |
| Rules | `RULE_GLOBAL.md`, `.agent/rules/*.md`, active prompt |

## Outputs

| Output | Vị trí |
|---|---|
| Playwright results | `<TASK_OUTPUT_DIR>/test-results/` hoặc `test-results/runs/<RUN_ID>/` |
| Evidence | `<TASK_OUTPUT_DIR>/test-results/artifacts/` hoặc run-scoped artifacts |
| Execution summary | `<TASK_OUTPUT_DIR>/reports/execution-summary.md` hoặc run-scoped report |
| Task-scoped automation | `<TASK_OUTPUT_DIR>/automation/` |
| Core automation nếu được approve | `tests/fe/<TASK_KEY>.spec.*` hoặc `tests/api/<TASK_KEY>.spec.*` |

## Decision Rules

- Nếu task là Phase 1 sinh testcase, dùng `phase1_generate_tc.md`, không dùng skill này.
- Nếu Phase 2 bắt đầu sau thời gian chờ Dev implement, đọc lại artifact local trước; không dựa vào context hội thoại cũ.
- Khi execute, lấy TC ID/steps/expected/status target từ nguồn canonical local (theo `TESTCASE_SOURCE`, xem Inputs); không gọi Jira/Xray từng case. (Excel là source of truth khi gen/publish.)
- Trước khi generate/execute, chạy Precondition Resolution Pass cho selected TC: đọc Precondition Execution Matrix → map setup method → reuse setup layer `tests/support/setup/` (đặc thù story để ở `<TASK_OUTPUT_DIR>/automation/setup/`) → verify precondition trước assertion chính → cleanup theo `RUN_ID`. Chỉ promote setup helper vào `tests/support/setup/` khi generic và được approve.
- Setup precondition theo Setup Strategy contract (PRE-NN): setup/verify/cleanup theo `Setup Source`/`Setup Verification`/`Cleanup`, không đoán nếu contract đã có. Chỉ skip vì setup khi `Automation Readiness = Manual-only`; `Needs hook` thiếu hook là blocker, không skip âm thầm.
- Không dùng direct DB connection, `TEST_DB_*`, `TEST_DATABASE_URL`, `DATABASE_URL`, `PG*` hoặc backend source inspection để DỰNG precondition. Nếu contract yêu cầu trạng thái sâu nhưng chỉ có DB/backend mới dựng được, ghi `BLOCKED_SETUP`/`SKIP_SETUP` và tạo manual steps. VERIFY state có thể dùng read-only UAT DB qua guarded client `tests/support/setup/db/uatPgClient.ts` (read-only, chỉ SELECT) khi API/UI không expose.
- Setup/verify fail là `setup_failure`: sửa setup rồi rerun, không kết luận product bug và không log Jira.
- Áp Definition of Ready trước khi execute: thiếu precondition/setup method/data/verification/cleanup/capability → `BLOCKED_SETUP` (capability hook/mock/sandbox chưa có) hoặc `SKIP_SETUP` (`Manual-only`) kèm missing capability cụ thể; không chạy bừa.
- Nếu fail do locator/timing/setup/data/auth/dependency/test code, sửa root cause rồi rerun targeted.
- Nếu fail còn lại là product/API bug, rerun đủ để loại flaky/setup trước khi chuyển Jira gate.
- Nếu selected scope không đủ tin cậy, mở rộng scope hợp lý thay vì bỏ sót testcase.
- Nếu thiếu env/credential/source quan trọng, ghi blocker; không tạo pass/skip giả.

## Parallel Safety

- Automation mới sinh cho một story phải ưu tiên nằm trong `<TASK_OUTPUT_DIR>/automation/`.
- Nếu phải ghi vào `tests/fe/` hoặc `tests/api/`, tên file phải namespace theo `TASK_KEY`.
- Nếu chạy song song cùng một `TASK_KEY`, dùng `RUN_ID` cho output và folder/file thử nghiệm.
- Không sửa shared helper/page object/fixture/config khi có story khác đang execute, trừ khi user xác nhận đây là thay đổi chung.
- Nếu bắt buộc sửa shared helper, ghi rõ file đã sửa, lý do, story bị ảnh hưởng và regression scope đã rerun.
- Nếu task-scoped automation đã ổn định nhưng chưa được approve, giữ trong `<TASK_OUTPUT_DIR>/automation/` và ghi `Automation promotion: Pending review/Not requested`.

## Constraints

- Kit hiện dùng Playwright; không sinh framework/script ngoài Playwright.
- Không dựng state bằng DB. Chỉ read-only verify/chẩn đoán trên UAT DB qua guarded client `tests/support/setup/db/uatPgClient.ts` (read-only, chỉ SELECT). Dependency `pg` chỉ được import trong file đó; DB không phải evidence Jira.
- Không xóa assertion quan trọng, không đổi expected result tùy tiện.
- Không mock/stub logic chính nếu testcase cần kiểm thử behavior thật.
- Không upload secret hoặc raw log nhạy cảm vào report/Jira.
- Không log Jira trực tiếp nếu chưa qua điều kiện trong `prompt_templates/phase2/08_log_bug_jira.md`.
- Không đưa task-scoped automation vào regression suite chung nếu chưa có approval.

## Examples

| Request | Hành vi |
|---|---|
| Chạy Phase 2 cho `<TASK_KEY>` | Đọc testcase, generate/update task-scoped Playwright, execute, auto-heal, report. |
| Re-run failed TC IDs | Chạy targeted, phân loại fail/skip, cập nhật evidence/report. |

## Anti-Patterns

- Skip testcase để tăng pass rate.
- Đọc lại toàn bộ requirement lớn khi summary/local artifact đã đủ.
- Chạy full suite mặc định khi chỉ cần selected testcase.
- Ghi status PASS nếu assertion không validate đúng business rule.
- Kết luận PASS/FAIL từ bề mặt UI khi chưa đối chiếu API response / chưa khoanh được tầng lỗi (false pass/false fail).
- Ghi đè shared spec/helper của story khác khi chưa có xác nhận.
- Promote automation vào `tests/fe/` hoặc `tests/api/` chỉ vì Phase 2 pass một lần.
