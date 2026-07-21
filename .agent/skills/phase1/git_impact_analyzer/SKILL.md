---
name: git-impact-analyzer
description: Đọc git diff của branch/PR gắn TASK_KEY, liệt kê file/module thay đổi và phân loại vào 7 bề mặt dùng chung của mục 17 — cấp dữ liệu diff thật làm input cho Bước 1 mục 17 thay vì đọc code đoán. Suggest-only.
---

# Git Impact Analyzer

## Purpose

Biến thay đổi code thật (git diff) thành danh sách **bề mặt dùng chung bị đụng** — input trực tiếp
cho **Bước 1 của mục 17 (Change Impact / Regression Ripple)** trong
`prompt_templates/phase1/02_gen_testcases.md`. Giúp agent không phải đọc toàn bộ code để đoán bề mặt
chung; thay vào đó bắt đầu từ diff thực tế rồi mới suy feature bị ảnh hưởng.

Bổ trợ cho `requirements_analyzer` (nhận diện impact từ requirement/artifact) bằng góc nhìn từ **code
đã đổi**.

## Mức tự chủ: Suggest-only

- Chỉ **liệt kê + phân loại + gợi ý** feature nghi ảnh hưởng. KHÔNG tự thêm/bớt testcase, KHÔNG tự
  quyết regression scope.
- Feature nghi ảnh hưởng mà không tự xác minh được → giữ nguyên câu `Nghi ảnh hưởng — QA confirm`,
  đúng tinh thần mục 17 hiện tại. KHÔNG bịa impact, KHÔNG im lặng bỏ qua.

## Inputs

| Input | Nguồn / mặc định |
|---|---|
| TASK_KEY | Context task |
| Branch/PR của task | Branch hiện tại, hoặc nhánh feature gắn TASK_KEY |
| Base ref | **Mặc định `main`** (so `git diff main..<branch>`); đổi nếu project dùng base khác |
| Project context | `.agent/config/project_context.md` (map path → module) |
| Learning data (optional) | `knowledge/bugs/` theo module — gợi ý module từng hay bug (risk hint) |

## Workflow

1. Lấy diff: `git diff --name-status <base>..<branch>` (mặc định `<base>=main`). Nếu không xác định
   được branch/PR → ghi `N/A: no diff available` và dừng (không bịa thay đổi).
2. Map mỗi file thay đổi → module nghiệp vụ (theo path convention + `project_context.md`).
3. Phân loại mỗi thay đổi vào **7 bề mặt dùng chung** của mục 17:
   - Data/entity/field chung (thêm field, đổi kiểu/default, migration).
   - Endpoint/API chung (đổi payload/response/status code).
   - Component/validation/business rule/util dùng lại.
   - Status/enum chung.
   - Calculation/aggregate/report chung nguồn.
   - Permission/role/guard chung.
   - Job/trigger/event/queue/cron chung.
4. Suy feature KHÁC phụ thuộc bề mặt đó (từ code/testcase cũ/coverage map). Cái không suy được →
   flag `Nghi ảnh hưởng — QA confirm`.
5. (Optional) Đối chiếu `knowledge/bugs/` theo module: nếu module đụng tới từng có bug lịch sử, ghi
   chú làm risk hint (Suggest-only — không tự nâng priority).
6. Ghi output `git-impact.md`; nếu diff không đụng bề mặt chung nào → ghi `N/A: no shared surface`.

## Outputs

| Output | Vị trí |
|---|---|
| Bảng Change Impact từ diff | `<TASK_OUTPUT_DIR>/requirements/git-impact.md` |

Format bảng:

```markdown
| File thay đổi | Module | Bề mặt dùng chung | Feature nghi ảnh hưởng | Ghi chú |
|---|---|---|---|---|
| src/report/timezone.ts | Report | Calculation/report chung | Export Report, Dashboard | risk hint: Report từng có bug timezone (knowledge/bugs) |
| src/user/dto.ts | User | Data/entity (thêm field) | List User, Export User | Nghi ảnh hưởng — QA confirm |
```

## Decision Rules

- Base ref mặc định `main`; nếu repo dùng `develop`/PR base khác, dùng ref đó và ghi rõ trong output.
- Chỉ phân loại theo bằng chứng trong diff; suy đoán feature phụ thuộc luôn kèm mức chắc chắn hoặc flag QA.
- Không đọc toàn bộ source; chỉ mở file trong diff + tra coverage map/testcase cũ liên quan.
- Output là **input cho mục 17**, không thay thế mục 17: agent vẫn tự quyết regression smoke theo mục 17 Bước 3.

## Constraints

- Không tự sinh/sửa testcase; chỉ tạo `git-impact.md`.
- Không bịa thay đổi khi không có diff — ghi `N/A: no diff available`.
- Không ghi secret/diff chứa credential vào output.
- Không hardcode module/domain cụ thể vào skill chung.

## Anti-Patterns

- Suy diễn impact khi diff không đụng bề mặt chung (phải ghi `N/A: no shared surface`).
- Nhân full-suite regression cho mọi file đổi (mục 17: regression là SMOKE, theo tỉ lệ).
- Bỏ qua feature nghi ảnh hưởng thay vì flag `QA confirm`.
- Coi output của skill là quyết định cuối thay vì gợi ý cho QA/mục 17.

## Related

- Neo vào: `prompt_templates/phase1/02_gen_testcases.md` mục 17 (Bước 1), workflow
  `.agent/workflows/phase1_02_generate_testcases.md`.
- [[requirements_analyzer]] — nhận diện impact từ requirement/artifact; skill này bổ sung góc nhìn từ diff.
- `learning_recorder` — nguồn `knowledge/bugs/` cho risk hint theo module.
