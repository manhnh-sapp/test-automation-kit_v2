---
name: precondition_setup_planner
description: Phân loại tiền điều kiện, chọn setup method (factory/hook/fixture/mock), ghi verification + cleanup, đánh dấu readiness/blocker và Definition of Ready cho Setup Strategy contract.
---

# Precondition Setup Planner

## Purpose

Với mỗi precondition của testcase, quyết định cách đạt trạng thái đó tự động và rẻ nhất trong biên an toàn:
chọn setup method, chỉ ra capability cần (API/factory/hook/fixture/mock), viết verification +
cleanup, đánh dấu readiness/blocker. Sinh nội dung cho `## Setup Strategy (Hợp đồng tiền điều kiện)`
và `### Precondition Execution Matrix` ở Phase 1, và là chuẩn để Phase 2 đánh giá Definition of Ready.

Skill này không đề xuất DB để DỰNG state hoặc đọc toàn bộ source backend. Nếu state cần can thiệp sâu mà không có API/test hook/fixture an toàn, đánh dấu `Needs hook` hoặc `Manual-only`. VERIFY state (khi API/UI không expose) có thể dùng read-only UAT DB qua guarded client `tests/support/setup/db/uatPgClient.ts` (read-only, chỉ SELECT) làm `Setup Verification`.

## Responsibilities

| Trách nhiệm | Yêu cầu |
|---|---|
| Phân loại | Gán `Precondition Type` cho từng precondition. |
| Chọn method | Chọn `Setup Strategy` theo thứ tự ưu tiên; chỉ ra factory/hook/fixture/mock cần. |
| Capability | Xác định API/factory/hook/sandbox cần có; nếu chưa có → blocker. |
| Verification | Ghi cách verify state TRƯỚC khi execute behavior chính. |
| Cleanup | Ghi rollback theo `RUN_ID` hoặc lý do không cleanup. |
| Readiness | Đánh dấu `Ready` / `Needs hook` / `Manual-only` + missing capability cụ thể. |

## Component selection — chọn đúng công cụ

| Thành phần | Mục đích | Lưu ý |
|---|---|---|
| Factory | Tạo data thật qua API/business API | Ưu tiên đầu tiên; tự đăng ký cleanup theo `RUN_ID` |
| Hook (test hook) | Set state khó tạo bằng flow thường, hoặc trigger job/fault ngay | Cần capability test-only; thiếu hook → `Needs hook` |
| Fixture | Data có sẵn/read-only, chỉ verify tồn tại | Không tạo mới |
| Mock/Test double | Cô lập dependency NGOÀI scope (3rd-party/integration), fault injection | KHÔNG mock logic/behavior đang test; phải ghi trong report |
| Cleanup registry | Gom data tạo ra theo `RUN_ID` để rollback | LIFO, idempotent |

Thứ tự ưu tiên setup method:
`pre_existing` (nếu đã có) → `api`/`factory` → `test_hook` → `ui` (chỉ khi không còn cách) → `manual`.

Mapping sang code: `tests/support/setup/` (`factories/`, `hooks/`, `fixtures/`, `mocks/`,
`cleanup/`, `contracts/`); đặc thù story đặt ở `<TASK_OUTPUT_DIR>/automation/setup/`.

## Rule quan trọng — UI KHÔNG làm tiền điều kiện

- Nếu testcase KHÔNG nhằm test chính flow tạo tiền điều kiện, KHÔNG bắt UI thực hiện flow đó
  để dựng state. Setup qua `api`/`factory`/`test_hook`/`pre_existing`. UI chỉ verify behavior chính.
- Chỉ dùng `ui` làm setup khi không có API/factory/hook và đã ghi rõ lý do.
- Ngược lại, nếu chính case là "tạo X qua UI" thì bước tạo đó là behavior under test, không phải
  precondition — không setup bằng API.
- Không dùng DB để DỰNG precondition (setup vẫn qua api/factory/test_hook/fixture). VERIFY: nếu API/UI không expose state, có thể dùng read-only UAT DB qua guarded client `tests/support/setup/db/uatPgClient.ts` (read-only, chỉ SELECT) làm `Setup Verification`; nếu cả DB UAT cũng không expose → ghi missing capability và chuyển `Needs hook`/`Manual-only`.

## Pattern cho các nhóm khó (generic)

| Nhóm precondition | Thường cần | Giải pháp chung |
|---|---|---|
| Composite entity + bộ đếm state (vd user gắn nhóm/đơn vị + counter thao tác) | nhiều entity liên kết + giá trị đếm | `entityFactory` + `stateFactory` + hook `setCounter` |
| Linked/association (A gắn B, có thành viên) | quan hệ giữa entity | `factory.link(a, b)` + verify qua detail API |
| Progress/percentage state (0 / >0 / mốc) | tiến độ/enrollment | factory tạo enrollment + hook `setProgress` |
| External integration + failure mode (5xx/timeout) | dependency 3rd-party | sandbox env hoặc mock adapter + hook inject failure |
| Scheduled/async job tại milestone | mốc + timezone + declared state + trigger | hook set milestone + trigger job ngay (không chờ scheduler thật) |

Đây là pattern generic; khi áp dụng cho một domain cụ thể, đổi tên entity/endpoint theo project,
không hardcode một task vào template chung.

## Mock/Test double — phạm vi cho phép

- Chỉ dùng cho dependency NGOÀI scope (third-party/integration) và fault injection (5xx/timeout/abort).
- KHÔNG thay thế behavior/logic đang kiểm thử. Mọi mock phải ghi rõ trong actual result/report.
- Capability: sandbox env, hoặc mock adapter (`tests/support/setup/mocks/`) + hook inject failure.

## Definition of Ready (DoR) cho Phase 2

Một testcase chỉ READY cho automation khi đủ tất cả:

1. Precondition rõ (gắn `PRE-NN`).
2. Setup method rõ.
3. Test data cụ thể hoặc fixture reference rõ.
4. Verification trước execute.
5. Cleanup/rollback rõ.
6. Capability cần (hook/mock/sandbox) đã tồn tại.

Thiếu bất kỳ điều nào → KHÔNG READY. Không cố chạy bừa ở Phase 2; ghi blocker với missing
capability cụ thể.

## Readiness → status Phase 2

| Readiness | Điều kiện | Status Phase 2 khi chưa chạy được |
|---|---|---|
| `Ready` | Đủ DoR, setup qua `api`/`factory`/`pre_existing` | (chạy bình thường) |
| `Needs hook` | Cần hook/mock/sandbox CHƯA có | `BLOCKED_SETUP` + missing capability |
| `Manual-only` | Không có capability an toàn để tự động setup (API/factory/hook/fixture/sandbox đều không dựng được state); KHÔNG dùng DB để thay thế | `SKIP_SETUP` + lý do/manual steps |

`BLOCKED_SETUP` và `SKIP_SETUP` KHÔNG phải product bug và không log Jira bug.

## Blocker Root Cause — phân loại đúng gốc rễ (routing)

`Manual-only`/`BLOCKED_SETUP`/`SKIP_SETUP` KHÔNG phải một cục "backend state" chung. Mỗi case chưa tự động hoá được phải gắn ĐÚNG 1 root cause để route đúng owner — đừng gộp hết vào "cần DB/backend":

| Root cause | Nghĩa | Route / Owner | Vào capability-request? |
|---|---|---|---|
| `needs_hook` | Thiếu test hook backend để dựng/verify state | Dev/BE | Có |
| `needs_account` | Thiếu account/role/quyền để chạy flow | DevOps/QA-Lead | Có |
| `needs_sandbox` | Thiếu sandbox cho dependency ngoài (VNPay/Zoom/HubSpot…) | DevOps/BE | Có |
| `spec_mismatch` | Build khác spec/testcase (flow đã đổi, không dựng được theo spec cũ) | BA/Dev align + nhánh Partial Rerun | Không (không phải capability) |
| `manual_inherent` | Bản chất manual (file thật rất lớn, thao tác vật lý, tương tác ngoài tầm automation) | QA chạy tay | Không |
| `external_dependency` | Dependency thật ngoài scope/chưa sẵn sàng | Ghi blocker | Tùy |

Chỉ `needs_hook`/`needs_account`/`needs_sandbox` là "capability gap" đi vào `reports/capability-request.md`. `spec_mismatch` đi nhánh Partial Rerun; `manual_inherent` là manual thật. KHÔNG dùng DB cho bất kỳ nhãn nào.

## Inputs

| Input | Nguồn |
|---|---|
| Testcase + precondition | Bảng testcase Phase 1 |
| Requirement/API spec | Swagger/OpenAPI, Confluence, business rule |
| Capability hiện có | `tests/support/setup/`, env (`TEST_HOOK_BASE_URL`, sandbox) |

## Outputs

| Output | Vị trí |
|---|---|
| Setup Strategy contract (PRE-NN) | Section trong testcase Markdown |
| Precondition Execution Matrix | `reports/phase1-summary.md` |
| Missing capability/blocker | Matrix `Blocker` + Phase 1 summary `### Setup Readiness` |
| Capability / Test-Hook Request (handoff Dev) | `reports/capability-request.md` (khi còn `Needs hook`/`Manual-only`) |

## Decision Rules

- Ưu tiên setup rẻ và ổn định nhất theo thứ tự method ở trên.
- Endpoint/payload phải dựa trên Swagger thật; không có cách setup → `Needs hook`, không bịa.
- `state_mutation`/data tạo mới bắt buộc có cleanup hoặc lý do.
- Capability thiếu phải nêu rõ tên (hook nào, mock/sandbox nào), không ghi chung chung.
- Không đề xuất DB setup/mutation hoặc backend source inspection như một capability. DB read-only verify trên UAT (guarded client `tests/support/setup/db/uatPgClient.ts`, read-only) là phương án `Setup Verification` hợp lệ — KHÔNG phải capability gap; setup/mutation bằng DB vẫn không dùng.

## Constraints

- Không hardcode task/domain cụ thể vào pattern/template chung.
- Không mock behavior đang test; mock chỉ cho dependency ngoài scope.
- Không ghi secret vào contract/report.
- Không connect DB ngoài guarded client `tests/support/setup/db/uatPgClient.ts` (UAT read-only). Không đưa connection string/credential DB vào bất kỳ testcase/report/prompt nào.

## Anti-Patterns

- Bắt UI dựng tiền điều kiện cho case không test flow tạo đó.
- Đánh dấu `Ready` khi capability (hook/mock) thực tế chưa tồn tại.
- Ghi blocker mơ hồ ("cần setup") thay vì missing capability cụ thể.
- Coi `Needs hook`/`Manual-only` là product bug hoặc fail thật.

## Related

- [[test_data_generator]] — sinh giá trị data cụ thể; planner này lo cách dựng state/precondition.
