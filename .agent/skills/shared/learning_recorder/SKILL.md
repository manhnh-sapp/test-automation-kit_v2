---
name: learning-recorder
description: Ghi fact đã qua gate (bug đã confirm, root cause, snapshot pass/fail) vào knowledge/ để tái dùng xuyên task. Suggest-only — chỉ lưu dữ liệu, không tự kết luận risk/PASS-FAIL.
---

# Learning Recorder

## Purpose

Duy trì bộ nhớ học của kit tại `knowledge/` (xem `knowledge/SCHEMA.md`): ghi lại bug đã xác nhận
là product issue, root cause đã tìm ra, và snapshot pass/fail theo module — để lần sau tra cứu
theo module/tag mà không phải suy lại từ đầu. Nguồn học cho Git Impact Analyzer (risk theo module)
và Dashboard (Giai đoạn 2).

## Mức tự chủ: Suggest-only

- Chỉ **ghi dữ liệu đã qua gate**. KHÔNG tự suy ra kết luận risk, KHÔNG đổi scope, KHÔNG tác động
  quyết định PASS/FAIL của workflow gọi nó.
- Entry là dữ liệu tham chiếu; QA/agent đọc và tự quyết định có dùng hay không.
- Nếu thiếu thông tin để ghi đúng schema → ghi phần chắc chắn, để trống field optional, KHÔNG bịa.

## Điều kiện ghi (BẮT BUỘC)

Chỉ ghi entry khi tất cả đúng:

1. **Bug đã qua Jira gate** ở `.agent/workflows/phase2_04_report_and_jira_gate.md` (đã loại
   flaky/setup/data/prompt) — tức đã xác nhận là product bug thật, có evidence.
2. `confirmed_via_gate = true`. Bug fail do setup/flaky/prompt (`BLOCKED_SETUP`/`SKIP_SETUP`/
   `setup_failure`) **KHÔNG** được ghi — chúng không phải product bug.
3. Không chứa secret / PII khách hàng (email, số điện thoại, credential, connection string).

## Responsibilities

| Trách nhiệm | Yêu cầu |
|---|---|
| Ghi bug entry | Với mỗi bug đã qua gate, tạo `knowledge/bugs/<TASK_KEY>__<slug>.json` theo schema. |
| Ghi/nối root cause | Nếu đã xác định root cause, tạo/cập nhật `knowledge/root_causes/<slug>.json`; link 2 chiều `root_cause_ref` ↔ `related_bugs`. |
| Snapshot execution | Ghi `knowledge/historical_execution/<TASK_KEY>__<date>.json` từ execution summary (per-module pass/fail + unassisted pass rate). |
| Cập nhật index | Thêm/cập nhật `entries` trong `knowledge/index.json` + `updated_at` cho mọi file vừa ghi. |
| Đồng bộ trạng thái | Khi rerun chuyển bug → Done: cập nhật `jira_status` của bug + `status`/`resolved_at` của root cause. |

## Inputs

| Input | Nguồn |
|---|---|
| Bug đã qua gate | `<TASK_OUTPUT_DIR>/reports/execution-summary.md` (sau Jira gate) |
| Root cause | Kết luận trong execution summary / rerun report |
| Số liệu execute | `execution-summary.md` (tổng/PASS/FAIL/SKIP theo module, unassisted pass rate) |
| TASK_KEY, ngày | Context task hiện tại (ISO date) |

## Outputs

| Output | Vị trí |
|---|---|
| Bug entry | `knowledge/bugs/<TASK_KEY>__<slug>.json` |
| Root cause entry | `knowledge/root_causes/<slug>.json` |
| Execution snapshot | `knowledge/historical_execution/<TASK_KEY>__<YYYY-MM-DD>.json` |
| Index cập nhật | `knowledge/index.json` |

## Decision Rules

- `<slug>` cho bug = kebab từ mô tả ngắn; `<slug>` root cause = `<module-lowercase>-<mô-tả-kebab>`.
- Trùng bug (cùng `id`/`task_key`) → cập nhật file cũ thay vì tạo trùng.
- Root cause dùng chung nhiều bug → 1 file root cause, `related_bugs` gộp nhiều id.
- `detected_phase` ghi đúng nơi phát hiện (`phase1`/`phase2`/`rerun`).
- Ghi date bằng ISO `YYYY-MM-DD` theo ngày chạy thực tế.

## Constraints

- Không ghi bug chưa qua gate (flaky/setup/data/prompt) → tránh nhiễu dữ liệu học.
- Không ghi secret/PII/credential/connection string vào bất kỳ entry nào.
- Không tự kết luận risk hay đổi scope dựa trên dữ liệu đã ghi (đó là việc của skill đọc, Suggest-only).
- Không tạo cấu trúc report mới; chỉ ghi vào `knowledge/` theo `SCHEMA.md`.
- Không đụng `locators/` ở Giai đoạn 1 (Locator Healing Agent — Giai đoạn 2 mới ghi).

## Anti-Patterns

- Ghi mọi fail (kể cả setup/flaky) vào `bugs/` → làm bẩn learning data.
- Lưu triệu chứng thay vì root cause trong `root_causes/`.
- Tạo entry trùng thay vì cập nhật entry cũ.
- Copy nguyên execution summary (kèm data nhạy cảm) vào entry thay vì trích field theo schema.

## Related

- [[precondition_setup_planner]] — phân loại `BLOCKED_SETUP`/`SKIP_SETUP`; recorder KHÔNG ghi các nhãn này thành bug.
- Neo workflow: `.agent/workflows/phase2_04_report_and_jira_gate.md` (ghi entry sau gate),
  `.agent/workflows/rerun_03_update_jira_and_report.md` (đồng bộ trạng thái khi Done).
- Consumer: `git_impact_analyzer` (risk theo module), Dashboard (Giai đoạn 2).
