# Test Hook Contract

> Hợp đồng cho **test hook** — endpoint chỉ dùng cho test, để dựng/verify trạng thái mà
> `api`/`factory`/`fixture` không tạo được an toàn. Đây là cách chuẩn để đóng các case bị đánh dấu
> `Needs hook` → `BLOCKED_SETUP` ở Phase 2, **thay cho việc DỰNG state bằng DB** (kit không dựng state bằng DB; DB chỉ read-only verify UAT qua `../db/uatPgClient.ts`, read-only).

## Test hook là gì và khi nào cần

Test hook là một endpoint HTTP **test-only** do team Dev cung cấp trên môi trường non-prod, cho phép:
- Set nhanh một state khó dựng qua flow thường (vd: session đã kết thúc, counter, milestone, deadline).
- Bơm data mẫu cho một job chạy backend rồi **trigger job ngay** (vd: data Zoom/Dahahi để tính công).
- Inject fault cho dependency ngoài scope (5xx/timeout) khi không có sandbox.

Chỉ dựng hook khi Phase 1 đã đánh dấu precondition là `Needs hook` trong
`### Precondition Execution Matrix` và không có đường `api`/`factory`/`fixture`/`pre_existing` an toàn.
Thứ tự ưu tiên vẫn là: `pre_existing → api/factory → test_hook → ui → manual`.

## Nguyên tắc bắt buộc

| Rule | Lý do |
|---|---|
| **Non-prod guard** | Hook chỉ được bật ở dev/staging/UAT. Trên prod phải trả `404`/`403`. Bắt buộc — không có ngoại lệ. |
| **Không thay behavior đang test** | Hook chỉ dựng *tiền điều kiện*. Nếu chính case là "tạo X", thì tạo X là behavior under test, KHÔNG được dựng bằng hook. |
| **Đi qua business rule khi có thể** | Ưu tiên hook gọi lại service layer thật; chỉ set state thô khi state đó vốn không tạo được qua nghiệp vụ. |
| **Idempotent** | Gọi lại cùng payload không nhân bản/sai state; trả cùng kết quả. |
| **Cleanup được** | Data hook tạo phải xóa/rollback được (trả về id để đăng ký `cleanupRegistry` theo `RUN_ID`). |
| **Auth test-only** | Bảo vệ bằng token riêng (`TEST_HOOK_TOKEN`), không dùng credential người dùng thật. |
| **Không log secret** | Payload/response không chứa PII, connection string, token thật. |

## Quy ước endpoint

- Base URL đặt ở env **`TEST_HOOK_BASE_URL`** (client tự lấy — xem `testHookClient.ts`). Token đặt ở `TEST_HOOK_TOKEN`.
- Prefix cố định `/(test-hooks|__test__)/` để dễ chặn ở prod và audit.
- Đặt tên theo `POST /test-hooks/<domain>/<action>`, dùng động từ rõ:
  - `.../seed-*` — tạo data tiền điều kiện.
  - `.../set-*` — set một state/counter/flag.
  - `.../trigger-*` — kích hoạt job/async ngay (không chờ scheduler thật).
  - `.../inject-*` — inject fault cho dependency ngoài scope.
- Method: `POST` cho set/seed/trigger; `DELETE` cho cleanup nếu tách riêng.

## Request / Response shape

Request:

```jsonc
// POST /test-hooks/attendance/seed-sessions
{
  "runId": "run-20260703-01",     // gắn để cleanup theo RUN_ID
  "params": { /* tham số state, dựa trên Swagger/business, KHÔNG phải cột DB */ }
}
```

Response `2xx`:

```jsonc
{
  "ok": true,
  "created": [                    // để đăng ký cleanup
    { "type": "attendance_session", "id": "..." }
  ],
  "state": { /* echo state đã set để test verify trước khi execute */ }
}
```

Lỗi: trả HTTP `>=400`. Client sẽ ném `SetupFailure(readiness: 'Needs hook')` → Phase 2 phân loại
`setup_failure`/`BLOCKED_SETUP`, **không log product bug**.

## Dùng trong automation

```ts
import { testHookClient } from 'tests/support/setup';

const res = await testHookClient.call<{ created: { type: string; id: string }[] }>(
  '/test-hooks/attendance/seed-sessions',
  { runId: process.env.RUN_ID, params: { teacherId, month: '2026-06' } },
  'PRE-07', // preconditionId để trace khi thiếu hook
);
// đăng ký cleanup theo RUN_ID (LIFO) — xem cleanup/cleanupRegistry.ts
```

Thiếu `TEST_HOOK_BASE_URL` hoặc hook trả lỗi → `SetupFailure(needsHook=true)`; case ghi
`BLOCKED_SETUP` + tên hook còn thiếu, không cố chạy bừa.

## Hook KHÔNG được làm

- ❌ Chạy được trên prod (thiếu non-prod guard).
- ❌ Mock/ghi đè chính logic đang kiểm thử để "làm pass".
- ❌ Ghi thẳng vào DB bỏ qua toàn bộ validation của feature đang test (dựng state sai lệch thực tế).
- ❌ Trả/nhận PII (email, SĐT học viên) hoặc secret.
- ❌ Tạo data không cleanup được.

## Bàn giao cho Dev (Definition of Ready)

Một hook coi là "sẵn sàng" cho Phase 2 khi Dev cung cấp đủ:

1. Endpoint path + method theo quy ước trên.
2. Payload/response shape cụ thể.
3. Non-prod guard đã bật + cơ chế auth (`TEST_HOOK_TOKEN`).
4. Cách cleanup/rollback data hook tạo.
5. Môi trường có `TEST_HOOK_BASE_URL` trỏ đúng.

QA gom các hook còn thiếu (từ `### Precondition Execution Matrix` các task) thành một danh sách
capability-request gửi Dev, thay vì phát hiện lại từng task.

## Liên quan

- `hooks/testHookClient.ts` — client gọi hook, sinh `SetupFailure` khi thiếu/không gọi được.
- `contracts/preconditionTypes.ts` — `SetupFailure`, `AutomationReadiness`.
- `.agent/skills/shared/precondition_setup_planner/SKILL.md` — phân loại `Needs hook`/`Manual-only`.
- `tests/support/setup/README.md` — tổng quan setup layer và thứ tự ưu tiên method.
