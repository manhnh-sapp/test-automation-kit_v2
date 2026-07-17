# Shared Setup Layer

Layer dùng chung để **resolve precondition** ở Phase 2 (Precondition Resolution Pass) theo
đúng hợp đồng `## Setup Strategy (Hợp đồng tiền điều kiện)` / `### Precondition Execution Matrix`
mà Phase 1 sinh ra — thay vì đoán endpoint/payload/fixture.

## Cấu trúc

```
tests/support/setup/
  contracts/
    preconditionTypes.ts   # Type cho PRE-NN: PreconditionType, SetupStrategy, AutomationReadiness, SetupFailure
  factories/
    authFactory.ts         # auth_session qua API (Setup Strategy = api)
    userFactory.ts         # tạo user (api/factory) + ví dụ state_mutation qua test_hook
    domainFactory.ts       # tạo domain entity generic (api/factory)
  fixtures/
    fixtureRegistry.ts     # verify dữ liệu pre_existing / read-only fixture
  mocks/
    externalDependencyMock.ts # cô lập dependency ngoài scope + fault injection (không mock behavior đang test)
  hooks/
    testHookClient.ts      # gọi test hook (Setup Strategy = test_hook); thiếu hook => Needs hook
  db/
    uatPgClient.ts         # READ-ONLY verify trên UAT DB (read-only: chỉ SELECT trong txn READ ONLY). KHÔNG dựng state, KHÔNG phải evidence.
  cleanup/
    cleanupRegistry.ts     # đăng ký + chạy cleanup theo RUN_ID (LIFO)
  index.ts                 # barrel export
```

## Map với cột contract của Phase 1

| Cột (Phase 1) | Dùng ở đâu trong layer |
|---|---|
| `Precondition Type` | `PreconditionType` |
| `Setup Method` / `Setup Strategy` | chọn factory / hook / fixture |
| `Setup Source` | tham số truyền vào factory/hook (endpoint, payload, id) |
| `Setup Verification` | `fixtureRegistry.verify` hoặc verify call sau khi setup/tạo data |
| `Cleanup/Rollback` | `cleanupRegistry.register` → `runAll(RUN_ID)` |
| `Automation Readiness` | `SetupFailure.readiness`; `Needs hook` khi thiếu test hook |

## `setup_failure` (không phải product bug)

Mọi lỗi setup/verify ném `SetupFailure`. Execute layer dùng `isSetupFailure(err)` để phân loại
`setup_failure`: sửa setup rồi rerun, KHÔNG kết luận product bug, KHÔNG log Jira. `Needs hook`
mà thiếu hook → BLOCKED + đề xuất hook.

## Task-scoped trước, promote sau

1. Khởi đầu một task: tạo setup task-specific dưới
   `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/automation/setup/` (namespace `RUN_ID` nếu chạy song song).
2. Reuse tối đa factory/hook/fixture có sẵn ở `tests/support/setup/`; chỉ thêm phần đặc thù task.
3. Khi đã ổn định và generic hoá được, **promote** phần dùng chung vào `tests/support/setup/`
   theo `RULE_GLOBAL.md` (Shared Change Gate + Automation Promote Review): cần review/approval,
   không hardcode một task, ghi rõ regression scope.

## Khi nào dùng thành phần nào

| Thành phần | Mục đích |
|---|---|
| Factory | Tạo data thật qua API/business API (ưu tiên đầu tiên) |
| Hook | Set state khó tạo hoặc trigger job/fault ngay (test-only) |
| Fixture | Data có sẵn, chỉ verify tồn tại |
| Mock/Test double | Cô lập dependency NGOÀI scope; KHÔNG mock behavior đang test |
| Cleanup registry | Gom data theo `RUN_ID` để rollback |

DB KHÔNG dùng để DỰNG state. Nếu state không expose qua UI/API/fixture/test hook để **verify**, có thể dùng read-only UAT DB qua `db/uatPgClient.ts` (`queryUatReadonly`; read-only: chỉ SELECT trong transaction READ ONLY); nếu cả DB UAT cũng không expose → `Needs hook`/`Manual-only`. DB chỉ là oracle chẩn đoán — không dựng/mutate state, không phải evidence Jira, PII đọc ra phải mask.

Cách phân loại precondition và chọn method: xem skill `.agent/skills/shared/precondition_setup_planner/SKILL.md`.

## Quy ước

- Không hardcode credential/secret — đọc từ env (`API_BASE_URL`, `API_USERNAME`, ... ).
- Các file ở đây là TEMPLATE generic; đổi endpoint/payload/response shape theo project thật.
- Không sửa file shared khi story khác đang execute (xem Shared Change Gate).
- Không thêm DB client/connection/query helper MỚI; DB chỉ qua guarded client read-only `db/uatPgClient.ts` (UAT, read-only). Không hardcode connection string — đọc từ env `LIB_MASTER_DB_*`.
