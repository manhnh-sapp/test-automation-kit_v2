---
name: lighthouse_check
description: Điểm Lighthouse thật (Performance/Accessibility/SEO/Best-practices) chạy qua CDP bằng playwright-lighthouse; verdict advisory theo dải điểm chuẩn. Opt-in nặng (skip nếu chưa cài), never-auto + non-prod, evidence PNG bảng điểm.
---

# Lighthouse Check

## Purpose

Bổ sung điểm **Lighthouse** (4 nhóm: Performance / Accessibility / SEO / Best-practices) mà `perf_check`
(vitals thô) không có. `scripts/qa/lighthouse_check.js` launch Chromium với `--remote-debugging-port`, dùng
`playwright-lighthouse` (`playAudit`) audit trang qua **CDP**, lấy điểm 4 nhóm → verdict advisory.

## Mức tự chủ: Opt-in nặng, never-auto, advisory

- **Opt-in dependency**: `playwright-lighthouse` + `lighthouse` KHÔNG phải core dep. Thiếu → **BỎ QUA sạch (exit 0)**,
  không fail (giống k6 ở `load_check`). Cài: `npm i -D playwright-lighthouse lighthouse`.
- **never-auto + non-prod**: cần `--confirm-nonprod` (hoặc `LH_CHECK_CONFIRM=1`); chặn target giống prod.
- **Verdict ADVISORY** theo **dải điểm chuẩn Lighthouse**: `≥90` PASS (xanh) · `50–89` WARN (cam) · `<50` FAIL (đỏ).
  KHÔNG tự thành product bug. Ngưỡng PASS per nhóm có thể override qua catalog; không bịa SLA.

## Inputs / chạy

```
TASK_ENV=profiles/<TASK>/task.env node scripts/qa/lighthouse_check.js --catalog <.../lighthouse_catalog.json> --confirm-nonprod
node scripts/qa/lighthouse_check.js --url https://uat-... --no-login --confirm-nonprod   # smoke 1 trang public
[--port 9222] [--form-factor desktop|mobile] [--out <dir>] [--enforce]
```

Catalog block `lighthouse` (schema đầy đủ ở `scripts/qa/README.md`):
```json
{ "lighthouse": {
  "login": { "baseUrlEnv": "OPS_BASE_URL", "loginPath": "/auth/login", "userEnv": "OPS_USERNAME", "passEnv": "OPS_PASSWORD" },
  "formFactor": "desktop",
  "thresholds": { "performance": 50, "accessibility": 90, "seo": 90, "best-practices": 90 },
  "screens": [ { "name": "OPS Class List", "url": "/classes", "thresholds": { "performance": 40 } } ]
} }
```

## Outputs

| Output | Vị trí |
|---|---|
| Lighthouse report | `<TASK_OUTPUT_DIR>/reports/lighthouse-report.md` + `lighthouse-report.json` |
| Evidence PNG (bảng điểm 4 nhóm) | `<TASK_OUTPUT_DIR>/reports/lighthouse-scores.png` |
| Report Lighthouse gốc | `<...>/reports/lighthouse-<screen>.html` + `.json` |

## Decision Rules

- PASS `≥` ngưỡng nhóm (mặc định 90); WARN `50–89`; FAIL `<50` (advisory).
- Performance trên UAT rất nhiễu → coi là tín hiệu điều tra, KHÔNG log product bug từ điểm perf.
- Không có catalog/ngưỡng → dùng dải điểm chuẩn Lighthouse (không bịa SLA).

## Constraints

- **Auth localStorage-token (vd OPS)**: Lighthouse điều hướng lại có thể mất localStorage → trang cần login mà rớt
  auth thì điểm phản ánh trang `/login`. Ưu tiên audit trang public, hoặc app auth bằng cookie/SSO.
- Read-only (chỉ navigate + audit) nhưng nặng → chỉ chạy non-prod, không nhét vào runner Playwright mặc định.
- Evidence chỉ ảnh/video: dùng `lighthouse-scores.png` (không đính report `.html/.json` làm evidence Jira).

## Anti-Patterns

- Coi Performance FAIL trên UAT nhiễu là product bug cứng.
- Bịa ngưỡng khi spec không có (dùng dải chuẩn Lighthouse thay vì).
- Audit trang cần login rồi báo điểm thấp trong khi thực chất đang ở trang `/login`.

## Related

- [[perf_check]] — vitals thô (không cần dep); Lighthouse là bản "điểm số" opt-in nặng, bổ sung.
- [[accessibility_check]] — a11y sâu bằng axe-core (rule-level); Lighthouse a11y là điểm tổng quan.
- [[load_check]] — cùng kiểu opt-in tool ngoài (skip nếu thiếu).
- mục 16 `prompt_templates/phase1/02_gen_testcases.md`.
