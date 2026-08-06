# Test Reliability Index (TRI) — F10

> 2026-08-06 04:43:50 · 21 test · quarantine 0 · minRuns=3 flakyTh=0.1
> TRI (Clean Reliability) = pass sạch/tổng · Eventual = (clean+flaky)/tổng · Flaky = flaky/tổng.
> Rank theo TRI: S≥0.99 A≥0.97 B≥0.90 C≥0.75 D<0.75 (NEW = chưa đủ run).

| Test | Runs | TRI(clean) | Eventual | Flaky | Rank | Quarantine |
|---|---|---|---|---|---|---|
| GET /product-orders trả 2xx + JSON list (BE health, non-destructive) | 2 | 0 | 0 | 0 | NEW |  |
| Total Amount Due = Net − Paid + Payback (bất biến, non-destructive) | 2 | 0 | 0 | 0 | NEW |  |
| Transaction list load được, grid render, không 5xx (read-only) | 2 | 0 | 0 | 0 | NEW |  |
| check connect DB2 + DB3 + snapshot | 1 | 0 | 0 | 0 | NEW |  |
| verify SAPP-14127 DB2(before) → DB3(after) | 1 | 0 | 0 | 0 | NEW |  |
| OPS_SCHED_TC_008 [Boundary] OPS - Add Lesson - Tick 1 phần Activity trong Unit → Unit KHÔNG thành full | 1 | 0 | 0 | 0 | NEW |  |
| OPS_SCHED_TC_010 [Edge] OPS - Add Lesson - Bỏ tick 1 Activity khi Unit đang full-checked → Unit rời đầy | 1 | 0 | 0 | 0 | NEW |  |
| OPS_SCHED_TC_028 [Positive] OPS - Cancel Lesson (Offline/Live) - Hủy buổi → Activity được giải phóng | 1 | 0 | 0 | 0 | NEW |  |
| OPS_SCHED_TC_036 [Negative] API - POST lesson - Gửi activityId đã gán ở lesson khác → BE chặn double-assign | 1 | 0 | 0 | 0 | NEW |  |
| OPS_LS_ACT_TC_019 Cancel form New Lesson khong hien popup xac nhan huy | 1 | 0 | 0 | 0 | NEW |  |
| OPS_PAY_TC_048 — Cổng ghi nhận tiền trả 00 Success nhưng không ghi nhận doanh thu | 1 | 0 | 0 | 0 | NEW |  |
| OPS_PAY_TC_485 — Endpoint giao dịch thiếu kiểm soát quyền và trạng thái (vai trò hạn chế xóa được giao dịch đã xác nhận) | 1 | 0 | 0 | 0 | NEW |  |
| OPS_PAY_TC_498 — Tạo giao dịch nhận status PAID từ client (bỏ qua bước xác nhận, ghi nhận doanh thu giả) | 1 | 0 | 0 | 0 | NEW |  |
| OPS_PAY_TC_113 — Tạo Service Fee Order trả HTTP 500 với mọi input hợp lệ (chặn toàn bộ cụm SF Order) | 1 | 0 | 0 | 0 | NEW |  |
| OPS_PAY_TC_148 — Build lệch Figma: thiếu bộ lọc Synchronized status, sai nhãn lọc Promotion, thiếu nhất quán ngôn ngữ hộp thoại xóa | 1 | 0 | 0 | 0 | NEW |  |
| login+cache rồi reuse (không login lại); EvidenceRecorder highlight capture | 1 | 0 | 0 | 0 | NEW |  |
| login LMS (Keycloak) → token tươi (capture) + brokerRequest API thật 2xx | 1 | 0 | 0 | 0 | NEW |  |
| Orders list load được, grid render, không 5xx (read-only) | 1 | 0 | 0 | 0 | NEW |  |
| touch target đủ lớn + tap mở hamburger | 2 | 0 | 0 | 0 | NEW |  |
| offline giữa chừng → báo lỗi, không crash | 2 | 0 | 0 | 0 | NEW |  |
| BUOC-1 BISECT — tu tay tick roi Resume | 1 | 1 | 1 | 0 | NEW |  |