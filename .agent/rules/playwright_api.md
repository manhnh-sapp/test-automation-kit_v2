# Playwright API Rules

> Rule cho API automation bằng Playwright request context.

## Scope

Dùng cho REST API testcase, contract validation, auth flow và API setup/cleanup phục vụ UI/E2E.

## Assertions

- Luôn assert status code.
- Với response JSON, assert body field/schema/business rule quan trọng.
- Với negative case, assert error code/message/body theo spec.
- Với mutation, verify side-effect hoặc rollback result.
- Verify ưu tiên qua API/UI/fixture. Nếu state không expose được, có thể verify (read-only) trên UAT DB qua guarded client `tests/support/setup/db/uatPgClient.ts` (read-only, chỉ SELECT); nếu cả DB UAT cũng không có → `BLOCKED_SETUP`/manual. KHÔNG dựng state bằng DB.

## Auth And Secrets

- Token lấy động qua login API hoặc env.
- Không hardcode bearer token/password/cookie/API key.
- Redact secret khỏi request/response log và report.

## Data

- Data tạo bằng API phải unique và cleanup được.
- Không dùng dữ liệu production/thật nếu không có approve.
- Nếu fixture/read-only data cần tồn tại, verify trước khi execute.
- Không dùng DB để setup/dựng state. Read-only verify trên UAT DB được phép qua guarded client `tests/support/setup/db/uatPgClient.ts` (read-only, chỉ SELECT).

## Evidence

- Bắt buộc cho MỌI case đã execute (PASS và FAIL) + MỌI step; evidence hợp lệ CHỈ ảnh/video — chụp màn hiển thị response/data đã render. Request/response summary chỉ là log debug local, KHÔNG phải evidence.
- Jira attachment chỉ ảnh/video (cấm `.json/.md/.txt/.log/.html/.csv/trace.zip`); cần proof thì kèm screenshot. Chi tiết: RULE_GLOBAL §Evidence.

## Anti-Patterns

- Chỉ assert `res.ok()` cho business-critical API.
- Đổi expected status để làm test pass.
- Bỏ schema/body assertion quan trọng.
- Mock API chính khi testcase cần kiểm contract thật.
