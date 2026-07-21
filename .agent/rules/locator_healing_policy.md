# Locator Healing Policy (runtime)

> Policy runtime khi 1 locator FAIL lúc execute Phase 2. Bổ sung cho `.agent/rules/locator_strategy.md`
> (cái đó là thứ tự ưu tiên khi **VIẾT** locator; file này là cách xử lý khi locator **fail lúc chạy**).
> Mức tự chủ: **Threshold-gated** (Autonomy Gate). Nguyên tắc gốc: pass giả do sửa sai chỗ nguy hiểm
> hơn fail thật — không được để healing tạo false PASS.

## Opt-in (mặc định TẮT)

- Chỉ áp dụng khi `LOCATOR_HEAL=1` (đặt trong `task.env` per-task, không set ở `.env` chung).
- Khi TẮT: locator fail được phân loại như hiện tại (`setup_failure`/escalate), hành vi execute không đổi.
- Bật/tắt là kill-switch: có vấn đề → tắt là về hành vi known-good, không cần rollback code.

## Phân loại locator target — TRƯỚC khi cân nhắc heal

| Loại | Định nghĩa | Được heal? |
|---|---|---|
| **Action/điều hướng** | Element ta *thao tác để test đi tiếp* (click nút, mở menu, điền field). | Có — nếu confidence cao. |
| **Assertion** | Element mà *sự tồn tại/nội dung của nó CHÍNH LÀ điều đang verify* (toast, cột/format, badge status, count...). | **KHÔNG BAO GIỜ.** |

Locator assertion fail thường **chính là tín hiệu bug** (element biến mất/đổi = có thể là regression cần bắt).
Heal nó = xoá đúng bằng chứng test sinh ra để phát hiện → escalate, không thay element khác.

## Confidence gate

Chỉ coi là **CAO** khi đủ **cả 3**:

1. **Accessible name khớp exact** với element mục tiêu ban đầu.
2. **Cùng role/tag** (button vẫn là button, link vẫn là link...).
3. **Cùng vùng DOM** (cùng ancestor/landmark/section, không nhảy sang khu vực khác của trang).

Thiếu bất kỳ 1 trong 3 → **THẤP**.

## Cơ chế heal (chỉ khi bật + là action locator + confidence cao)

1. Inspect DOM thật, thử fallback chain theo thứ tự: `aria-label → text → role → accessibility tree`.
   - Ưu tiên fallback đã từng đúng cho element này trong `knowledge/locators/` (nếu có lịch sử).
2. **CẤM** fallback bằng CSS class động/hash class, `nth-child`, hoặc XPath tuyệt đối (giữ đúng cấm ở
   `locator_strategy.md`) — heal không được đổi sang locator dễ vỡ.
3. Nếu tìm được match confidence cao → tự áp dụng, chạy tiếp:
   - **BẮT BUỘC** ghi vào Execution Summary mục "Auto-heal notes" kèm nhãn `locator_auto_healed: true`
     (locator cũ → locator mới, lý do, confidence basis).
   - Ghi lịch sử vào `knowledge/locators/` (xem `knowledge/SCHEMA.md`) để lần sau ưu tiên đúng fallback.
4. Nếu confidence thấp → **KHÔNG** tự sửa: phân loại `setup_failure`, escalate như `BLOCKED_SETUP`
   (đúng Definition of Ready hiện hành) cho agent/QA xử lý tay.

## Rules

- Healing chỉ để *chạm tới được assertion*, KHÔNG được đụng phán quyết PASS/FAIL.
- Sau khi heal locator action, nếu assertion vẫn fail → đó là **bug thật**, report bình thường
  (không heal thêm để ép xanh).
- Không heal locator assertion trong mọi trường hợp — confidence thấp/cao đều escalate.
- Mọi lần heal phải audit được: nhãn `locator_auto_healed` + entry `knowledge/locators/`.
- Ngưỡng confidence khắt khe hơn mặc định của thư viện self-healing phổ biến (đủ cả 3 tiêu chí).

## Anti-Patterns

- Heal locator assertion rồi báo PASS (false PASS — nghiêm cấm).
- Heal sang CSS class động/`nth-child`/XPath tuyệt đối để "cho chạy".
- Tự áp dụng heal mà không ghi `locator_auto_healed` / không lưu `knowledge/locators/`.
- Coi confidence "gần đúng" (khớp 2/3 tiêu chí) là cao.
- Bật healing mặc định cho mọi task thay vì opt-in theo `LOCATOR_HEAL`.
