---
name: load_check
description: Chạy load/stress/soak (Loại B, nhiều VU) qua k6 — wrapper mỏng, parse summary → report. k6 là binary NGOÀI (không phải npm dep). Never-auto, chỉ non-prod, cap khiêm tốn. Loại A single-user dùng perf_check.
---

# Load Check (Loại B — load/stress/soak qua k6)

## Purpose

Đo **load thật nhiều VU** (throughput, điểm gãy, soak) — thứ Playwright KHÔNG làm được (lái browser thật, quá nặng để giả nghìn VU). `scripts/qa/load_check.js` là **wrapper mỏng** cho k6: chạy k6 → parse summary JSON → `reports/load-report.{md,json}` → dashboard.

**Phân biệt:** Loại A (single-user: response time/vitals/render/resource so ngưỡng) đã do **`perf_check.js`** phủ trong kit. Loại B (nhiều VU) mới cần tool ngoài — đây.

## k6 là binary NGOÀI (không phải dependency)

Không `npm install k6`. Cài: `choco install k6` / `brew install k6` / apt (xk6) / hoặc `--docker` (image `grafana/k6`). **Thiếu k6 → script SKIP sạch** (không FAIL, in hướng dẫn cài) → giữ Node-thuần: k6 opt-in, KHÔNG vào `package.json` deps.

## Mức tự chủ: Never-auto + AN TOÀN NẶNG

Load test tạo **tải thật** → có thể **làm nghẽn/sập chính UAT** (hoặc thảm hoạ: nhắm nhầm prod). Vì vậy:
- **Chỉ chạy khi user yêu cầu** + `--confirm-nonprod` (hoặc `LOAD_CHECK_CONFIRM=1`). Không có → từ chối.
- **CHẶN prod**: target trông giống production → từ chối (không cờ nào mở prod).
- **Cap khiêm tốn mặc định** (`--vus 5 --duration 30s`); tăng có chủ đích. **Đừng chạy tải lớn trên UAT dùng chung** khi người khác đang test (phối hợp trước).
- Dùng tài khoản/data test, endpoint non-prod.

## Inputs / chạy

```
TASK_ENV=profiles/<TASK>/task.env node scripts/qa/load_check.js --script tests/load/example.load.js --confirm-nonprod
  [--base <url>] [--vus 5] [--duration 30s] [--docker] [--enforce] [--out <dir>]
```
- k6 script: template `tests/load/example.load.js` — điền endpoint + **`thresholds` từ NFR/SLA** (k6 native → verdict). Giữ VU/duration modest.
- `--enforce`: exit≠0 khi threshold breach (cho CI). Mặc định report + exit 0.

## Outputs

| Output | Vị trí |
|---|---|
| Load report | `<TASK_OUTPUT_DIR>/reports/load-report.md` + `load-report.json` (+ `k6-summary.json`) |

## Decision Rules

- Ngưỡng lấy từ NFR/SLA khai trong k6 `thresholds` (đừng bịa số). Không có threshold → report metric, không verdict.
- Verdict PASS/FAIL = k6 threshold ok flags.
- Không chạy nếu chưa `--confirm-nonprod`; không chạy trên prod.

## Constraints

- k6 KHÔNG vào `package.json` deps (binary ngoài); thiếu → skip sạch.
- Không nhét k6 vào runner Playwright (`tests/load/` bị testIgnore trong playwright.config).
- Không chạy tải lớn không kiểm soát trên môi trường dùng chung.
- Không nhắm production trong mọi trường hợp.

## Anti-Patterns

- Dùng Playwright/Katalon để giả lập nghìn VU (sai công cụ — Katalon là functional UI/API, không phải load).
- Chạy load mặc định/auto trong pipeline mà không xác nhận non-prod.
- VU/duration lớn trên UAT dùng chung không phối hợp → tự DoS.
- Bịa ngưỡng thay vì lấy từ NFR.

## Related

- [[perf_check]] — Loại A single-user (trong kit, Playwright). load_check là Loại B (tool ngoài).
- mục 16 `prompt_templates/phase1/02_gen_testcases.md` (load = opt-in tool ngoài).
- JMeter là lựa chọn thay thế nếu team đã chuẩn hoá; k6 hợp kit JS/CLI/CI hơn. Katalon KHÔNG phải load tool.
