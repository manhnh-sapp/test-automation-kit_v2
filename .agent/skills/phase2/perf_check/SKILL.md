---
name: perf_check
description: Đo performance thật (web vitals + API SLA + large-dataset + resource weight) qua Playwright, so ngưỡng catalog → verdict advisory. Median N lần chống flaky. Threshold-gated, không thêm dependency.
---

# Performance Check

## Purpose

Biến mục 16 (Performance/SLA) từ "TC mô tả" thành **đo thật có verdict**: `scripts/qa/perf_check.js`
đo web vitals (TTFB/FCP/LCP/DCL/load/CLS), API response time, large-dataset render, resource weight;
so ngưỡng khai trong catalog → PASS/WARN/FAIL. Tái dùng khuôn `accessibility_check.js` (login/catalog/preSteps).

## Mức tự chủ: Threshold-gated (advisory)

- Chỉ chạy khi có catalog ngưỡng; không có ngưỡng → `N/A` (không bịa số — đúng mục 16).
- **Verdict là ADVISORY**: WARN/FAIL để điều tra, **KHÔNG tự thành product bug cứng**. UAT nhiễu nên
  mỗi metric đo **median N lần** (mặc định 3), không verdict từ 1 mẫu.

## Inputs / chạy

```
TASK_ENV=profiles/<TASK>/task.env node scripts/qa/perf_check.js --catalog <.../perf_catalog.json> [--runs 3]
node scripts/qa/perf_check.js --url <http|file> --no-login   # smoke 1 trang
node scripts/qa/perf_check.js --url <...> --no-login --deep [--cpu-throttle 4] [--net-throttle slow3g] [--heap-snapshot]
```
Catalog: block `perf` (screens + thresholds, api + threshold_ms). Schema ở `scripts/qa/README.md`.

## `--deep` — tín hiệu sâu qua CDP thô (built-in, không thêm dep)

Chạy **run RIÊNG** sau các run đo thời gian (coverage/profiler gây overhead → KHÔNG trộn vào median):

- **Coverage động JS/CSS** (`page.coverage`): `usedPct` = % code FE luồng test **chạm tới** (đo độ phủ FE thật của test); `unusedPct` = dead weight tải về không chạy → ứng viên **code-split/lazy-load**; kèm top file thừa.
- **`Performance.getMetrics`**: ScriptDuration/TaskDuration (main-thread nghẽn), LayoutDuration + LayoutCount & RecalcStyle* (layout thrash), JSHeapUsed/Total, Nodes, JSEventListeners (leak/DOM phình).
- **`Memory.getDOMCounters`**; `--heap-snapshot` → file `.heapsnapshot` (NẶNG, chỉ khi điều tra leak; mở DevTools → Memory → Load).
- **Emulation**: `--cpu-throttle <rate>`, `--net-throttle slow3g|fast3g|offline` — là **điều kiện đo**, ghi vào header report.

⚠️ Coverage JS phải tính `unused` bằng **merge range `count===0`**: V8 trả range bọc cả script với `count>0`, cộng range-chạy sẽ ra "0% thừa" (sai). Tín hiệu deep là **advisory**, không ngưỡng cứng.

## Outputs

| Output | Vị trí |
|---|---|
| Perf report | `<TASK_OUTPUT_DIR>/reports/perf-report.md` + `perf-report.json` |

## Decision Rules

- Ngưỡng lấy từ NFR/SLA/spec (khai trong catalog); thiếu → N/A, không đoán.
- PASS ≤ ngưỡng; WARN ≤ ngưỡng×1.2; FAIL > ×1.2 (advisory).
- Metric env-sensitive (LCP/CLS xấp xỉ, network variance) → luôn median + ghi điều kiện, không kết luận cứng.

## Constraints

- Không thêm dependency nặng vào script perf này: điểm **Lighthouse** → script riêng opt-in [[lighthouse_check]] (`scripts/qa/lighthouse_check.js`, qua CDP); **load nhiều VU** → [[load_check]] (k6). Cả hai skip sạch nếu chưa cài dep.
- Không tự log product bug từ perf; FAIL là tín hiệu điều tra.

## Anti-Patterns

- Verdict từ 1 lần đo (flaky) thay vì median N lần.
- Bịa ngưỡng khi spec không có.
- Coi perf FAIL trên UAT nhiễu là product bug cứng.

## Related

- `scripts/qa/accessibility_check.js` — cùng khuôn (login/catalog/report).
- [[lighthouse_check]] — điểm Lighthouse (Perf/A11y/SEO/Best-practices) qua CDP, opt-in nặng, bổ sung vitals thô ở đây.
- [[security_check]] — cặp non-functional executable.
- mục 16 `prompt_templates/phase1/02_gen_testcases.md`; large-dataset bắc cầu mục 7.
- [[learning_recorder]] — có thể ghi perf finding lặp lại theo module (chỉ khi đã confirm).
