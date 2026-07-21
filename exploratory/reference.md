# Exploratory Testing Reference

> Tài liệu tham chiếu cho nhánh phụ **Exploratory** — kiểm thử khám phá có định hướng (charter-based),
> tách biệt hoàn toàn khỏi Main Flow. Mức tự chủ: **Never-auto**.

## Mục đích

`exploratory/` là nhánh phụ độc lập. Chỉ dùng khi **user yêu cầu tường minh** một phiên khám phá để
tìm rủi ro mà testcase đã review chưa phủ (crash, edge case lạ, hành vi bất thường).

Nhánh này KHÔNG thuộc Main Flow, KHÔNG tự chạy, KHÔNG block Phase 1/Phase 2/Re-run, và có thể xóa
mà Main Flow vẫn hoạt động — giống `partial-rerun/`.

## Vì sao tách khỏi Phase 2

Phase 2 chính yêu cầu testcase **đã review, có expected result rõ** (đúng triết lý "không coi PASS nếu
assertion chung chung"). Exploratory ngược lại: không có expected cố định, agent tự do dò. Nếu trộn vào
Phase 2 sẽ phá gate PASS/FAIL. Vì vậy exploratory chỉ **sinh draft + quan sát**, KHÔNG kết luận PASS/FAIL
chính thức, KHÔNG tự thêm vào coverage.

## Khi nào dùng / không dùng

| Tình huống | Hành động |
|---|---|
| User muốn dò rủi ro ngoài testcase đã có (charter/tour) | Chạy `run_exploratory_session.md`. |
| Cần testcase chính thức cho requirement | Dùng Phase 1, không dùng exploratory. |
| Cần execute testcase đã review | Dùng Phase 2, không dùng exploratory. |
| Draft từ exploratory muốn tính vào coverage | Đưa qua `tc_validator` + mục 17 ở Phase 1 trước. |
| Phát hiện nghi product bug | Handoff về Main Flow Phase 2 triage (không log Jira trực tiếp). |

## Luồng chuẩn

```text
User yêu cầu phiên exploratory (kèm charter/scope)
↓
run_exploratory_session.md  (timeboxed, heuristic tours)
↓
Ghi Observation log + Crash log + Draft testcase  → <TASK_OUTPUT_DIR>/exploratory/
↓
Human review
↓
Draft đáng giá  → Phase 1 backlog → tc_validator + mục 17 → coverage chính thức
Nghi product bug → Main Flow Phase 2 bug triage (rerun + evidence + gate)
```

## Entry point

```text
exploratory/run_exploratory_session.md
```

## Output

```text
<TASK_OUTPUT_DIR>/exploratory/
├── session-charter.md      # charter/scope + timebox của phiên
├── observations.md         # quan sát bất thường (không kết luận PASS/FAIL)
├── crash-log.md            # lỗi/crash/exception tái hiện được + bước lặp lại
└── draft-testcases.md      # testcase draft (CHƯA tính coverage) để đưa vào Phase 1 backlog
```

## Heuristic tours (gợi ý, không bắt buộc đủ hết)

- **SFDPOT**: Structure, Function, Data, Platform, Operations, Time.
- **CRUD + boundary**: tạo/đọc/sửa/xóa với biên (rỗng/min/max/max+1/ký tự lạ/Unicode).
- **Interruption**: back/refresh/double-submit/mất mạng giữa chừng.
- **Permission/URL bypass**: truy cập trực tiếp URL/endpoint ngoài quyền.
- **Money/number**: làm tròn, âm, số lớn, định dạng ngày/timezone.
Mỗi phát hiện phải ghi **bước tái hiện** rõ ràng, nếu không tái hiện được thì ghi rõ "không tái hiện".

## Hard Rules

- Không gọi exploratory từ Main Flow; Main Flow không phụ thuộc nhánh này.
- Không tự động trigger khi chạy Phase 1/Phase 2/Re-run.
- Không tự thêm draft vào coverage — phải qua `tc_validator` + mục 17.
- Không kết luận PASS/FAIL chính thức trong phiên exploratory.
- Không log Jira trực tiếp — nghi product bug thì handoff Main Flow Phase 2 triage.
- Không mutate business data không rollback được; không dựng state bằng DB (chỉ read-only UAT như rule chung).
- Không ghi secret/PII vào observation/crash/draft.
- Không block Main Flow nếu thư mục `exploratory/` thiếu file hoặc bị xóa.
