# Audit References

> Snapshot ngắn để xác nhận `.agent` hiện chỉ còn các skill/rule phục vụ Playwright-based Test Automation Kit.

## Trạng thái hiện tại

| Nhóm | Trạng thái | Ghi chú |
|---|---|---|
| Main Flow workflows | OK | Phase 1, Phase 2 và Re-run có file tổng quan + step files riêng, không phụ thuộc `partial-rerun`. |
| Partial Rerun | OK | Chỉ nằm trong `partial-rerun/`, gọi thủ công khi tài liệu nguồn đổi nội dung. |
| Playwright rules | OK | Rule canonical ở `RULE_GLOBAL.md`; digest + Playwright rules ở `.agent/rules/core_rules.md`, `locator_strategy.md`, `playwright_fe.md`, `playwright_api.md`. |
| Jira scripts | OK | Skill Jira trỏ tới `scripts/integrations/jira/`. |
| Framework ngoài Playwright | Removed | Đã loại khỏi core skill vì kit hiện dùng Playwright. |

## Skill đang giữ

| Skill | Vai trò |
|---|---|
| `.agent/skills/phase1/requirements_analyzer/SKILL.md` | Phân tích requirement/UI/API phục vụ testcase. |
| `.agent/skills/phase1/tc_validator/SKILL.md` | Validate testcase Phase 1. |
| `.agent/skills/phase2/qa_automation_engineer/SKILL.md` | Generate/update/execute Playwright UI/API automation. |
| `.agent/skills/phase2/flaky_test_analyzer/SKILL.md` | Phân tích và giảm flaky. |
| `.agent/skills/shared/test_data_generator/SKILL.md` | Sinh data traceable, unique, rollback được. |
| `.agent/skills/shared/precondition_setup_planner/SKILL.md` | Phân loại tiền điều kiện, chọn setup method, ghi readiness/blocker cho Setup Strategy contract. |
| `.agent/skills/shared/jira_integration/SKILL.md` | Fetch/read Jira/Confluence/Figma context khi được gọi. |
| `.agent/skills/shared/jira_testcase_publisher/SKILL.md` | Publish testcase từ Excel source of truth lên Jira trong Phase 1 sau QA confirmation. |
| `.agent/skills/shared/jira_bug_reporter/SKILL.md` | Log Jira bug khi Phase 2 đủ gate. |

## Quy tắc duy trì

- Không thêm lại framework ngoài Playwright vào core trừ khi scope framework thay đổi chính thức.
- Không thêm workflow nhánh phụ vào Main Flow.
- Không giữ audit/migration document cũ ở root nếu không còn dùng.
- Nếu đổi tên/move skill, phải cập nhật frontmatter `skills:` trong `.agent/workflows/*.md`.
