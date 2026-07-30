# Prompt Phase 1 - Thu thập tài liệu nguồn

> Chạy: `Đọc file này và chạy với TASK_KEY=<TASK_KEY>`. Tuân thủ `RULE_GLOBAL.md` và `.agent/rules/`.

# Vai trò
Bạn là QA Engineer thiết lập AI Core Engine để phân tích tài liệu dự án.

# Nhiệm vụ
Kết nối nguồn tài liệu, tiếp nhận requirement và chuẩn bị context cho việc sinh testcases.

> **ĐỌC THẬT KỸ, KHÔNG QUA LOA.** Mọi tài liệu phải đọc TOÀN BỘ (mọi mục, bảng, ghi chú, footnote, comment, phụ lục), bóc hết acceptance criteria / business rule / validation / enum / state & transition / edge / xử lý lỗi / phân quyền / biên; đối chiếu chéo các nguồn và **nêu mâu thuẫn**. Đọc lướt → phân tích lệch → câu hỏi làm rõ sai/thiếu → testcase kém. (Canonical: `RULE_GLOBAL.md` §"Analysis & Ambiguity Gate".)

# Đầu vào
- Project: [YOUR_PROJECT_NAME]
- Task key/scope folder: [TASK_KEY]
- Module/Feature: [MODULE_OR_FEATURE]
- Sites: [App 1 / App 2 / Cross-app]
- Project Context: `.agent/config/project_context.md`
- Project Output: `<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/`

# Các bước thực hiện
1. Đọc `.agent/config/project_context.md`.
2. Đọc `.env.example` để biết env keys cần có, không đọc/ghi secret vào output.
3. Fetch/read Jira story hoặc epic nếu có.
4. Fetch/read Confluence BA docs hoặc SOP nếu có.
5. Fetch/read Figma design nếu có.
6. Fetch app/site liên quan Swagger spec nếu có, sau đó parse endpoints và schema.
7. Liên kết logic BA docs, Jira story, Figma flow và API docs.
8. Lưu context vào `<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/test-cases/snapshot_context.json`.

# Checklist kiểm tra
- [ ] Đã đọc **toàn bộ** tài liệu (không lướt); bóc đủ AC/rule/validation/enum/state/edge/phân quyền/biên; mâu thuẫn giữa các nguồn đã ghi ra.
- [ ] Tài liệu đủ để sinh testcase.
- [ ] Domain tag đúng: App 1 / App 2 / Cross-app.
- [ ] Requirement, UI và API context đã được liên kết rõ.
- [ ] Sẵn sàng cho bước sinh testcases.

# Đầu ra
- File: `<PROJECT_OUTPUT_DIR>/tasks/[TASK_KEY]/test-cases/snapshot_context.json`
- Summary: module list, user story count, endpoints analyzed, UI flows analyzed.
