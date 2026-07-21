// Template load test k6 (Loại B) — chạy qua: npm run load -- --script tests/load/example.load.js --confirm-nonprod
// k6 là binary ngoài (không phải npm dep). Điền endpoint + ngưỡng từ NFR/SLA.
//
// AN TOÀN: giữ VU/duration KHIÊM TỐN trên UAT dùng chung (mặc định nhỏ, override có chủ đích qua --vus/--duration).
// TUYỆT ĐỐI không nhắm production. Dùng tài khoản/data test.
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.BASE_URL || 'http://localhost';

export const options = {
  vus: Number(__ENV.VUS || 5), // cap mặc định; load_check truyền --vus/--duration override
  duration: __ENV.DURATION || '30s',
  thresholds: {
    // Ngưỡng lấy từ NFR/SLA — SỬA theo spec thật (đừng bịa số).
    http_req_duration: ['p(95)<800'], // 95% request < 800ms
    http_req_failed: ['rate<0.01'], // < 1% lỗi
  },
};

export default function () {
  // SỬA endpoint theo scenario cần đo tải (read-only, non-prod).
  const res = http.get(`${BASE}/`);
  check(res, { 'status is 2xx': (r) => r.status >= 200 && r.status < 300 });
  sleep(1);
}
