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
2. Nếu có `git-impact.md`: dùng bề mặt thay đổi thật để nghiêng trọng số (vd đổi endpoint → API + contract regression; đổi permission → security).
3. Nếu có `knowledge/bugs/` cho module trong scope: coi là risk hint (module từng nhiều bug → đề xuất regression smoke đậm hơn) — Suggest-only, KHÔNG tự nâng priority.
4. Đề xuất **phân bổ loại test** (api / ui / security / regression / a11y / performance) kèm lý do ngắn cho mỗi loại; loại không áp dụng ghi `N/A + lý do`.
5. Ghi đề xuất vào `reports/phase1-summary.md` mục `### Scope Suggestion (Suggest-only)`.

## Rules

- Suggest-only: KHÔNG tự động bỏ qua/skip loại test nào; QA xác nhận trong `phase1-summary.md`.
- Không thay thế pipeline Phase 1→Phase 2; đây là bước đầu vào tùy chọn.
- Không bịa risk khi thiếu dữ liệu — ghi rõ "chưa đủ căn cứ, đề xuất mặc định phủ đủ dimension".
- Không đổi mục 17 / Coverage Gaps; chỉ bổ sung gợi ý trọng tâm.

## Outputs

| Output | Vị trí |
|---|---|
| Scope Suggestion (loại test + lý do) | `reports/phase1-summary.md` mục `### Scope Suggestion (Suggest-only)` |
