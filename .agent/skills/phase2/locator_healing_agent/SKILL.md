---
name: locator-healing-agent
description: Khi locator ACTION fail lúc execute, thử fallback chain và tự áp dụng nếu confidence cao (accessible name exact + role + vùng DOM); ghi lịch sử vào knowledge/locators/. KHÔNG heal locator assertion. Threshold-gated, opt-in LOCATOR_HEAL=1.
---

# Locator Healing Agent

## Purpose

Giảm fail giả do UI churn (nút/label đổi tên, dời chỗ nhưng vẫn tồn tại) mà không tạo false PASS.
Chính thức hoá việc "sửa locator rồi rerun" ở `.agent/workflows/phase2_03_execute_and_auto_heal.md`
thành một policy có **gate confidence** + **ghi lịch sử tái dùng**. Tuân theo
`.agent/rules/locator_healing_policy.md`.

Đây là **skill-policy do agent tuân theo**, KHÔNG phải thư viện self-heal JS chèn vào Playwright
runtime (kit là Node thuần, không thêm dependency).

## Mức tự chủ: Threshold-gated (opt-in)

- Chỉ chạy khi `LOCATOR_HEAL=1` (đặt trong `task.env`). Mặc định TẮT → hành vi execute không đổi.
- Confidence ≥ ngưỡng (đủ 3 tiêu chí) → tự áp dụng + log. Dưới ngưỡng → escalate như `BLOCKED_SETUP`.

## Điều kiện heal (phải đúng TẤT CẢ)

1. `LOCATOR_HEAL=1`.
2. Locator thuộc bước **ACTION/điều hướng** (KHÔNG phải assertion). Xem phân loại ở
   `locator_healing_policy.md`. Locator assertion fail → luôn escalate, không heal.
3. Confidence **CAO** = accessible name khớp exact **+** cùng role/tag **+** cùng vùng DOM.

## Responsibilities

| Trách nhiệm | Yêu cầu |
|---|---|
| Phân loại target | Xác định locator fail là ACTION hay ASSERTION trước khi cân nhắc heal. |
| Thử fallback | `aria-label → text → role → accessibility tree`; ưu tiên fallback từng đúng trong `knowledge/locators/`. Cấm CSS động/`nth-child`/XPath tuyệt đối. |
| Chấm confidence | Đối chiếu 3 tiêu chí; chỉ CAO khi đủ cả 3. |
| Áp dụng + log | Confidence cao + action → sửa locator, chạy tiếp, ghi `locator_auto_healed: true` vào Auto-heal notes. |
| Ghi lịch sử | Lưu entry vào `knowledge/locators/` (element, original, healed_to, confidence, target_type=action). |
| Escalate | Assertion locator hoặc confidence thấp → `setup_failure`/escalate như `BLOCKED_SETUP`. |

## Inputs

| Input | Nguồn |
|---|---|
| Locator fail + ngữ cảnh bước | Playwright error + spec |
| DOM/accessibility tree thật | Trang đang execute |
| Lịch sử heal | `knowledge/locators/` (fallback từng đúng cho element) |
| Flag bật | `LOCATOR_HEAL` (task.env) |

## Outputs

| Output | Vị trí |
|---|---|
| Locator đã heal (nếu áp dụng) | Spec automation của task |
| Auto-heal note + nhãn | Execution summary mục "Auto-heal notes" (`locator_auto_healed: true`) |
| Heal history | `knowledge/locators/<module>__<slug>.json` + cập nhật `knowledge/index.json` |

## Decision Rules

- Không heal locator assertion — mọi trường hợp.
- Heal chỉ để chạm tới assertion; assertion vẫn fail sau heal = bug thật, report bình thường.
- Confidence "gần đúng" (2/3 tiêu chí) = THẤP → escalate.
- Fallback không được đổi sang locator dễ vỡ (CSS động/`nth-child`/XPath tuyệt đối).
- Mọi heal phải audit được (nhãn + entry knowledge).

## Constraints

- Không tự bật; chỉ chạy khi `LOCATOR_HEAL=1`.
- Không đụng phán quyết PASS/FAIL.
- Không sửa `locator_strategy.md`; policy runtime nằm ở `locator_healing_policy.md`.
- Không ghi secret/PII vào entry `knowledge/locators/`.

## Anti-Patterns

- Heal locator assertion rồi báo PASS (false PASS — nghiêm cấm).
- Heal sang CSS class động/`nth-child`/XPath tuyệt đối cho "chạy được".
- Áp dụng heal mà không ghi `locator_auto_healed` / không lưu lịch sử.
- Bật healing mặc định cho mọi task.

## Related

- `.agent/rules/locator_healing_policy.md` — policy runtime chi tiết.
- `.agent/rules/locator_strategy.md` — thứ tự ưu tiên khi viết locator (không sửa).
- Neo workflow: `.agent/workflows/phase2_03_execute_and_auto_heal.md` (Bước 4).
- [[learning_recorder]] — chuẩn ghi `knowledge/`; heal history dùng chung `knowledge/index.json`.
