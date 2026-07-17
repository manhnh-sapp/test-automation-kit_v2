# Prompt Phase 2 - Phân tích test flaky

> Chạy: `Đọc file này và chạy với TASK_KEY=<TASK_KEY>`. Tuân thủ `RULE_GLOBAL.md` và `.agent/rules/`.

Dùng prompt này chỉ khi testcase có dấu hiệu flaky: lúc PASS lúc FAIL, timeout không ổn định, race condition, data conflict hoặc phụ thuộc môi trường.

```text
Phân tích và giảm flaky cho Playwright test.

Input:
- Task key: [TASK_KEY]
- Project output: [PROJECT_OUTPUT_DIR]
- TC ID/spec fail: [TC_ID_OR_SPEC]
- Error context: [ERROR_CONTEXT_PATH_OR_MESSAGE]
- Số lần đã rerun: [RERUN_COUNT]

Nguyên tắc tiết kiệm token:
- Đọc đúng failure entry trong `results.json`/`execution-summary.md`.
- Mở test file quanh dòng fail và helper liên quan; không đọc full suite.
- Không paste full trace, DOM, video log hoặc console log vào chat/report.
- Chỉ dùng trace/video local để xác định timeline nếu screenshot/log chưa đủ.

Root cause cần phân loại:
1. Timing/race condition.
2. Locator không ổn định hoặc match sai element.
3. Test data conflict, thiếu cleanup hoặc phụ thuộc test trước.
4. Auth/session/env/dependency không ổn định.
5. Mock/stub làm sai mục tiêu kiểm thử.
6. Product behavior thật sự không ổn định.

Quy tắc sửa:
- Sửa root cause trước: wait condition, locator, setup/cleanup, fixture, retry ở API phụ trợ nếu hợp lý.
- Không dùng `waitForTimeout()` làm giải pháp chính.
- Không xóa assertion hoặc đổi expected result để giảm flaky.
- Nếu phải retry, retry chỉ dùng để chống nhiễu dependency ngoài scope và phải ghi rõ lý do.

Verify:
- Rerun targeted testcase tối thiểu 3 lần sau khi fix flaky nếu chi phí thấp.
- Full suite chỉ chạy khi sửa shared helper/auth/setup.

Output local:
- Ghi `<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/reports/flaky-triage.md` hoặc report rerun tương ứng.
- Report gồm: TC ID, pattern fail/pass, root cause, fix đã làm, số vòng rerun, kết quả, residual risk.

Output cho user:
- Tối đa 8 bullet: root cause, file sửa, test đã rerun, kết quả, blocker/risk nếu còn.
```
