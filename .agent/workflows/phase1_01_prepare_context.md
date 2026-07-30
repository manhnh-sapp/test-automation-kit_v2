# Phase 1 - Bước 1: Chuẩn Bị Context

> Xác nhận scope và thu thập đủ nguồn requirement/design/API trước khi sinh testcase.

## Mục Đích

Đảm bảo agent hiểu đúng task, project output, nguồn tài liệu và phạm vi kiểm thử trước khi tạo testcase.

## Inputs

| Input | Nguồn |
|---|---|
| `TASK_KEY` | User prompt hoặc env |
| `PROJECT_OUTPUT_DIR` | Env hoặc `.agent/config/project_context.md` |
| Requirement/story | Jira, Confluence hoặc artifact local |
| UI/API spec | Figma, Swagger/OpenAPI hoặc artifact local |

## Workflow

1. Echo lại `PROJECT_OUTPUT_DIR`, `TASK_KEY`, `TASK_OUTPUT_DIR`.
2. Nếu yêu cầu hiện tại không nêu rõ `TASK_KEY`, không dùng `TASK_KEY` từ `.env` hoặc context cũ để chạy; phải hỏi lại.
3. Đọc `.agent/config/project_context.md` nếu có.
4. Đọc artifact local trước:
   - `<TASK_OUTPUT_DIR>/task.md`
   - `<TASK_OUTPUT_DIR>/requirements/`
   - `<TASK_OUTPUT_DIR>/reports/phase1-summary.md` nếu đã có
5. Chỉ fetch Jira/Confluence/Figma/Swagger khi artifact local thiếu hoặc user yêu cầu refresh.
6. **Đọc THẬT KỸ, KHÔNG qua loa** toàn bộ tài liệu (mọi mục, bảng, ghi chú, footnote, comment, phụ lục); bóc hết AC/business rule/validation/enum/state & transition/edge/xử lý lỗi/phân quyền/biên; đối chiếu chéo các nguồn và **nêu mâu thuẫn**. Rồi xác định in-scope requirement/business rule/API behavior.
7. **Ambiguity Gate (BẮT BUỘC — gate cứng, chặn sinh testcase):**
   - Rà mâu thuẫn / thiếu rule bắt buộc / expected result không rõ / thiếu data-behavior để sinh case executable.
   - Nếu CÓ điểm mơ hồ mức **Critical/High** (ảnh hưởng core flow, tính tiền/bảo mật, hoặc không thể sinh expected đúng): xuất **danh sách Q&A đánh số** `Q1, Q2...` vào `<TASK_OUTPUT_DIR>/reports/phase1-clarifications.md`, mỗi câu gồm: câu hỏi rõ ràng + **assumption mặc định đề xuất** (điều agent sẽ giả định nếu QA đồng ý) + phần scope bị chặn nếu chưa trả lời.
   - Ghi `AMBIGUITY_GATE: PENDING` vào `task.md` và **DỪNG** — chờ QA/BA trả lời hoặc xác nhận chấp nhận assumption.
   - Chỉ khi mọi câu Critical/High đã `RESOLVED` (có câu trả lời, hoặc QA tick chấp nhận assumption) mới **phân tích lại + chỉnh** coverage map/scope theo câu trả lời, đổi `AMBIGUITY_GATE: RESOLVED`, rồi mới cho phép sang `phase1_02`. KHÔNG gen bằng hiểu biết cũ trước khi chỉnh theo câu trả lời.
   - Điểm mơ hồ Medium/Low KHÔNG chặn nhưng **vẫn liệt kê** trong `phase1-clarifications.md` (đánh dấu Non-blocking) để QA thấy hết điểm mờ; nếu QA không trả lời thì tự áp assumption mặc định + ghi Coverage Gaps, vẫn sinh case.

## Rules

- Không sửa `.env` chung khi có thể truyền env theo command.
- Không fetch lại toàn bộ tài liệu nếu snapshot/local summary đã đủ.
- Không tự chuyển sang `partial-rerun`; chỉ dùng nhánh đó khi user yêu cầu xử lý tài liệu đã đổi.
- **KHÔNG tự giả định qua mơ hồ Critical/High rồi sinh case** — phải qua Ambiguity Gate (đối lập với "assume + note" cho mọi mức). Assumption chỉ được tự áp cho mức Medium/Low.

## Outputs

| Output | Vị trí |
|---|---|
| Requirement artifact/cache | `<TASK_OUTPUT_DIR>/requirements/` |
| Context summary | `<TASK_OUTPUT_DIR>/task.md` hoặc `phase1-summary.md` |
| Ambiguity clarifications (Q&A) | `<TASK_OUTPUT_DIR>/reports/phase1-clarifications.md` (khi gate PENDING) |
| Trạng thái gate | `task.md`: `AMBIGUITY_GATE: PENDING/RESOLVED` |
