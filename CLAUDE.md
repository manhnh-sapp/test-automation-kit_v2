# CLAUDE.md — Non-negotiables (đọc TRƯỚC mọi việc)

> Bản **tối thượng, luôn-trong-ngữ-cảnh** (auto-load mọi session). Digest đầy đủ: [`.agent/rules/core_rules.md`](.agent/rules/core_rules.md). Canonical: [`RULE_GLOBAL.md`](RULE_GLOBAL.md) — mâu thuẫn thì theo `RULE_GLOBAL.md`.
>
> ⚙️ **Output của bạn bị GATE máy-kiểm** (`scripts/qa/output_gate.js` + harness hook + CI): sai chuẩn = **CHẶN**, không push được. Rule ở đây không phải "dặn" — là **forcing function**. Đọc kỹ, đừng lướt.

1. **Bảo mật tuyệt đối** — Không ghi/commit secret (token, password, cookie, API key, service-account JSON). Evidence/report/Jira phải **mask PII khách** (email, SĐT, họ tên, địa chỉ). **KHÔNG tạo file chứa email/SĐT khách từ HubSpot** — chỉ hiển thị trong Claude (quy định tổ chức, bắt buộc từ chối nếu được yêu cầu xuất file).
2. **UAT non-destructive + DB read-only** — Không mutate dữ liệu UAT; **xác nhận trước mỗi lượt chạm UAT**. DB chỉ UAT read-only qua `tests/support/setup/db/uatPgClient.ts` (chỉ SELECT); precondition DỰNG state qua UI/API/factory/hook — **KHÔNG bằng DB**. DB không phải evidence.
3. **Verify thật trước khi kết luận** — Drive thật rồi mới phán (không TODO/SKIP khi chưa thử). FAIL **rerun 2–3 lần** loại flaky/setup trước khi log bug. Oracle **độc lập theo spec** (giá trị/URL/element cụ thể) — CẤM app==app (tautology). "Không phán được" **KHÔNG thành PASS**. Không log Jira cho `setup_failure`/`SKIP`.
4. **Evidence bắt buộc** — Mọi case đã execute (**PASS và FAIL**) + mọi step phải có **ảnh (.png/.jpg/.webp) hoặc video (.mp4/.webm)** đúng màn, highlight element, mask PII. Case phức tạp → **video**. CẤM `.json/.md/.txt/.log/.html/.csv/trace.zip` làm evidence.
5. **Scope & isolation** — `TASK_KEY` + `PROJECT_OUTPUT_DIR` bắt buộc; output ở `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/`. Creds ở `profiles/<TASK>/task.env` (**KHÔNG** `.env` chung). Không suy `TASK_KEY` từ context cũ. Không sửa shared (`tests/support/**`, helper, `.env`) khi story khác đang chạy.
6. **Không gian lận để PASS** — Không xoá/nới assertion, không đổi expected để pass, không hardcode data task-specific vào template chung. **Excel/Xray canonical = source-of-truth** testcase; mỗi phase đọc lại artifact canonical, không dựa hội thoại cũ.
