---
name: tc_validator
description: Validate testcase Phase 1 theo template 9 cột, coverage/risk gate và khả năng execute automation.
---

# TC Validator

## Purpose

Kiểm tra testcase sau khi sinh/cập nhật để đảm bảo đủ chi tiết, trace requirement rõ và sẵn sàng cho Phase 2 automation.

## Responsibilities

| Trách nhiệm | Yêu cầu |
|---|---|
| Format | Bắt buộc đủ 9 cột testcase chuẩn. |
| Data | Test data cụ thể, traceable, không placeholder. |
| Steps | Step rõ ràng, executable, không gom quá nhiều hành vi trong một dòng. |
| Expected | Expected cụ thể, map đúng business rule/API/UI state. |
| Coverage | Đánh giá requirement coverage và risk-based gate. |
| Risk depth (RBT) | Không chỉ soi % coverage: module **High risk** (tiền/bảo mật/bug lịch sử — theo `### Scope Suggestion`) phải đạt **độ sâu** tương ứng (đủ edge/boundary/negative, density High 10–15 TC), không chỉ happy path. High risk mà chỉ có vài case nông → gap, không PASS. |
| Design techniques | Kiểm áp đúng kỹ thuật khi applicable: entity có vòng đời trạng thái → có **State Transition** (ma trận status × action, gồm transition hợp lệ + bị chặn); logic tổ hợp nhiều điều kiện → có **Decision Table** (đủ combination + nhánh else/default). Applicable mà thiếu → gap. |
| Logic/Data/Security/Perf | Soi 4 dimension hay bị bỏ (mục 13-16 của rule): logic/tính toán có oracle **giá trị cụ thể** + so khớp/delta dữ liệu; field trống nghi ngờ có TC đối chiếu response BE (null/rỗng/thiếu/0); endpoint có id có TC IDOR + injection/mass-assignment/data-exposure; SLA/large-dataset/concurrent khi có ngưỡng. Thiếu mà applicable → ghi gap, không PASS im lặng. |

## Inputs

| Input | Nguồn |
|---|---|
| Testcase Markdown | `<TASK_OUTPUT_DIR>/test-cases/*.md` |
| Requirement summary | `requirements/`, `reports/phase1-summary.md`, `task.md` |
| Rules | `prompt_templates/phase1/02_gen_testcases.md` |

## Outputs

| Output | Vị trí |
|---|---|
| Validation findings | Phase 1 summary hoặc `task.md` |
| Required fixes | TC ID, issue, severity, recommendation |

## Decision Rules

- Requirement coverage = covered requirements / total in-scope requirements * 100%.
- Requirement chỉ covered khi có testcase trace rõ, assertion đúng behavior và không skip nếu đã có execution result.
- **Coverage % đủ ngưỡng nhưng module High risk còn nông (thiếu edge/negative/boundary theo density) → KHÔNG PASS** (gate depth, không chỉ gate %).
- Nếu còn gap Critical/High, không kết luận PASS.
- Testcase duplicate/overlap chỉ giữ khi khác risk/data/expected rõ ràng.

## Constraints

- Không sửa expected result để làm testcase đẹp hơn.
- Không chấp nhận testcase thiếu data/step/expected cụ thể.
- Không coi API testcase hợp lệ nếu thiếu method, endpoint, expected status/body.

## Anti-Patterns

- “Dữ liệu hợp lệ” không có giá trị cụ thể.
- Expected chung chung như “hệ thống hoạt động đúng”.
- Coverage PASS chỉ vì số lượng testcase nhiều.
