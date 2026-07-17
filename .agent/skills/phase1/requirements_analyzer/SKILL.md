---
name: requirements_analyzer
description: Phân tích requirement/UI/API artifact để tạo scope, business rule và coverage input cho Phase 1.
---

# Requirements Analyzer

## Purpose

Chuyển Jira/Confluence/Figma/Swagger/local artifact thành requirement summary, business rule, open question và coverage input phục vụ sinh testcase.

## Responsibilities

| Trách nhiệm | Yêu cầu |
|---|---|
| Scope | Xác định module, user story, screen, endpoint, role và data behavior trong scope. |
| Trace | Mapping requirement/business rule/API behavior tới testcase hoặc gap. |
| Risk | Phân loại rule/gap theo `Critical`, `High`, `Medium`, `Low`. |
| Setup input | Từ Swagger/API spec, xác định endpoint/payload có thể dùng để setup precondition (input cho Setup Strategy contract của testcase). |
| Question | Ghi open question khi tài liệu mâu thuẫn hoặc thiếu expected result. |

## Inputs

| Input | Nguồn |
|---|---|
| Requirement | Jira, Confluence, file local |
| UI design | Figma hoặc screenshot/spec local |
| API spec | Swagger/OpenAPI |
| Project context | `.agent/config/project_context.md` |

## Outputs

| Output | Vị trí |
|---|---|
| Requirement summary | `<TASK_OUTPUT_DIR>/requirements/` hoặc `reports/phase1-summary.md` |
| Coverage input | Requirement/API/UI behavior -> TC/gap mapping |
| Setup source candidates | Endpoint/payload/fixture từ Swagger phục vụ Setup Strategy contract |
| Open questions | `task.md` hoặc Phase 1 summary |

## Decision Rules

- Ưu tiên artifact local/snapshot trước khi fetch raw source lớn.
- Chỉ đọc section/source liên quan đến scope.
- Requirement chỉ được coi là clear khi có expected behavior đủ để sinh testcase executable.
- Nếu link/path source thay đổi sau baseline, đó là partial-rerun concern, không tự thay main source.

## Constraints

- Không tự suy diễn expected result khi requirement mơ hồ.
- Không hardcode task/project cụ thể vào template chung.
- Không ghi secret vào requirement artifact/report.

## Anti-Patterns

- Paste toàn bộ raw Confluence/Figma/Swagger vào chat.
- Bỏ qua permission/error/rollback/API side-effect trong coverage input.
- Coi số lượng testcase cao là coverage tốt nếu thiếu core/high-risk rule.
