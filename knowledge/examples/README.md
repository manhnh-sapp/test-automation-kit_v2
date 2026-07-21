# knowledge/examples — dữ liệu mẫu (KHÔNG phải learning data thật)

Đây là bộ mẫu minh hoạ **hình dạng** entry theo `knowledge/SCHEMA.md`, backfill từ task thật SAPP-26276
(3 bug đã qua Jira gate + root cause + snapshot). Dùng để:

- Hiểu cấu trúc `bugs/` / `root_causes/` / `historical_execution/` / `index.json`.
- **Xem trước Dashboard có dữ liệu**: copy nội dung `examples/*` vào các thư mục tương ứng trong `knowledge/`
  rồi chạy `npm run dashboard`.

**Không** phải bộ nhớ học của dự án bạn. `knowledge/` (live) khởi tạo rỗng; `learning_recorder` sẽ điền
dần khi chạy task thật. Khi dùng kit cho dự án mới, cứ để `knowledge/` rỗng và bỏ qua thư mục này.
