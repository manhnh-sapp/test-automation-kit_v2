# Phase 1 - Bước 0: Scope Planning (OPTIONAL, Suggest-only)

> Bước tùy chọn TRƯỚC `phase1_01_prepare_context.md`. Đề xuất loại test nên chạy dựa trên context +
> change impact + lịch sử bug. **Suggest-only** — KHÔNG tự bỏ qua loại test nào, KHÔNG thay pipeline.

## Mục Đích

Giúp QA khoanh trọng tâm kiểm thử sớm (api/ui/security/regression/a11y/performance) bằng gợi ý có căn cứ,
thay vì dàn đều. Chỉ là **gợi ý ghi vào phase1-summary.md**; QA quyết định cuối, đúng cách kit đang xử lý
Coverage Gaps.

## Khi nào dùng

- Task lớn/nhiều bề mặt, muốn định hướng loại test trước khi sinh.
- Có branch/PR code liên quan (đã có `git-impact.md`) hoặc module từng nhiều bug.
- Bỏ qua bước này hoàn toàn hợp lệ — pipeline Phase 1→Phase 2 chạy như cũ.

## Inputs

| Input | Nguồn |
|---|---|
| Project context | `.agent/config/project_context.md` |
| Requirement/story | Jira, Confluence, artifact local |
| Change impact (nếu có) | `<TASK_OUTPUT_DIR>/requirements/git-impact.md` (skill `git_impact_analyzer`) |
| Risk lịch sử (nếu có) | `knowledge/bugs/` theo module (module hay bug → nghiêng regression) |

## Workflow

1. Đọc project context + requirement để hiểu scope, layer (UI/API), role, data behavior.
2. **Chấm Risk Level cho từng module/chức năng** (Risk-Based Testing) theo tiêu chí:
   - **High**: liên quan tiền/thanh toán, bảo mật/quyền, mất dữ liệu không rollback, hoặc **module có bug lịch sử** (đối chiếu `knowledge/bugs/` theo module — tần suất bug cao → nâng risk).
   - **Medium**: nghiệp vụ chính có workaround, tác động nhóm người dùng.
   - **Low**: phụ trợ/hiển thị, ít tác động.
3. **Đề xuất density test theo risk** — density chuẩn lấy từ **`depthPolicy` trong `.agent/config/risk_model.json`** (nguồn duy nhất; mặc định High minCount 10 + edge/boundary/security, Medium 5, Low 2). KHÔNG dàn đều.
   - **Chạy được (khuyến nghị):** `TASK_ENV=profiles/<TASK>/task.env npm run risk` (skill `risk_scorer`) → chấm Risk = Likelihood × Impact per module từ `knowledge/` + config, sinh `reports/risk-register.{md,json}`. Cold-start (knowledge rỗng) → band do Impact dẫn; QA **override band** (`band_override` + `override_reason`) nếu không đồng ý.
4. Nếu có `git-impact.md`: dùng bề mặt thay đổi thật để nghiêng trọng số (vd đổi endpoint → API + contract regression; đổi permission → security).
5. Đề xuất **phân bổ loại test** (api / ui / security / regression / a11y / performance) kèm lý do ngắn; loại không áp dụng ghi `N/A + lý do`.
6. Ghi vào `reports/phase1-summary.md` mục `### Scope Suggestion (Suggest-only)`:
   - Bảng `| Module/Chức năng | Risk Level | Tiêu chí (tiền/bảo mật/bug lịch sử) | Density đề xuất | Loại test trọng tâm |` (hoặc dán trực tiếp `risk-register.md`) + **Thứ tự execute** (High trước, theo `executeOrder`).
   - Đây là **gợi ý** cho QA + input cho tc_validator/`risk_gate` (soi độ sâu theo risk), KHÔNG tự skip loại test nào.

## Rules

- Suggest-only: KHÔNG tự động bỏ qua/skip loại test nào; QA xác nhận trong `phase1-summary.md`.
- Không thay thế pipeline Phase 1→Phase 2; đây là bước đầu vào tùy chọn.
- Không bịa risk khi thiếu dữ liệu — ghi rõ "chưa đủ căn cứ, đề xuất mặc định phủ đủ dimension".
- Không đổi mục 17 / Coverage Gaps; chỉ bổ sung gợi ý trọng tâm.

## Outputs

| Output | Vị trí |
|---|---|
| Scope Suggestion (Risk Level + density + loại test) | `reports/phase1-summary.md` mục `### Scope Suggestion (Suggest-only)` |
