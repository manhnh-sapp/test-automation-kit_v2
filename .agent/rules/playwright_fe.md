# Playwright FE Rules

> Rule cho UI/E2E automation bằng Playwright.

## Browser And Debug

- Khi debug UI, dùng viewport desktop `1920x1080`.
- Nếu dùng Playwright MCP, resize browser ngay sau navigate đầu tiên.
- Debug locator trên UI thật trước khi commit spec.
- Headless phù hợp cho CI hoặc khi test đã ổn định.

## Wait Strategy

- Dùng auto-waiting và web-first assertions.
- Không dùng `waitForTimeout()` làm wait chính.
- Dùng condition cụ thể: visible, enabled, URL, response, toast, modal state.

## Evidence

- Bắt buộc cho MỌI case đã execute (PASS và FAIL) + MỌI step; chỉ ảnh/video (cấm `.json/.md/.log/.txt/.html/.csv/trace.zip`). Highlight đúng element, mask PII khách, đúng màn (không 404/blank/loading).
- Case phức tạp (nhiều bước, async, cross-app, iframe) → quay video.
- Screenshot/video trắng → rerun, hoặc render trang hiển thị data rồi CHỤP THÀNH ẢNH (bản `.html` không dùng làm evidence).
- Jira attachment chỉ ảnh/video; trace/log để local debug. Chi tiết: RULE_GLOBAL §"Evidence — Quy chuẩn bắt buộc".

## Test Structure

- Ưu tiên Page Object Model cho flow lặp lại.
- Page object không chứa business assertion quan trọng; assertion nằm ở test.
- Test data phải unique, traceable, cleanup được.
- Không dùng UI test để mutate dữ liệu thật nếu không rollback.

## Anti-Patterns

- Xóa assertion UI để chuyển case sang PASS.
- API-only verify cho testcase yêu cầu UI behavior mà không có review.
- Full suite mặc định khi selected testcase đủ.
