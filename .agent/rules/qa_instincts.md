# QA Instincts — Nhạy bén & Phản xạ điều tra khi Execute (Phase 2)

Reference dạy agent cách một QA giỏi "ngửi" ra vấn đề và điều tra trong lúc chạy test, thay vì tin vào bề mặt. Đọc kèm `prompt_templates/phase2/04_execute_fe_playwright.md` (section "Quan sát sâu") và `prompt_templates/phase2/05_execute_api_playwright.md`. Mọi ràng buộc trong `RULE_GLOBAL.md` và `.agent/rules/*.md` vẫn áp dụng.

## Tư duy nền tảng: KHÔNG tin bề mặt

Mỗi khi thấy tín hiệu "là lạ" — field trống, số 0, "thành công" nhưng không đổi, tải mãi không xong — KHÔNG kết luận ngay. Câu hỏi đầu tiên luôn là: **"Cái này ĐÚNG hay SAI? Làm sao biết chắc?"** rồi mới đi xác minh.

Hai phản xạ cốt lõi, lặp lại cho mọi bất thường:

1. **Khoanh vùng tầng lỗi (layer isolation).** Một hiện tượng ở UI có thể bắt nguồn từ bất kỳ tầng nào: UI (render/binding) ↔ API (backend/contract) ↔ dữ liệu ↔ network ↔ cache/state. Phải chỉ ra tầng nào hỏng — vì kết luận và cách báo lỗi hoàn toàn khác nhau (FE bug vs BE bug vs setup vs env vs đúng-không-lỗi).
2. **Đối chiếu nguồn sự thật (source of truth).** UI chỉ là hiển thị. Nguồn sự thật của dữ liệu là **response API** (+ tài liệu spec cho oracle logic/display), KHÔNG phải cái mắt thấy trên màn hình. Khi API/UI không đủ để khoanh tầng, được dùng thêm **read-only UAT DB** qua guarded client `tests/support/setup/db/uatPgClient.ts` (read-only: chỉ SELECT) làm oracle PHỤ để chẩn đoán (vd "field trống do FE hay BE?", "dữ liệu có persist không?"). Kết quả DB KHÔNG phải evidence Jira và KHÔNG thay oracle từ spec (tránh tautological build==DB cùng nguồn BE); PII đọc ra phải mask.

## Bộ công cụ điều tra tiêu chuẩn (Playwright/Playwright MCP)

- **Console**: lỗi JS/runtime — `page.on('console')`, `page.on('pageerror')`; MCP → DevTools Console.
- **Network**: request/response, status, timing, payload — `page.on('response')`, `page.waitForResponse(/<ep>/)`, `response.json()`; MCP → tab Network → chọn request → **Preview/Response**. Đọc cả **Request Payload** (cái thực sự gửi lên).
- **Application/Storage**: cache, cookie, localStorage, service worker (khi nghi cache/state cũ).
- **Reload & hard-reload**: phân biệt state cũ vs data thật.
- **Đổi account/role, đổi dữ liệu**: phân biệt bug logic vs data-specific vs quyền.
- **Chụp bằng chứng NGAY**: trạng thái Network/Console mất khi reload — lưu screenshot response (đã redact) / HAR local trước khi thao tác tiếp.

## Cây quyết định mẫu — "Field trống" (nguyên mẫu)

Thấy field/khu vực trống (hoặc `null`, `-`, `N/A`, `0`):

1. **Field này CÓ NÊN trống không?** Đối chiếu **Dữ liệu Test/expected của testcase** (phải biết trước data test kỳ vọng field có gì). Đáng ra trống → không phải lỗi (PASS). Đáng ra có dữ liệu → nghi ngờ, sang bước 2.
2. **Mở Network, tìm request nạp dữ liệu cho khu vực đó, xem Preview/Response:**
   - **Không thấy request nào** → FE không gọi API (chặn ở validation FE, JS error, điều kiện render sai). Kiểm Console. → **Lỗi FE** (hoặc luồng chưa kích hoạt).
   - **Có request, status lỗi** → phân theo status: `401/403` = auth/quyền (thường `BLOCKED` do token/role test), `404` = sai endpoint/không tồn tại, `5xx` = **lỗi backend (FAIL)**. Đọc body lấy message.
   - **Có request, 200, body CÓ chứa dữ liệu của field** → backend trả đúng nhưng UI không hiện → **FAIL (FE)**: render/binding/mapping sai tên field.
   - **Có request, 200, nhưng body KHÔNG có field / để null trái spec** → **FAIL (BE/contract)**: backend không trả dữ liệu.
3. **Chốt & ghi bằng chứng**: request + response (mask secret/PII), screenshot, kết luận rõ tầng lỗi. Báo cáo hữu ích không chỉ nói "field trống" mà nói *"API trả 200 có `customer.name` nhưng UI không render → lỗi FE"*.

**Payoff:** cùng hiện tượng "field trống" có thể ra **PASS** (đúng là trống), **FAIL-FE**, **FAIL-BE**, hoặc **BLOCKED-auth** — vài giây điều tra phân biệt được, và nó quyết định báo cáo đúng hay sai.

## Danh mục tín hiệu → nghi ngờ → kiểm tra → kết luận

Đọc theo mẫu: **Thấy gì → Nghi gì → Kiểm tra thế nào → Phân loại**.

### Nhóm 1 — Hiển thị & dữ liệu
- **Field/ô trống, null, "-"**: xem cây quyết định trên.
- **Count = 0 / danh sách rỗng**: nghi filter/phân trang/timezone che mất, không phải rỗng thật. → Kiểm query params trong Network (filter, page, date range), thử bỏ filter. → 0 thật (PASS) vs bị lọc nhầm (FAIL/lỗi filter).
- **Dữ liệu cũ, không cập nhật sau thao tác**: nghi cache (browser/CDN/service worker) hoặc UI giữ state cũ. → Hard-reload; Network request mới có trả data mới không; Application → cache/service worker. → API mới đúng nhưng FE không refresh (FE) vs backend chưa cập nhật (BE).
- **Ngày/giờ/tiền/số sai định dạng**: nghi timezone/locale/đơn vị. → So API raw vs UI. → raw đúng, UI sai → FE format; raw đã sai → BE.
- **Chữ lỗi font/ký tự lạ (mojibake)**: nghi encoding (UTF-8/charset) hoặc data test. → Response header `content-type`/charset, xem raw body.
- **Ảnh/asset vỡ, không tải**: → Network xem status file ảnh (404? 403? CDN?).
- **Bản ghi trùng/thiếu**: nghi phân trang, dedup, race. → So tổng số vs số hiển thị, xem nhiều trang.

### Nhóm 2 — Trạng thái & hành vi
- **"Thành công" nhưng dữ liệu KHÔNG đổi (cạm bẫy kinh điển)**: thông báo thành công ≠ đã lưu. Nghi optimistic UI, hoặc API thật ra lỗi. → Network: request 200 thật không, body ra sao; reload để xem có persist không. → Không persist = **FAIL dù UI báo xanh**.
- **Nút bấm không phản ứng**: → Console có JS error? Network có request đi không? Nút disabled do validation? → FE lỗi vs chưa đủ điều kiện.
- **Thao tác im lặng không hoàn tất (silent failure)**: → Console + Network bắt lỗi ẩn; đừng cho qua chỉ vì "không thấy báo đỏ".
- **Redirect/đăng xuất bất thường**: nghi session hết hạn, 302, token refresh fail. → Network xem chuỗi redirect + status.
- **Form gửi "được" nhưng sai**: → Network → Request Payload: so cái thực sự gửi lên với cái đã nhập (mapping field, trim, encode).

### Nhóm 3 — Mạng & API (khoanh tầng)
- **Status 200 nhưng vẫn sai**: đừng tin mỗi status code. Đọc body: có `errors`, `success:false`, hay `data` rỗng không? (**GraphQL gần như luôn 200 kể cả khi lỗi** — phải đọc `errors`). → Kết luận theo body, không theo status.
- **4xx/5xx**: `400/422` = input test (nghi test data/kỳ vọng), `401/403` = auth (thường `BLOCKED`), `404` = endpoint/không tồn tại, `5xx` = backend FAIL. Luôn đọc response message.
- **Không thấy request trong Network**: lỗi trước khi gọi API (validation FE, JS error). → Console.
- **Request trùng/bão request**: nghi double-submit, retry loop, effect lặp. → Đếm số request; kết luận rủi ro FE.
- **Latency cao/timeout**: → Timing breakdown (TTFB); mạng chậm (hạ tầng) vs server xử lý chậm (có thể bug hiệu năng).
- **CORS / bị chặn / mixed content**: → Console báo rõ; request đỏ trong Network. → Thường là cấu hình môi trường (`BLOCKED`) hoặc bug.

### Nhóm 4 — Dữ liệu & môi trường
- **Kết quả khác nhau giữa 2 lần / 2 máy / 2 account**: nghi data test khác, quyền khác, state rò rỉ. → Cố định data/account rồi thử lại; vẫn đổi → nghi **FLAKY** (theo flaky policy: `.agent/skills/phase2/flaky_test_analyzer`, `prompt_templates/phase2/07_triage_flaky.md`).
- **Chỉ sai với một số bản ghi**: nghi data edge (null, ký tự đặc biệt, số âm, chuỗi dài, emoji). → Tìm đặc điểm chung của bản ghi lỗi.
- **Sai khi có người khác cũng đang test**: nghi shared env, data bị đè. → Ghi nhận rủi ro môi trường.
- **"Local ok, staging fail"**: nghi khác config/env/version/data. → Đối chiếu version + biến môi trường; thường lộ bug thật.

## Nguyên tắc nhạy bén cần luôn giữ

- **"Xanh" chưa chắc đúng, "trống/lỗi" chưa chắc là bug.** Cả hai chiều đều phải xác minh — tránh **false pass** và **false fail**.
- **Phân biệt được 3 thứ**: empty hợp lệ (đúng data test) vs empty do FE vs empty do BE/auth. Muốn vậy phải biết trước data test kỳ vọng field có gì.
- **API response là "chân lý" cho data.** API trả đúng mà UI sai → chắc chắn FE; đừng đổ oan backend (và ngược lại).
- **Chụp bằng chứng NGAY khi thấy.** Network/Console mất khi reload — lưu screenshot response/HAR local trước khi thao tác tiếp.
- **Reproduce trước khi phán.** Một lần thấy lạ chưa đủ; lặp lại để phân biệt bug ổn định vs flaky (rerun 2-3 lần theo prompt execute).
- **Nghi ngờ để khoanh vùng, KHÔNG che/ép qua.** Được phép auto-heal nguyên nhân *không phải product bug* (locator/timing/setup/data/auth/mock) rồi rerun. TUYỆT ĐỐI KHÔNG: sửa expected để pass, xóa assertion, mock logic đang test, ép tay cho "xanh", hay dùng DB để DỰNG/sửa state hoặc thay test thật (read-only verify UAT qua guarded client `db/uatPgClient.ts` thì được — nhưng chỉ để chẩn đoán, KHÔNG phải evidence và KHÔNG thay assertion thật). Kết quả điều tra đi vào **báo cáo + phân loại tầng lỗi**, không đi vào việc vá sản phẩm.

## Bằng chứng & báo cáo (đồng bộ RULE_GLOBAL)

- Kết luận phải nêu **tầng lỗi** (FE / BE / setup / env / auth / đúng-không-lỗi), không dừng ở mô tả bề mặt.
- Evidence Jira vẫn CHỈ là ảnh/video: cần chứng minh data BE → render **visual evidence page** hiển thị response đã redact rồi screenshot; KHÔNG đính JSON/HAR/log thô lên Jira (chúng chỉ là diagnostic local). Mask PII khách + redact token/secret.
- `Actual Result` ghi rõ: hiện tượng, request/response quan sát (đã redact), tầng lỗi kết luận, evidence path.

## Danh mục mở rộng (tra khi gặp tình huống cụ thể)

Áp cùng khung "thấy → nghi → kiểm tra → phân loại tầng" cho các nhóm sau: nhập liệu & biên; session/điều hướng; đồng thời & tương tác nhanh (double-submit, race); quyền/**IDOR** (đổi id sang resource user khác); nhất quán chéo (cùng data ở nhiều màn/endpoint phải khớp); vòng đời CRUD (delta trước/sau); xử lý lỗi (message đúng, không nuốt lỗi thành 200 rỗng); tín hiệu bảo mật (lộ field nhạy cảm, token trên URL, mass-assignment); tích hợp/config; log & observability; visual/UX; hồi quy lân cận. Chi tiết logic/data/security các nhóm này: mục 13–16 của `prompt_templates/phase1/02_gen_testcases.md`.
