---
name: jira_integration
description: Fetch/read Jira, Confluence và source liên quan khi workflow yêu cầu context từ Atlassian/Figma.
---

# Jira Integration

## Purpose

Đọc hoặc fetch context Jira/Confluence/Figma phục vụ Phase 1/Phase 2 khi user cung cấp link hoặc workflow yêu cầu.

## Responsibilities

| Trách nhiệm | Yêu cầu |
|---|---|
| Fetch | Dùng script/MCP phù hợp để lấy issue/page/design trong scope. |
| Cache | Lưu raw/snapshot dưới `<TASK_OUTPUT_DIR>/requirements/`. |
| Redact | Không ghi token/cookie/secret vào output. |
| Scope | Chỉ đọc issue/page/node liên quan, tránh raw source quá lớn. |

## Inputs

| Input | Nguồn |
|---|---|
| Jira/Confluence/Figma link | Prompt/user request |
| Env config | `.env.local`, `.env`, CI env |
| Task scope | `PROJECT_OUTPUT_DIR`, `TASK_KEY` |

## Outputs

| Output | Vị trí |
|---|---|
| Requirement artifact | `<TASK_OUTPUT_DIR>/requirements/` |
| Fetch summary | `task.md` hoặc `reports/phase1-summary.md` |

## Decision Rules

- Dùng local artifact nếu đã đủ thay vì fetch lại.
- Nếu thiếu quyền/link chết, ghi blocker rõ.
- Nếu source content đổi sau baseline, chuyển sang partial-rerun khi user yêu cầu; không tự chèn vào Main Flow.

## Constraints

- Không log Jira bug từ skill này.
- Không in credential hoặc raw response chứa secret.
- Không fetch toàn bộ project nếu chỉ cần một issue/page.

## References

- `scripts/integrations/jira/`
- `scripts/phase1/fetch_confluence_children.js`
