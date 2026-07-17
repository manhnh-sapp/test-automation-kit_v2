# Locator Strategy

> Chiến lược locator dùng cho Playwright UI automation.

## Priority

| Ưu tiên | Locator |
|---:|---|
| 1 | `getByRole()` với accessible name |
| 2 | `getByLabel()` cho form field |
| 3 | `getByPlaceholder()` khi label không có |
| 4 | `getByText()` cho text/action rõ ràng |
| 5 | `getByTestId()` khi app có test id ổn định |
| 6 | CSS scoped locator khi không có semantic locator |

XPath và selector dựa vào layout chỉ dùng khi không còn lựa chọn tốt hơn và phải ghi lý do.

## Rules

- Locator phải match đúng element cần thao tác/assert.
- Ưu tiên locator theo nghĩa người dùng nhìn thấy.
- Không dùng CSS class động, hash class, `nth-child` hoặc XPath tuyệt đối nếu có lựa chọn ổn định hơn.
- Inspect DOM thực tế trước khi sửa locator.
- Verify locator ở nhiều state: loading, loaded, empty, có data, modal/dropdown.

## Anti-Patterns

- Đoán locator từ tài liệu mà không inspect UI.
- Copy locator cũ sau khi UI đổi mà không verify.
- Bỏ assertion UI vì locator khó.
- Dùng hard wait để che locator sai.
