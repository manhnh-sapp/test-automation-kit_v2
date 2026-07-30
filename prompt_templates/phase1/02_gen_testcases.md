# Prompt Phase 1 - Sinh testcase

> Chạy: `Đọc file này và chạy với TASK_KEY=<TASK_KEY>`. Tuân thủ `RULE_GLOBAL.md` và `.agent/rules/`.

# Vai trò
Bạn là Senior QA Engineer với 10 năm kinh nghiệm, chuyên về Risk-Based Testing và Test Automation.

# Nhiệm vụ
Phân tích requirement và sinh bộ test cases đầy đủ, chi tiết theo template chuẩn.
Test cases phải đủ chi tiết để automation script thực thi chính xác mà không cần đoán thêm bất kỳ thông tin nào.
Mục tiêu là coverage cao nhất có thể trong scope đã cung cấp, bao gồm happy path, negative, boundary, edge, permission, error state, data sync và regression-sensitive flows.

# Bước 0 — BẮT BUỘC trước khi gen: đọc kỹ + chốt hỏi-đáp làm rõ

> **Gate cứng. TUYỆT ĐỐI KHÔNG viết testcase nào trước khi hoàn tất bước này.** Canonical: `RULE_GLOBAL.md` §"Analysis & Ambiguity Gate"; workflow: `.agent/workflows/phase1_01_prepare_context.md`.

1. **Đọc tài liệu THẬT KỸ, KHÔNG qua loa** — toàn bộ phần **trong scope** của requirement/BRD/Figma/Swagger/Jira: mọi mục, **bảng, ghi chú, footnote, comment, phụ lục** liên quan (phần ngoài scope thì lướt — không mâu thuẫn với mục "Tiết kiệm token" bên dưới). Bóc hết acceptance criteria, business rule, validation, enum/giá trị, state & transition, edge, xử lý lỗi, phân quyền, biên. **Đối chiếu chéo** các nguồn; mâu thuẫn thì nêu ra, không tự chọn bừa. Phân biệt "tài liệu ghi thật" vs "tôi suy luận".
2. **Gom MỌI điểm mờ/phân vân thành MỘT danh sách câu hỏi** `Q1, Q2…` ghi `<TASK_OUTPUT_DIR>/reports/phase1-clarifications.md` — mỗi câu bám **spec cụ thể** (giá trị/URL/element/điều kiện/enum/oracle), kèm **assumption mặc định đề xuất** + **scope bị chặn** nếu chưa trả lời. Phân loại **Blocking** (Critical/High) vs **Non-blocking** (Medium/Low, có default). Ghi cả hai loại để QA thấy hết điểm mờ.
3. Còn câu **Blocking** → ghi `AMBIGUITY_GATE: PENDING` vào `task.md`, **DỪNG** chờ QA/BA trả lời (hoặc tick chấp nhận assumption). **KHÔNG tự đoán qua Blocking rồi gen.**
4. Mọi Blocking đã RESOLVED → **phân tích lại + chỉnh** coverage map/scope theo câu trả lời → đặt `AMBIGUITY_GATE: RESOLVED` → mới bắt đầu gen. Câu Blocking không được trả lời → phần scope đó ghi "chờ làm rõ" ở Coverage Gaps, **KHÔNG gen** case cho nó.
5. Medium/Low không chặn: tự áp assumption (ghi rõ) + Coverage Gaps, vẫn gen.

# Ngữ cảnh
- Dự án: [TÊN DỰ ÁN] (App 1 / App)
- Module: [TÊN MODULE]
- Requirement: [PATH/LINK REQUIREMENT hoặc nội dung ngắn liên quan trực tiếp; ưu tiên path/link thay vì dán tài liệu dài]
- URL hệ thống: [URL STAGING]
- Loại test: [UI E2E / API / E2E]

# Template bắt buộc (9 cột)

| TC ID | Module | Trường hợp kiểm thử | Tiền điều kiện | Dữ liệu Test | Các bước thực hiện | Kết quả mong đợi | Ưu tiên | Mức độ rủi ro |

---

# Quy tắc sinh testcase

## 0. Tiết kiệm token và context

- Ưu tiên đọc requirement từ file/link/artifact local; không yêu cầu dán toàn bộ Jira/Confluence/Figma/Swagger vào prompt.
- Nếu đã có `task.md`, raw requirement, snapshot hoặc `reports/phase1-summary.md`, dùng chúng làm nguồn chính và chỉ đọc thêm section còn thiếu.
- Khi tài liệu lớn, chỉ mở phần liên quan đến module, user story, acceptance criteria, screen, endpoint hoặc business rule trong scope.
- Coverage map có thể tạo nội bộ hoặc lưu vào `reports/phase1-summary.md`; không cần paste toàn bộ coverage map vào chat.
- Không đọc file example của task khác trừ khi user yêu cầu dùng example đó làm input.

## 0. Phân nhóm testcase bắt buộc

Testcase phải được phân biệt rõ theo **nhóm chính là business flow** để QA review, export Excel và publish Xray/Jira dễ lọc.

Vẫn giữ đúng template 9 cột. Không tự thêm cột thứ 10 trong Markdown. Thay vào đó, cột `Module` phải dùng format:

`[Nhóm chức năng] / [User Story hoặc màn hình/API/flow cụ thể]`

`Nhóm chức năng` là nhóm chính theo business flow, không phải layer kỹ thuật thuần túy. Nhóm phải được suy ra từ domain/scope hiện tại, không hardcode theo một task cụ thể.

Nguyên tắc đặt nhóm:
- Dùng tên nhóm nghiệp vụ mà QA/BA/dev trong scope đó có thể review và lọc được.
- Với CRUD/admin tool, có thể dùng các nhóm như `Xem danh sách`, `Xem chi tiết`, `Tạo`, `Sửa`, `Xóa`.
- Với domain khác, thay bằng nhóm phù hợp, ví dụ: `Đăng nhập`, `Đăng ký`, `Thanh toán`, `Giỏ hàng`, `Quản lý hồ sơ`, `Tìm kiếm`, `Thông báo`, `Báo cáo`, `Cấu hình`, `Import/Export`.
- Với API testcase, nếu endpoint phục vụ rõ một business flow thì nhóm chính vẫn là business flow đó, ví dụ `Tạo / API POST /api/v1/examination`, không tách thành nhóm chính `API`.
- Chỉ dùng nhóm chính `API` khi testcase kiểm endpoint/platform behavior không thuộc flow nghiệp vụ cụ thể nào.
- Với E2E/cross-app, nếu flow có business flow rõ thì nhóm chính vẫn là flow đó, ví dụ `Tạo / Ops create exam -> LMS sync`; chỉ dùng `E2E/Cross-app` khi flow chính là sync/tích hợp đa hệ thống.
- Với permission/security, nếu permission gắn với flow rõ thì nhóm chính vẫn là flow đó, ví dụ `Sửa / Permission role teacher cannot edit`; chỉ dùng `Permission/Security` khi testcase chủ yếu kiểm auth/role/security độc lập.
- KHÔNG thêm cột label vào bảng testcase. Khi publish Xray/Jira, label để TỐI THIỂU (marker `automation-testcase` + khoá dedup `task-*`/`tc-*`); nhóm chức năng thể hiện qua Xray Test Set và subfolder Test Repository (theo sheet chức năng), KHÔNG dùng label group/layer/risk/priority/xray.
- `Khác` chỉ dùng khi requirement không thuộc nhóm nào rõ ràng và phải giải thích trong Coverage Gaps.

Ví dụ đúng cho cột `Module`:
- `Xem danh sách / US-01 Exam List`
- `Xem chi tiết / US-02 Exam Detail`
- `Tạo / US-03 Create Exam`
- `Sửa / US-04 Edit Exam`
- `Xóa / US-05 Delete Exam`
- `Tạo / API POST /api/v1/examination`
- `Tạo / Ops create exam -> LMS sync`
- `Permission/Security / Unauthorized access token`
- `Đăng nhập / Login form`
- `Thanh toán / Checkout with saved card`
- `Báo cáo / Export revenue report`

Sau bảng testcase, bắt buộc thêm section `## Phân nhóm testcase` gồm bảng:

| Nhóm chức năng | Phạm vi | TC ID | Tổng |
|---|---|---|---|

Mỗi TC phải thuộc đúng 1 nhóm chính. Không để nhóm mơ hồ như `General`, `Misc`, `Other` nếu có thể map vào nhóm nghiệp vụ rõ ràng.

## 1. TC ID
- Format: `[PROJECT]_[MODULE]_TC_[NNN]`
- Ví dụ: `APP_LOGIN_TC_001`, `APP_ORDER_TC_023`
- Số thứ tự 3 chữ số, liên tục

## 2. Trường hợp kiểm thử
Mô tả rõ ràng, đủ nghiệp vụ, đọc tên case là hiểu được mục tiêu test và điều kiện chính. Không đặt tên chung chung.

Format bắt buộc:
`[Positive|Negative|Boundary|Edge] [Site/Layer] - [Màn hình/API/Flow] - [Hành vi cụ thể] - [Điều kiện dữ liệu/rule]`

Trong đó:
- `Site/Layer`: App 1 / App 2 / Cross-app / API / E2E.
- `Màn hình/API/Flow`: tên màn hình, endpoint hoặc luồng nghiệp vụ.
- `Hành vi cụ thể`: hành động hoặc rule cần verify.
- `Điều kiện dữ liệu/rule`: program, role, state, business rule hoặc edge condition.

Tên case phải bao gồm:
- Loại: [Positive] / [Negative] / [Boundary] / [Edge]
- Site/layer liên quan nếu có nhiều site.
- Màn/endpoint/flow cụ thể.
- Điều kiện dữ liệu chính.

✅ ĐÚNG:
- `[Positive] App 2 - Create bản ghi nghiệp vụ - Lưu thành công khi mã định danh unique và có 1 lịch thi hợp lệ`
- `[Negative] API - POST /api/v1/resources - Chặn tạo bản ghi nghiệp vụ khi thiếu required_field`
- `[Boundary] App 1 - Update Profile - Disable Save khi giá trị ngày mới trùng kỳ hiện tại`

❌ SAI:
- `Kiểm tra tạo exam`
- `Update thành công`
- `Validate form`

## 3. Tiền điều kiện
Liệt kê đầy đủ, cụ thể:
- Trạng thái hệ thống: `Hệ thống đang chạy tại [URL]`
- Trạng thái dữ liệu: `Tài khoản auto_test@test.com đã tồn tại, trạng thái Active`
- Trạng thái người dùng: `Người dùng chưa đăng nhập, đang ở trang /login`
- Không để trống hoặc ghi chung chung "Hệ thống hoạt động bình thường"
- Mỗi cell `Tiền điều kiện` phải bắt đầu bằng tag `[PRE-NN]` (có thể nhiều tag) trỏ tới dòng tương ứng trong section `## Setup Strategy (Hợp đồng tiền điều kiện)`. Nhiều TC dùng chung precondition thì dùng chung `PRE-NN`. Xem mục 9.
- BẮT BUỘC kèm mô tả ngắn ngay sau mỗi tag để cell tự đọc được mà không cần kéo xuống catalog, định dạng `[PRE-NN] <mô tả trạng thái ngắn>`. Nhiều precondition thì xuống dòng bằng `<br>`, ví dụ: `[PRE-01] Admin đăng nhập, session hợp lệ<br>[PRE-05] Bản ghi cha tồn tại với 3 mục con`. Mô tả ngắn phải khớp cột `Mô tả trạng thái` của `PRE-NN` trong catalog. Không để tag trơ trụi không mô tả.

## 4. Dữ liệu Test (QUAN TRỌNG NHẤT)
**TUYỆT ĐỐI KHÔNG dùng placeholder** như "email hợp lệ", "mật khẩu đúng", "dữ liệu hợp lệ"

✅ ĐÚNG:
```
email: auto_login_001@test.com
password: Test@12345
```

❌ SAI:
```
email: email hợp lệ
password: mật khẩu đúng
```

Quy tắc cho từng loại dữ liệu:
- **Email dynamic**: `auto_[module]_[NNN]@test.com` → VD: `auto_login_001@test.com`
- **Password valid**: luôn dùng `Test@12345` (đủ uppercase, lowercase, number, special char)
- **Text field**: giá trị cụ thể bằng tiếng Việt hoặc tiếng Anh
- **Empty field**: `""` (để rõ là empty string)
- **Số âm**: `-1`
- **Quá dài**: `"Aaaa..." (201 ký tự)` — ghi rõ số ký tự
- **Special chars**: `"<script>alert(1)</script>"`
- **Whitespace**: `"   "` (3 khoảng trắng)

## 5. Các bước thực hiện
- Đánh số thứ tự: 1, 2, 3...
- Mỗi bước = 1 action cụ thể (không gộp nhiều action)
- Phải bao gồm bước navigate đến URL
- Phải nêu rõ element nào, giá trị nào
- Với UI testcase, phải nêu rõ menu/tab/button/field theo label hiển thị hoặc path cụ thể.
- Với API testcase, steps phải nêu rõ method, endpoint, query/path/body/header cần gửi.
- Với E2E testcase, steps phải nêu rõ chuyển đổi giữa các app/site liên quan, user nào thao tác ở mỗi bước và cần verify sync ở đâu.
- Không dùng steps chung chung như "nhập thông tin hợp lệ", "thực hiện tạo mới", "kiểm tra kết quả".
- Nếu có popup/modal/toast/loading, phải thêm bước quan sát trạng thái đó.
- Nếu case phục vụ Phase 2 automation, steps phải đủ để viết script Playwright/API test trực tiếp.
- Trong cell Markdown, các bước ngăn cách bằng `<br>` (mỗi bước một dòng), không viết liền nhiều bước trên một dòng.

✅ ĐÚNG:
```
1. Mở trình duyệt, navigate đến [URL]/login
2. Tại field "Email", nhập: auto_login_001@test.com
3. Tại field "Mật khẩu", nhập: Test@12345
4. Click button "Đăng nhập"
5. Quan sát kết quả
```

❌ SAI:
```
1. Mở trang login
2. Nhập thông tin đăng nhập
3. Click đăng nhập
```

## 6. Kết quả mong đợi
- **Mỗi bước một dòng kết quả riêng**, đánh số KHỚP với cột `Các bước thực hiện` (bước 1 → kết quả 1, bước 2 → kết quả 2...). KHÔNG gộp nhiều bước vào một mục (cấm kiểu `1-2.`, `1-3.`). Bước chọn/nhập/navigate cũng phải có kết quả tương ứng (ghi phản hồi tức thời có thật: field nhận giá trị, tùy chọn được chọn, trang điều hướng đúng...), KHÔNG bịa assertion ngoài tài liệu.
- **Mỗi ý một dòng**: nếu một bước có nhiều điểm cần kiểm chứng thì tách mỗi ý thành một dòng con `- <ý>`. TUYỆT ĐỐI không nhồi nhiều ý vào một dòng bằng dấu `;`.
- **Xuống dòng bằng `<br>`**: mọi dòng (kết quả từng bước và các ý con) ngăn cách bằng `<br>` để Excel hiển thị nhiều dòng, không viết liền một dòng dài.
- Mô tả CHÍNH XÁC: text nào hiển thị, URL chuyển đến đâu, element nào thay đổi
- Bao gồm cả response HTTP nếu là API test
- Với UI, nêu rõ field state: enabled/disabled/readonly/visible/hidden, selected value, validation message, toast, row count, pagination, modal state.
- Với API, nêu rõ status code, schema field quan trọng, business value trong response, error code/message nếu có.
- Với E2E, nêu rõ side-effect ở hệ thống khác: app/site liên quan, integration, notification hoặc data count nếu nằm trong scope.
- Expected không được chỉ ghi "thành công", "báo lỗi", "hiển thị đúng".

✅ ĐÚNG (mỗi bước một dòng, mỗi ý một dòng, ngăn bằng `<br>`):
```
1. Trường "Allow split via VNPay?" là Checkbox (không phải dropdown), Optional<br>2. Sau khi tick, hiển thị:<br>- Section "Set up payment via VNPay"<br>- Nút "Add installment" enabled<br>- Ràng buộc: tổng các đợt phải bằng số tiền order
```
❌ SAI (gộp bước + nhồi nhiều ý bằng `;` trên một dòng):
```
1-2. Trường là Checkbox, Optional; hiển thị section VNPay; nút Add enabled; tổng đợt = order
```
- **Với case hiển thị (tên cột/label/format dữ liệu/thứ tự/empty-state/placeholder)**: expected phải **trích nguyên văn từ FS/Figma/tài liệu**, KHÔNG lấy từ build đang chạy (tránh oracle tautological — xem mục 12). Ghi rõ chuỗi/format chuẩn, vd cột `Check-in`, format giờ `hh:mm`, ngày `DD/MM/YYYY hh:mm hh:mm`.

✅ ĐÚNG:
```
1. Trang /login hiển thị với form đăng nhập, 2 field Email và Mật khẩu
2. Field Email hiển thị giá trị "auto_login_001@test.com"
3. Field Mật khẩu hiển thị ký tự ẩn (●●●●●●●●)
4. Button "Đăng nhập" nhận focus, loading spinner xuất hiện trong 1-3s
5. Redirect đến /dashboard, hiển thị toast "Đăng nhập thành công", header hiển thị tên người dùng
```

❌ SAI:
```
5. Đăng nhập thành công, chuyển trang
```

## 7. Ưu tiên
Chỉ dùng đúng các giá trị Priority có trong Jira: `Highest`, `High`, `Medium`, `Low`, `Lowest`. Không dùng `Critical`, `P0`, `P1` hoặc giá trị khác trong cột `Ưu tiên`.

| Level | Khi nào |
|---|---|
| **Highest** | Chức năng cốt lõi, hệ thống không dùng được nếu fail, mất dữ liệu hoặc ảnh hưởng bảo mật nghiêm trọng |
| **High** | Tính năng chính, ảnh hưởng nghiệp vụ lớn hoặc block nhóm người dùng quan trọng |
| **Medium** | Tính năng phụ, ảnh hưởng một nhóm người dùng nhưng có workaround |
| **Low** | Edge case, ảnh hưởng ít, không block luồng chính |
| **Lowest** | Lỗi nhỏ/cosmetic, typo, hiển thị phụ hoặc tác động rất thấp |

## 8. Mức độ rủi ro
| Level | Khi nào |
|---|---|
| **High** | Dữ liệu quan trọng, tài chính, bảo mật, không thể rollback |
| **Medium** | Ảnh hưởng trung bình, có thể sửa |
| **Low** | Ảnh hưởng nhỏ, UI/UX, dễ fix |

## 9. Setup Strategy (Hợp đồng tiền điều kiện) — BẮT BUỘC

Cột `Tiền điều kiện` chỉ mô tả *trạng thái cần có*. Phase 2 còn cần biết *cách đạt được trạng thái đó* để tự setup thay vì đoán. Vì template giữ đúng 9 cột (không thêm cột thứ 10), thông tin setup được đặt trong một section riêng sau bảng testcase, dạng catalog tái sử dụng theo ID.

Dùng skill `precondition_setup_planner` để phân loại precondition, chọn setup method và đánh dấu readiness/blocker.

Sau `## Phân nhóm testcase`, thêm section bắt buộc `## Setup Strategy (Hợp đồng tiền điều kiện)` gồm bảng:

| Precondition ID | Mô tả trạng thái | Precondition Type | Setup Strategy | Setup Source | Setup Verification | Cleanup/Rollback | Automation Readiness | Linked TC IDs |
|---|---|---|---|---|---|---|---|---|

Quy tắc:
- Mỗi precondition distinct = 1 `PRE-NN` (2-3 chữ số, liên tục). Nhiều TC dùng chung precondition thì dùng chung 1 `PRE-NN`; không lặp lại recipe.
- Mỗi cell `Tiền điều kiện` trong bảng testcase phải bắt đầu bằng tag `[PRE-NN]` kèm mô tả ngắn (`[PRE-NN] <mô tả trạng thái ngắn>`, nhiều tag tách bằng `<br>`) trỏ tới dòng tương ứng trong catalog. Mô tả ngắn phải khớp cột `Mô tả trạng thái` của `PRE-NN`. Mỗi `PRE-NN` trong catalog phải được ít nhất 1 TC tham chiếu.
- `Precondition Type` ∈ `auth_session` | `state_exist` | `state_mutation` | `config` | `pre_existing_fixture` | `none`.
- `Setup Strategy` ∈ `api` | `factory` | `test_hook` | `ui` | `pre_existing` | `manual`. Ưu tiên `pre_existing` → `api`/`factory` → `test_hook` → `ui` → `manual`; không có strategy DB.
- KHÔNG bắt UI dựng tiền điều kiện nếu testcase không nhằm test flow tạo tiền điều kiện đó; setup qua `api`/`factory`/`test_hook`/`pre_existing`, UI chỉ làm behavior chính của case. Mock/test double chỉ dùng cho dependency ngoài scope (fault injection), không mock behavior đang test. Không dùng DB để DỰNG state (chỉ `api`/`factory`/`test_hook`/`pre_existing`); verify state có thể dùng read-only UAT DB qua guarded client (read-only, chỉ SELECT) khi API/UI không expose.
- `Setup Source` phải CỤ THỂ, đủ để Phase 2 dùng trực tiếp, KHÔNG ghi chung chung:
  - `api`: method + endpoint + payload skeleton, ví dụ `POST /api/v1/resources { type:"parent", children:["A","B","C"] }`.
  - `factory`/`test_hook`: tên factory/hook + tham số, ví dụ `userFactory.setActionCount(userId, 2)`.
  - `pre_existing`/`pre_existing_fixture`: định danh fixture cụ thể (id/code/class code), không ghi "user bất kỳ".
  - Endpoint/payload phải lấy từ Swagger đã fetch ở `requirements/swagger/`; KHÔNG bịa endpoint. Nếu Swagger không có cách setup state, đặt `Automation Readiness = Needs hook` hoặc `Manual-only` và ghi rõ hook/manual steps đề xuất.
  - Nếu precondition phụ thuộc precondition khác, ghi `(depends PRE-xx)` trong `Setup Source`.
- `Setup Verification`: cách xác nhận setup thành công TRƯỚC khi assert, ví dụ `GET /api/v1/resources?parentId={id} trả 3 mục con` hoặc `GET /api/v1/users/{id} trả action_count=2`. Nếu API/UI không expose state cần verify: có thể dùng **read-only UAT DB** qua guarded client `tests/support/setup/db/uatPgClient.ts` (read-only, chỉ SELECT) làm verification, ví dụ `db_readonly: SELECT count(*) FROM ... WHERE ...`; nếu cả DB UAT cũng không expose → đặt `Automation Readiness = Needs hook`/`Manual-only`. KHÔNG dùng DB để DỰNG state.
- `Cleanup/Rollback`: hành động rollback cụ thể (ưu tiên scope theo `RUN_ID`) hoặc `none` + lý do. `state_mutation` và data tạo mới BẮT BUỘC có cleanup hoặc lý do không cleanup được.
- `Automation Readiness`:
  - `Ready`: Phase 2 tự setup hoàn toàn qua `api`/`factory`/`pre_existing` đã verify được bằng UI/API/fixture/hook an toàn. Phase 2 KHÔNG được skip các TC này vì lý do setup.
  - `Needs hook`: cần test hook/setup endpoint chưa tồn tại. Đây là blocker cần bổ sung; Phase 2 ghi blocker và đề xuất hook, không false-pass, không skip âm thầm.
  - `Manual-only`: setup không thể tự động hóa nếu không can thiệp DB/backend state. Đây là cơ sở DUY NHẤT để Phase 2 skip TC vì setup, và phải kèm lý do/manual steps.
- `Linked TC IDs`: danh sách TC dùng precondition này (trace ngược).

Ví dụ catalog:

| PRE-01 | Tài khoản Admin đã đăng nhập, session hợp lệ | auth_session | api | `POST /api/v1/auth/login { username:"<admin>" }` → lưu token | `GET /api/v1/auth/me` trả role=admin | none (session read-only) | Ready | APP_ORDER_TC_001, APP_ORDER_TC_002 |
| PRE-05 | Bản ghi nghiệp vụ "parent" tồn tại với 3 mục con | state_exist | api | `POST /api/v1/resources { type:"parent", children:["A","B","C"] }` (depends PRE-01) | `GET /api/v1/resources?parentId={id}` trả 3 mục con | `DELETE /api/v1/resources/{parentId}` theo RUN_ID | Ready | APP_ORDER_TC_010 |
| PRE-09 | User đã đạt giới hạn thao tác (max 2 lần) | state_mutation | test_hook | `userFactory.setActionCount(userId, 2)` (depends PRE-01) | `GET /api/v1/users/{id}` trả action_count=2 | reset action_count của userId theo RUN_ID | Needs hook | APP_PROFILE_TC_023 |

---

# Yêu cầu coverage và risk

Trước khi sinh TC, thực hiện:

## 0. Coverage Map bắt buộc
Tạo coverage map nội bộ trước khi viết testcase. Map phải bao gồm:
- User Story / Business Rule / Acceptance Criteria.
- UI screen/state/action.
- Form field và validation rule.
- API endpoint/method/query/path/body/schema.
- Permission/role.
- Error state và rollback.
- Cross-system sync side-effect.
- Vùng ảnh hưởng ngoài scope: bề mặt dùng chung mà story đụng tới (data/entity/field, endpoint, component/rule, status/enum, calc/report, permission, job/event) và feature khác phụ thuộc (xem mục 17).

Mỗi rule/AC trong scope phải có ít nhất 1 testcase trace được qua tên case hoặc nội dung expected.
Nếu không thể cover rule nào vì thiếu requirement/data/API, vẫn ghi vào phần Coverage Gap sau bảng.

## 1. Xác định Risk Level cho từng chức năng
- **High Risk** → sinh 10-15 TCs, bao phủ toàn bộ edge cases
- **Medium Risk** → sinh 5-10 TCs
- **Low Risk** → sinh 2-5 TCs (happy path + 1-2 negative)

Không giảm số lượng testcase bằng cách gộp nhiều rule khác nhau vào một case nếu việc gộp làm steps/expected mơ hồ.

## 2. Áp dụng kỹ thuật thiết kế TC
- **Equivalence Partitioning (EP)**: chia input thành nhóm valid/invalid
- **Boundary Value Analysis (BVA)**: test giá trị biên (min, min-1, max, max+1)
- **Decision Table**: cho logic nhiều điều kiện kết hợp
- **State Transition**: cho workflow có trạng thái. Với entity có vòng đời trạng thái, BẮT BUỘC sinh đủ ma trận `status x action` (vd View/Edit/Cancel theo từng status), gồm cả action bị chặn ở mỗi status.
- **Không gộp biên vào 1 TC**: mỗi giá trị biên/đại diện partition là 1 TC riêng để steps/expected không mơ hồ.

**Cách dựng — ví dụ mẫu (áp dụng khi applicable, không copy nguyên):**

*Decision Table* (logic nhiều điều kiện → liệt kê ma trận, mỗi combination quan trọng = 1 TC, gồm nhánh else):

| # | ĐK1: có tồn kho | ĐK2: đã thanh toán | Kết quả kỳ vọng |
|---|---|---|---|
| 1 | Có | Có | Cho đặt hàng → 200 |
| 2 | Có | Chưa | Chặn → "Cần thanh toán trước" |
| 3 | Hết | Có/Chưa | Chặn → "Hết hàng" (else, không cần xét ĐK2) |

*State Transition* (entity có vòng đời → ma trận `status × action`, gồm cả action bị chặn):

| Status hiện tại | Action | Kỳ vọng (transition hợp lệ hay bị chặn) |
|---|---|---|
| Pending | Approve | → Approved (hợp lệ) |
| Pending | Cancel | → Cancelled (hợp lệ) |
| Approved | Edit | Bị chặn (Approved không cho sửa) — negative TC |
| Cancelled | Approve | Bị chặn — negative TC |

## 3. Field-Level Validation (QUAN TRỌNG)
Mỗi input field phải có TC validation riêng:

| Field Type | TCs bắt buộc |
|---|---|
| **Text (string)** | Empty, whitespace-only (phải bị từ chối), trim đầu/cuối, quá ngắn (min-1), đúng min, quá dài (max+1), đúng max, unicode tiếng Việt (phải nhận), **emoji/ký tự 4-byte** (nhận hay chặn theo spec, không vỡ/`????`), special chars `<>&"'` (phân biệt: hiển thị đúng vs chặn injection/XSS) |
| **Email** | Format sai (thiếu @, thiếu domain), trùng tài khoản đã có, quá dài |
| **Password** | Quá ngắn (min-1), đúng min, thiếu uppercase, thiếu number, thiếu special char (theo rule); **chặn paste/autofill vào field confirm nếu spec yêu cầu nhập tay** |
| **Number** | Kiểu string, số âm, số 0, vượt max, số thập phân (nếu integer) |
| **Dropdown/Enum/Filter** | Không chọn (required); **kiểm kê option** (đủ số lượng + đúng label/thứ tự/default so spec — mục 12); **1 case đại diện** — Dữ liệu Test ghi 1 giá trị mẫu, KHÔNG tạo 1 TC/giá trị (nổ case), nhưng steps/expected ghi rõ "lặp qua **tất cả** option, mỗi option lọc đúng tập con của nó" để Phase 2 execute vét hết; option **khác lớp hành vi** (đổi kết quả/nhánh/field/quyền) tách TC riêng; option đặc biệt "Tất cả"/"Khác"/empty; default; reset |
| **Date** | Format sai, ngày không tồn tại (31/2), ngày quá khứ/tương lai (theo rule) |
| **Date/Month filter** | Mặc định đúng (vd tháng hiện tại); tháng 28 / 29 (năm nhuận) / 30 / 31 ngày; số cột/ô động phải khớp số ngày của tháng; tháng không có dữ liệu; đổi tháng -> bảng cập nhật lại |
| **Time (HH:mm)** | Biên 00:00 và 23:59; start == end; start > end (phải chặn); sai format; thiếu leading zero |
| **Computed/derived field** | Mỗi field auto-derive (deadline = ngày tạo + N, approver mặc định, file naming, mapping) phải có TC kiểm derivation + 1 biên (vd deadline rơi qua cuối tháng/cuối năm, timezone) |
| **File upload** | Sai format, đúng dung lượng max (boundary) vs vượt max (max+1), file rỗng/0 byte, đúng số lượng max vs file thứ (max+1), upload từ Resource có sẵn |

## 4. UI Coverage Checklist
Mỗi màn hình trong scope phải có testcase cho các nhóm sau nếu applicable:
- Navigation và default state.
- Loading state.
- Has data state.
- Empty state.
- Error state/API fail.
- Permission/role state.
- Search/filter/sort/pagination.
- Create/Edit/Delete/Cancel/Confirm.
- Modal/toast/validation message.
- Responsive hoặc layout critical nếu requirement/design có đề cập.
- **Mobile-web behavior (nếu scope có mobile web/responsive)** — KHÁC "responsive viewport" thuần: khi app có hành vi riêng trên mobile thật (touch/UA/isMobile), sinh case cho:
  - **Touch target ≥ 44px** (Apple HIG; Google Material 48dp) cho nút/link bấm được — bắc cầu accessibility (`scripts/qa/accessibility_check.js`).
  - **Cử chỉ cảm ứng**: tap (không phải click), swipe, scroll động, pull-to-refresh nếu có.
  - **Thành phần mobile-only**: hamburger menu, bottom sheet, drawer — hiện/ẩn đúng so desktop.
  - **Orientation**: portrait ↔ landscape reflow đúng, không mất nội dung/nút.
  - **Mạng yếu/offline**: slow-3G / offline giữa chừng → báo lỗi, không crash, không tạo bản ghi mồ côi (bắc cầu mục 8 Resilience).
  - Ghi rõ thiết bị mục tiêu (vd iPhone 13 / Pixel 7). Không áp dụng → `N/A + lý do`.
- Design/Visual compliance: đối chiếu token thiết kế (màu, font, border-radius, spacing, kích thước, thứ tự/alignment button) với Figma nếu task có design — chi tiết ở mục 11.

## 5. API Coverage Checklist
Mỗi endpoint liên quan trong Swagger phải có testcase cho các nhóm sau nếu applicable:
- Success request với query/path/body cụ thể.
- Required field missing.
- Invalid format/type.
- Duplicate/conflict/business rule violation.
- Not found với id không tồn tại.
- Unauthorized thiếu token.
- Forbidden role không đủ quyền.
- Response schema/business values quan trọng.

## 6. E2E Coverage Checklist
Mỗi luồng liên hệ nhiều hệ thống phải có testcase cho:
- Positive full flow.
- Negative/rollback khi bước giữa fail.
- Sync dữ liệu sau thao tác.
- Count/status ở màn list/detail liên quan.
- Evidence/upload nếu business flow yêu cầu.

## 7. Export/Import & File Output Coverage
Mỗi chức năng export/import phải có testcase verify (nếu applicable):
- Tên file đúng format (kèm tham số tháng/năm/filter trong tên).
- Tên sheet, header, thứ tự cột; mapping 1:1 field UI -> cột file.
- Số dòng = số bản ghi sau filter; export theo từng filter và filter kết hợp (kết quả là giao điều kiện).
- Ô rỗng đúng nghĩa (vd ngày không có dữ liệu -> cột trống, không phải 0).
- Dynamic columns theo data (vd số cột ngày = số ngày trong tháng đang chọn).
- Dataset lớn (>=100 bản ghi) không mất dòng/không timeout.
- Ký tự đặc biệt/Unicode trong cell hiển thị đúng; mở file không lỗi.
- Empty state: filter không khớp -> file rỗng/chỉ header, không crash.

## 8. Resilience / Concurrency / Interaction Coverage
Cho mỗi action async (submit/export/approve/upload), nếu applicable:
- Mất mạng/timeout giữa chừng -> báo lỗi, không crash, không tạo bản ghi mồ côi.
- Double-click / double-submit -> không tạo 2 bản ghi / 2 file trùng.
- Lặp lại thao tác đã hoàn tất (idempotency), vd Cancel nhiều lần liên tiếp.
- Loading/disabled state đúng trong lúc chờ.

## 9. Side-effect / Notification Coverage
Với mỗi side-effect (email, in-app noti, webhook, sync sang hệ thống khác), nếu applicable:
- Đúng người nhận (gửi đúng đối tượng, KHÔNG gửi cho người không liên quan).
- Thời điểm phát sinh (gửi ngay sau commit, không delay quá ngưỡng).
- KHÔNG phát sinh khi thao tác fail/validate lỗi (negative).
- Nội dung/format đúng spec.

## 10. Cross-layer Guard Coverage
Với mỗi ràng buộc thể hiện ở UI (disable/ẩn action theo status/role, field readonly):
- Phải có testcase negative bypass qua API/URL trực tiếp và kỳ vọng backend chặn (403/422), không chỉ kiểm UI ẩn/disable.

## 11. Design/Visual Compliance Coverage (đối chiếu Figma) — nếu task có thiết kế
Ngoài kiểm chức năng, nếu task có Figma/design thì phải có testcase đối chiếu **độ trung thực thiết kế ở mức token** cho các component chính (button, modal, input, header, menu item, table, card):
- **Màu (color token)**: background / text / border của component so mã màu Figma (hex/rgb).
- **Typography**: font-family, font-size, font-weight, line-height theo Figma.
- **Bo góc & viền**: border-radius, border width.
- **Kích thước**: width/height component so Figma.
- **Spacing**: padding trong component + khoảng cách (gap) giữa các component.
- **Bố cục/alignment**: thứ tự & căn chỉnh (VD `Cancel` bên trái / `Confirm` bên phải), các phần tử cùng hàng.
- **Trạng thái**: token cho state (hover/active/disabled/selected) nếu design có.

Nguyên tắc:
- Lấy token expected từ đúng **Figma node/frame** của màn (fills, `style.fontSize/fontWeight`, `cornerRadius`, `itemSpacing`/`padding`, `absoluteBoundingBox`). KHÔNG tự bịa màu/size.
- Phase 2 verify bằng `getComputedStyle` + `boundingBox` so token, dùng **dung sai** (VD màu lệch ≤8/kênh, radius ±2px, size ±8px, font-size ±1px).
- **Kiểm vị trí TƯƠNG ĐỐI** (thứ tự, alignment, gap giữa components), KHÔNG so toạ độ x/y tuyệt đối của canvas Figma → tránh false-fail do responsive/scroll/dynamic data.
- Nếu task KHÔNG có Figma/design → ghi `N/A + lý do` trong Coverage Gaps; không bỏ qua im lặng.

## 12. Display/Field Conformance Coverage (đối chiếu tài liệu) — BẮT BUỘC cho mọi màn có bảng/danh sách/field

Đây là dimension **TÁCH RIÊNG** khỏi chức năng (mục 4) và design-token (mục 11): kiểm **hình thức hiển thị đúng như đặc tả**, để KHÔNG lọt lỗi nhỏ về tên cột, format, thứ tự, thiếu field. Đây là nơi thường bị miss nhất khi test bằng automation.

**Nguyên tắc nguồn-sự-thật (QUAN TRỌNG NHẤT — chống oracle tautological):**
- Giá trị `Kết quả mong đợi` của MỌI case hiển thị phải **TRÍCH NGUYÊN VĂN từ FS/Figma/tài liệu**, TUYỆT ĐỐI KHÔNG lấy từ giao diện build đang chạy. Recon build chỉ để biết *cách locate element*, KHÔNG để lấy *giá trị đúng*. Nếu expected suy từ build → testcase thành "build == build" → vĩnh viễn không bắt được sai lệch so với spec.
- Mỗi bảng "Name / Data type / Description" (hoặc bảng field/cột) trong FS là **checklist bắt buộc**: sinh case cho từng dòng, không bỏ sót field nào.

**Với mỗi màn có bảng/danh sách/field, sinh case ATOMIC — mỗi (phần tử × thuộc tính) là 1 case:**
- **Tên cột / label**: đúng CHÍNH XÁC từng ký tự theo tài liệu (vd cột phải là `Check-in`, KHÔNG phải `Checkin Time`).
- **Định dạng dữ liệu (format)**: đúng format tài liệu quy định — ngày, giờ (`hh:mm`), datetime (`DD/MM/YYYY hh:mm hh:mm`), số/tiền/công (số chữ số thập phân). 1 case cho mỗi field có format.
- **Số lượng cột + đủ tên + đúng thứ tự**: bảng phải có ĐÚNG các cột tài liệu liệt kê, đúng thứ tự → bắt cột thiếu/thừa/sai tên (1 case/bảng, liệt kê danh sách cột expected verbatim).
- **Field bắt buộc hiển thị**: mọi field tài liệu mô tả phải có mặt (kể cả field chỉ áp dụng 1 nhóm đối tượng → xác nhận rule ẩn/hiện theo spec).
- **Empty-state text / placeholder / label nút / label tab / tiêu đề màn-modal**: đúng chuỗi tài liệu.
- **Giá trị "để trống" đúng nghĩa** (vd buổi chưa diễn ra → cột công **trống**, KHÔNG phải `0`).

**Khung hoài nghi bắt buộc**: giả định build CÓ THỂ lệch tài liệu; nhiệm vụ là ĐỐI CHIẾU ngược build vs tài liệu và liệt kê MỌI khác biệt (kể cả nhỏ: hoa/thường, `-` vs `/`, thiếu 1 cột). KHÔNG mặc định build đúng, KHÔNG tự lọc bỏ "lỗi nhỏ".

Nếu màn không có đặc tả hiển thị bằng text (chỉ có Figma) → lấy expected từ Figma; nếu không có cả hai → ghi `N/A + lý do` trong Coverage Gaps, không bỏ qua im lặng.

## 13. Business Logic / Calculation / Data Consistency Coverage (BẮT BUỘC khi scope có tính toán, rule tổ hợp, hoặc dữ liệu hiển thị nhiều nơi)

Đây là nơi bug **logic hệ thống** hay lọt nhất: UI/field trông đúng nhưng **giá trị/kết quả sai**. Mọi expected trong nhóm này phải là **giá trị cụ thể tính độc lập từ input đã biết** (oracle độc lập), TUYỆT ĐỐI KHÔNG lấy từ chính build đang chạy.

- **Calculation/Formula**: mỗi giá trị được TÍNH (tổng, subtotal, thuế, phí, giảm giá, số dư, điểm, %, trung bình, đếm, quy đổi đơn vị/tỉ giá) có TC verify bằng **con số cụ thể tự tính tay** từ input — KHÔNG chấp nhận "hiển thị đúng". Kèm ≥1 biên (giá trị rơi đúng mốc làm tròn, chia dư, số 0, số âm).
- **Rounding & precision**: quy tắc làm tròn (round half-up/banker), số chữ số thập phân, tiền VND không thập phân. 1 TC cho giá trị rơi đúng ranh giới làm tròn (vd `.5`).
- **Decision table đầy đủ**: rule tổ hợp nhiều điều kiện → liệt kê ma trận `điều kiện × kết quả`; mỗi combination quan trọng (nhất là cặp điều kiện xung đột/ưu tiên) là 1 TC riêng, gồm cả nhánh else/default.
- **Ordering/Sorting**: verify THỨ TỰ thực tế của toàn danh sách theo rule (mới nhất/alphabet/priority/custom), tie-break khi trùng khóa, asc/desc, sort kết hợp filter.
- **Aggregation vs detail**: tổng/đếm ở màn list/summary phải KHỚP tổng cộng các dòng chi tiết (vd "Tổng 5 mục" = đúng 5 dòng; "Doanh thu tháng" = Σ order trong tháng). 1 TC đối chiếu trực tiếp 2 con số.
- **Data consistency đa màn/đa nguồn**: cùng một dữ liệu hiển thị ở ≥2 nơi (list vs detail, card summary vs bảng, 2 app cross-sync) phải GIỐNG NHAU. 1 TC so sánh trực tiếp giá trị 2 nơi, không kiểm rời từng nơi.
- **Before/after mutation (delta đúng)**: sau create/edit/delete/approve, giá trị dẫn xuất (count, tổng, số dư, trạng thái, danh sách) cập nhật ĐÚNG DELTA (xóa 1 mục → tổng giảm đúng 1 và đúng phần tiền của mục đó). 1 TC chụp giá trị trước và sau, so delta.
- **Filter/Search logic**: kết quả = đúng tập con thỏa điều kiện (không thừa/thiếu); filter kết hợp = giao điều kiện; search khớp đúng field & mode (contains/exact/không dấu); reset trả full.
- **Phủ option của dropdown/filter (1 case đại diện ở gen, execute vét hết giá trị)**: KHÔNG tạo 1 TC cho mỗi giá trị (nổ số case). Thay vào đó — (a) **kiểm kê option**: 1 TC verify đủ số option + đúng label/thứ tự/default so spec (mục 12/14); (b) **1 case hành vi đại diện**: Dữ liệu Test ghi 1 giá trị mẫu, nhưng steps/expected nêu rõ "lặp qua **tất cả** option, mỗi option lọc đúng tập con của nó" → Phase 2 execute chạy data-driven **vét hết** giá trị (không dừng ở giá trị mẫu); (c) option **khác lớp hành vi** (đổi kết quả/nhánh, ra empty, hiện thêm field, đổi quyền, đổi công thức) → tách TC riêng vì expected khác. Luôn thêm default, empty/no-match, reset, và giao điều kiện khi filter kết hợp.
- **Conditional display/derivation logic**: field/section chỉ hiện theo điều kiện (role/status/loại) → TC cả nhánh hiện lẫn nhánh ẩn; giá trị auto-derive (default approver, deadline, mã tự sinh, mapping trạng thái) verify đúng công thức + 1 biên.
- **Timezone/Date logic**: giá trị ngày/giờ tính đúng timezone, qua mốc nửa đêm/đổi ngày, DST nếu có; "hôm nay/tuần này/tháng này" tính đúng biên.

## 14. BE Response Data Conformance Coverage (BẮT BUỘC cho mọi màn/endpoint có dữ liệu từ BE)

Tách riêng khỏi API contract (mục 5, thiên status/schema): nhóm này kiểm **GIÁ TRỊ dữ liệu BE trả về** và **mapping BE → UI** — nơi bug "field trống / sai giá trị / thiếu field" hay lọt.

- **Value đúng, không chỉ schema**: response chứa đúng GIÁ TRỊ nghiệp vụ (id/tên/số/trạng thái/quan hệ), không chỉ đúng kiểu. TC assert giá trị cụ thể.
- **Null vs empty vs missing vs 0**: phân biệt rõ `null` / chuỗi `""` / mảng `[]` / thiếu hẳn key / `0`. TC xác định BE PHẢI trả trạng thái nào theo spec (vd "chưa có công" → field vắng hay `null` hay `0`?), vì UI render mỗi trạng thái mỗi khác.
- **BE → UI mapping (field trống nghi ngờ)**: mỗi field UI hiển thị trống/`-`/`N/A` phải có TC đối chiếu response — BE có trả giá trị không? BE trả có mà UI trống = **FE bug**; BE trả rỗng trái spec = **BE bug**; cả hai đều là product bug, KHÔNG bỏ qua.
- **Foreign key resolution**: id tham chiếu resolve đúng tên/label (vd `ownerId` → đúng tên owner), không lộ id thô, không `undefined`/`[object Object]`.
- **Enum/status value**: BE trả đúng tập enum hợp lệ; UI map đúng nhãn từng enum; enum lạ/không map → xử lý an toàn.
- **Pagination/metadata**: `total`/`page`/`pageSize`/`hasNext` đúng; `total` khớp số bản ghi thực; trang cuối/trang rỗng đúng; đổi pageSize không mất/nhân đôi bản ghi.
- **Nested/list completeness**: object lồng & mảng trả đủ phần tử con (không cắt cụt), đúng thứ tự; mỗi phần tử đủ field cho UI.
- **Default value từ BE**: field có default do BE set (trạng thái khởi tạo, cờ, ngày tạo) trả đúng default.
- **Serialization**: date/number serialize đúng (ISO/epoch, number vs string, đơn vị tiền/giờ), không lệch timezone, không mất độ chính xác.
- **Sensitive/internal field**: response KHÔNG lộ field nội bộ/nhạy cảm (password hash, token, internal flag, PII vượt quyền) — bắc cầu mục 15.
- **Error payload**: response lỗi trả đúng `code`/`message`/`field` theo spec để UI hiển thị đúng; không nuốt lỗi thành `200` rỗng.

## 15. Security Coverage (BẮT BUỘC — mở rộng ngoài XSS/auth cơ bản)

Ngoài special-char ở field (mục 3) và unauthorized/forbidden cơ bản (mục 5, 10), mỗi scope có dữ liệu/quyền phải cân nhắc các nhóm sau (sinh TC nếu applicable):

- **AuthN token**: không token / token sai-hỏng / hết hạn / token của user khác → BE chặn đúng (401/403), không rò dữ liệu.
- **AuthZ dọc (privilege escalation)**: role thấp gọi thẳng API/URL chức năng role cao → 403; UI ẩn nút KHÔNG đủ, phải chặn ở BE.
- **AuthZ ngang (IDOR)**: user A đổi id trong path/body/query sang resource của user B (hoặc org/tenant khác) → 403/404, KHÔNG trả data của B. BẮT BUỘC cho mọi endpoint có id resource.
- **Injection**: SQL/NoSQL ở field & query param (`' OR '1'='1`), XSS stored (lưu `<script>` rồi mở lại ở màn khác), XSS reflected (echo qua search/error), command/template injection nếu input đi tới hệ thống ngoài → phải bị escape/chặn, không thực thi.
- **Mass assignment / over-posting**: gửi thêm field không được phép (`role`, `isAdmin`, `status`, `price`, `ownerId`...) vào body create/update → BE bỏ qua, KHÔNG cho ghi đè.
- **Sensitive data exposure**: response/UI/log/URL không lộ password/token/hash/secret/PII vượt quyền; PII phải mask; không đẩy secret qua query string.
- **File upload security** (nếu có upload): file thực thi (`.php/.exe/.svg` có script), sai MIME giả extension, path traversal tên file (`../../`), file quá lớn, zip bomb → bị từ chối/khử trùng.
- **Rate limiting / brute force** (nếu applicable): lặp login sai/OTP/endpoint nhạy cảm nhiều lần → khóa/chậm/captcha, không brute force vô hạn.
- **Session/logout**: sau logout token cũ vô hiệu; đổi mật khẩu → session cũ vô hiệu (nếu spec); cookie nhạy cảm `HttpOnly`/`Secure` nếu kiểm được.
- **CORS/headers** (nếu applicable & kiểm an toàn được): CORS không cho origin lạ đọc dữ liệu có auth.

Ràng buộc thể hiện ở UI luôn phải có TC bypass thẳng BE (đồng bộ mục 10). Nhóm không áp dụng / không kiểm an toàn được ở môi trường test → `N/A + lý do` trong Coverage Gaps.

> **Executable ở Phase 2 (BASIC, non-destructive):** security headers/cookie flags, truy cập chưa auth (401/403), ma trận authz + IDOR (2 tài khoản test), sensitive-data exposure, transport http→https chạy thật bằng `scripts/qa/security_check.js` (skill `security_check`, **GET/read-only, never-auto, cần `--confirm-nonprod`**). Control → PASS/FAIL; exposure → finding (mask PII). **Fuzzing/khai thác SQLi-XSS/brute-force/rate-limit → Manual-only + OWASP ZAP opt-in**, chỉ chạy khi có phê duyệt người + target non-prod. Thiếu 2 tài khoản test → authz/IDOR = `needs_account`.

## 16. Performance / Load / Stress Coverage (sinh khi requirement có SLA hoặc scope có dữ liệu lớn/đồng thời)

Kit thiên functional; nhóm này CHỈ sinh khi có ngưỡng/tải trong scope hoặc rủi ro cao, và **ghi rõ ngưỡng lấy từ đâu** (SLA/NFR/spec). Không có ngưỡng → `N/A + lý do`, KHÔNG bịa số.

> **Executable ở Phase 2:** phần deterministic (web vitals, API response time so SLA, large-dataset render, resource weight) chạy thật bằng `scripts/qa/perf_check.js` (skill `perf_check`, threshold-gated, median N lần) — ngưỡng khai trong catalog `perf`. Verdict là **advisory** (UAT nhiễu), không tự thành product bug.

- **Response time / SLA**: endpoint/màn quan trọng phản hồi trong ngưỡng NFR (vd list < 2s). TC đo thời gian thực tế so ngưỡng đã nêu.
- **Large dataset**: list/table/export với ≥100 (hoặc ngưỡng spec) bản ghi — render/pagination/scroll không mất dòng, không timeout, không treo (bắc cầu mục 7).
- **Pagination/virtual scroll**: trang lớn không nhân đôi/nhảy dòng; thời gian chuyển trang ổn định.
- **Concurrent action**: N user/N request đồng thời lên cùng resource (đặt chỗ, trừ kho, duyệt) → không oversell/double-count, tranh chấp xử lý đúng (bắc cầu mục 8).
- **Payload/limit**: input/list ở kích thước tối đa cho phép không hỏng response; vượt max → chặn có kiểm soát, không `500`.
- **Symptom N+1/slow**: thao tác trên list lớn không phình thời gian phi tuyến nếu quan sát được.

**Load thật (nhiều VU — Loại B: load/stress/soak)** dùng tool tải chuyên: **opt-in qua `scripts/qa/load_check.js` (skill `load_check`, wrapper k6)** — k6 là binary NGOÀI (không phải npm dep; thiếu → skip sạch), **never-auto, chỉ non-prod, cap khiêm tốn**, KHÔNG nhét vào runner Playwright. k6 hợp kit hơn JMeter; **Katalon KHÔNG phải load tool**. (Loại A single-user: timing/vitals/render/resource → `perf_check.js`.) Ngưỡng lấy từ NFR khai trong k6 `thresholds`.

## 17. Change Impact / Regression Ripple Coverage (BẮT BUỘC khi story thêm/sửa/xoá làm thay đổi thứ dùng chung)

Bắt lỗi **"sửa 1 feature con → vỡ feature khác"** — thứ requirement của story KHÔNG mô tả nhưng hay gây incident. TÁCH RIÊNG khỏi Side-effect (mục 9 — output của chính action) và Data Consistency (mục 13 — trong scope).

**Bước 1 — Bề mặt dùng chung mà thay đổi ĐỤNG tới.** Nếu có `requirements/git-impact.md` (skill `git_impact_analyzer`), dùng nó làm danh sách bề mặt thay đổi **thực tế từ git diff** làm điểm khởi đầu thay vì chỉ đọc code đoán — vẫn tự soi bổ sung và giữ flag `QA confirm` cho phần không chắc. Nếu thay đổi cô lập (không đụng gì chung) → ghi `N/A: no shared surface` ở Coverage Gaps, KHÔNG sinh bừa. Soi các bề mặt:
- Data/entity/field chung (thêm field, đổi kiểu/default, migration).
- Endpoint/API chung (đổi payload/response/status code).
- Component/validation/business rule/util dùng lại.
- Status/enum chung (thêm/đổi giá trị).
- Calculation/aggregate/report chung nguồn.
- Permission/role/guard chung.
- Job/trigger/event/queue/cron chung.

**Bước 2 — Map feature KHÁC phụ thuộc bề mặt đó** (suy từ code/testcase cũ/requirement/coverage map). Cái không suy được → flag QA (Bước 3).

**Bước 3 — Sinh regression cho feature bị ảnh hưởng (SMOKE, không re-test full):**
- **Smoke flow chính**: mỗi feature bị ảnh hưởng có ≥1 TC xác nhận flow chính vẫn đúng sau thay đổi (vd thêm field vào entity → list/detail/export/search của feature khác vẫn đúng, không lỗi, không lệch cột).
- **Backward-compat**: bản ghi/dữ liệu CŨ (tạo trước thay đổi) vẫn hiển thị/xử lý đúng.
- **Contract**: consumer khác của endpoint không vỡ (field mới optional; KHÔNG đổi kiểu/bỏ field cũ mà không kiểm).
- **Shared rule/calc**: đổi validation/công thức chung → form/flow/report khác dùng lại vẫn đúng theo rule mới, không bị đổi ngoài ý muốn.

**Nguyên tắc:**
- **Theo tỉ lệ**: chỉ ripple khi thật sự đụng bề mặt chung; regression là SMOKE, KHÔNG nhân full-suite cho mọi feature.
- **Flag, không bịa**: feature nghi ảnh hưởng mà thiếu code/spec/testcase cũ để xác minh → ghi `Nghi ảnh hưởng — QA confirm` vào Coverage Gaps; KHÔNG dựng impact ảo, KHÔNG im lặng bỏ qua.
- Mỗi regression case trace rõ: `đụng <bề mặt chung> → ảnh hưởng <feature>`.

## 18. Self-check vét cạn biên (BẮT BUỘC trước khi kết thúc)
Tự rà và ghi vào `reports/phase1-summary.md` (Coverage Gaps) nếu thiếu:
- [ ] Mỗi input đã đủ EP + BVA (min-1/min/max/max+1), không gộp biên vào 1 TC.
- [ ] Mỗi màn list/filter có dynamic data đã test theo count + biên ngày/tháng/năm nhuận.
- [ ] Mỗi export/import đã verify cấu trúc file + mapping cột + empty + dataset lớn.
- [ ] Mỗi side-effect (mail/noti/sync) có ít nhất 1 negative (không phát sinh khi fail).
- [ ] Mỗi UI guard (theo status/role) có 1 cross-layer check (API/URL bypass).
- [ ] Mỗi entity có status đã sinh đủ ma trận status x action (+ no-op edit, + idempotent repeat).
- [ ] Mỗi computed field (deadline/approver/naming/mapping) có TC kiểm derivation + 1 biên.
- [ ] Nếu có Figma: mỗi component chính có TC design compliance (màu/font/radius/spacing/kích thước/alignment) đối chiếu token thiết kế.
- [ ] Nếu scope có mobile web: có TC mobile-web behavior (touch target ≥44px, cử chỉ tap/swipe, hamburger/bottom-sheet, orientation, offline/slow-3G) trên thiết bị thật; không áp dụng → `N/A + lý do` (mục 4).
- [ ] Mỗi màn có bảng/field: đã có case đối chiếu **tên cột (exact)**, **format từng field**, **số cột + thứ tự + đủ tên**, **field bắt buộc**, **empty-state/label/placeholder** — và mọi expected hiển thị được **trích từ tài liệu, KHÔNG từ build** (mục 12).
- [ ] Mỗi giá trị được TÍNH/tổng/đếm/sort có TC verify bằng **con số cụ thể tự tính** + 1 biên làm tròn; mỗi dữ liệu hiển thị ≥2 nơi có TC so khớp; mỗi mutation có TC so **delta** trước/sau (mục 13).
- [ ] Mỗi field trống/`-`/`N/A`/`0` nghi ngờ có TC đối chiếu response BE (phân biệt `null`/`""`/`[]`/thiếu key/`0`), FK resolve đúng tên, pagination `total` khớp — không lấy oracle từ build (mục 14).
- [ ] Mỗi endpoint có id resource có TC IDOR; mỗi chức năng theo role có TC privilege bypass BE; input nhạy cảm có TC injection/XSS stored; body create/update có TC mass-assignment; response không lộ field nhạy cảm (mục 15).
- [ ] Nếu có ngưỡng SLA/tải trong scope: có TC đo response time so ngưỡng, large dataset, concurrent — kèm nguồn ngưỡng; không có ngưỡng thì `N/A + lý do` (mục 16).
- [ ] Nếu story đụng bề mặt dùng chung (data/endpoint/component/rule/status/permission/job): mỗi feature khác bị ảnh hưởng có ≥1 regression smoke + backward-compat; feature nghi ảnh hưởng mà không tự xác minh được đã flag `QA confirm`. Thay đổi cô lập → ghi `N/A: no shared surface` (mục 17).

Nếu một dimension (mục 7-17) không áp dụng cho scope, ghi rõ `N/A + lý do` trong Coverage Gaps thay vì bỏ qua im lặng.

---

# Format output

Xuất kết quả dưới dạng bảng Markdown:

```markdown
| TC ID | Module | Trường hợp kiểm thử | Tiền điều kiện | Dữ liệu Test | Các bước thực hiện | Kết quả mong đợi | Ưu tiên | Mức độ rủi ro |
|---|---|---|---|---|---|---|---|---|
| App 1_LOGIN_TC_001 | Đăng nhập | [Positive] Đăng nhập thành công với email và mật khẩu hợp lệ | [PRE-01] Hệ thống chạy tại [URL], tài khoản auto_login_001@test.com Active, chưa đăng nhập | email: auto_login_001@test.com<br>password: Test@12345 | 1. Navigate đến [URL]/login<br>2. Nhập email: auto_login_001@test.com<br>3. Nhập password: Test@12345<br>4. Click button "Đăng nhập" | 1. Trang /login hiển thị đúng form đăng nhập<br>2. Field email nhận đúng giá trị đã nhập<br>3. Field password hiển thị ký tự ẩn<br>4. Sau khi click, hệ thống:<br>- Hiện loading spinner 1-3s<br>- Redirect /dashboard<br>- Toast "Đăng nhập thành công"<br>- Tên user hiển thị trên header | Highest | High |
```

Sau bảng, thêm:
- **Phân nhóm testcase:** Bảng nhóm chức năng → phạm vi → TC ID → tổng.
- **Setup Strategy (Hợp đồng tiền điều kiện):** Catalog `PRE-NN` theo schema mục 9; mọi precondition trong bảng testcase phải map được tới một `PRE-NN`.
- **Tổng TC:** X (Positive: A, Negative: B, Boundary: C, Edge: D)
- **Coverage:** Danh sách fields đã có TC validation
- **Risk Assessment:** Tóm tắt risk level từng chức năng
- **Coverage Matrix:** Mapping requirement/rule/AC/API endpoint → TC ID
- **Coverage Gaps:** Rule/flow chưa cover, lý do, đề xuất bổ sung
- **Testcase Review:** Đánh giá bộ testcase theo Coverage và Quality/Risk, dùng đúng format trong phần `Phase 1 Summary Report bắt buộc` bên dưới.
- **Assumptions:** Các assumption về data, role, API status code, field label hoặc business behavior

## Ngôn ngữ và encoding bắt buộc

- Toàn bộ testcase Markdown, Excel summary, Phase 1 summary report và `task.md` phải dùng tiếng Việt chuẩn có dấu.
- File phải lưu UTF-8.
- Không dùng tiếng Việt không dấu trong heading/nội dung report.
- Không để ký tự lỗi encoding/mojibake; nếu phát hiện phải sửa lại trước khi coi Phase 1 hoàn tất.
- Technical terms, endpoint, method, command, enum/status, code identifier có thể giữ nguyên tiếng Anh.

## Phase 1 Summary Report bắt buộc

Sau khi lưu Markdown testcase và export Excel, bắt buộc tạo/cập nhật report riêng:

`<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/reports/phase1-summary.md`

Report phải đủ chi tiết để review chất lượng bộ testcase mà không cần đọc toàn bộ file testcase:

1. **Tổng quan Phase 1**
   - Task key / module / scope.
   - Nguồn requirement đã đọc: Jira, Confluence, Figma, Swagger, file local.
   - Đường dẫn testcase Markdown, Excel đã export và trạng thái `Jira testcase publish: Pending QA confirmation`.
2. **Thống kê testcase**
   - Tổng số testcase đã gen/cập nhật.
   - Số testcase theo loại: Positive / Negative / Boundary / Edge.
   - Số testcase theo nhóm chức năng: lấy động từ phần trước dấu `/` trong cột `Module`; không hardcode danh sách nhóm của một task cụ thể.
   - Report phải liệt kê toàn bộ nhóm thực tế xuất hiện trong testcase, ví dụ với CRUD có thể là `Xem danh sách`, `Tạo`, `Sửa`, `Xóa`; với domain khác có thể là `Đăng nhập`, `Thanh toán`, `Báo cáo`, `Thông báo`,...
   - Số testcase theo layer/site: UI, API, E2E và các app/site thực tế trong scope nếu xác định được.
   - Số testcase theo priority và risk.
3. **Đánh giá Coverage và Quality/Risk**
   - Review bộ testcase automation theo đúng protocol trong section này.
   - Xác định tổng số requirement/business rule/API behavior nằm trong scope.
   - Mapping từng requirement với TC ID tương ứng.
   - Tính coverage bằng công thức:
     `Requirement Coverage = Covered Requirements / Total In-scope Requirements * 100%`
   - Chỉ tính requirement là covered khi có testcase trace rõ ràng, assertion đúng behavior, và testcase không bị skip nếu đã có execution result.
   - Phân loại từng requirement/gap theo risk: `Critical`, `High`, `Medium`, `Low`.
   - Không dùng công thức gap đơn giản kiểu `covered / (covered + gaps)` để thay thế requirement coverage.
   - Không kết luận `PASS` nếu còn bất kỳ open gap Critical/High, dù coverage tổng >= 80%.
   - Kiểm tra chất lượng từng testcase: trace requirement, step executable, expected cụ thể, assertion đúng business rule, phụ thuộc data/env, flaky risk, duplicate/overlap, skip/fail do script/setup.
4. **Format bắt buộc cho phần review trong Phase 1 summary**
   - `### Coverage Summary`
     `| Metric | Value | Comment |`
   - `### Risk-based Gate`
     `| Condition | Status | Reason |`
   - `### High/Critical Gaps`
     `| Gap | Risk | Impact | Required Action | Gate Blocking |`
   - `### Testcase Quality Issues`
     `| Testcase | Issue | Severity | Recommendation |`
   - `### Setup Readiness`
     `| Automation Readiness | Số PRE | Số TC ảnh hưởng | Ghi chú/Blocker |`
     Thống kê tổng hợp theo `Ready` / `Needs hook` / `Manual-only`; liệt kê rõ các `PRE-NN = Needs hook` (kèm hook đề xuất) và `Manual-only` (kèm lý do) vì đây là input cho gate Phase 2.
   - `### Precondition Execution Matrix`
     `| TC ID | Precondition | Type | Setup Method | Verification | Cleanup | Readiness | Blocker |`
     BẮT BUỘC. Một dòng cho MỖI TC trong scope, suy ra bằng cách join danh sách testcase với catalog `## Setup Strategy (Hợp đồng tiền điều kiện)`:
     - `Precondition`: `PRE-NN` (kèm mô tả ngắn); nếu TC dùng nhiều precondition thì liệt kê tất cả.
     - `Type`: giá trị `Precondition Type`.
     - `Setup Method`: giá trị `Setup Strategy` (`api`/`factory`/`test_hook`/`ui`/`pre_existing`/`manual`).
     - `Verification`: giá trị `Setup Verification`.
     - `Cleanup`: giá trị `Cleanup/Rollback`.
     - `Readiness`: `Ready` / `Needs hook` / `Manual-only`.
     - `Blocker`: missing capability cụ thể nếu `Needs hook` (hook/mock/sandbox nào còn thiếu) hoặc lý do nếu `Manual-only`; để `-` nếu `Ready`.
     Mục tiêu: trước Phase 2, QA/Automation nhìn vào matrix là biết ngay case nào automatable (`Ready`), case nào cần hook (`Needs hook`), case nào blocked (`Manual-only`/có Blocker).
   - `### Final Decision`
     Kết luận chỉ dùng một trong các trạng thái: `PASS`, `CONDITIONAL PASS`, `FAIL`, `BLOCKED`.
   - `Final Decision` phải có lý do ngắn gọn và điều kiện cần làm để đạt chuẩn nếu chưa `PASS`.
5. **Quality Gate**
   - Chỉ kết luận `PASS` khi thỏa tất cả:
     - Overall requirement coverage >= 80%.
     - Core/high-risk flows được cover đầy đủ.
     - Không còn open question Critical/High.
     - Không có testcase quan trọng bị skip.
     - Testcase có assertion rõ ràng, không chỉ kiểm tra UI/API response chung chung.
     - Negative case, permission/security case, rollback/error case được cover nếu nằm trong scope.
   - Kết luận `CONDITIONAL PASS` nếu coverage đủ ngưỡng và flow chính đã cover, nhưng còn gap/risk Medium/Low hoặc assumption cần xác nhận.
   - Kết luận `FAIL` nếu thiếu coverage cho flow quan trọng/high-risk, còn gap Critical/High, hoặc testcase quality không đủ tin cậy.
   - Kết luận `BLOCKED` nếu thiếu requirement/spec/testcase/execution data khiến không thể đánh giá trung thực.
6. **Checklist hoàn tất Phase 1**
   - Markdown testcase tồn tại.
   - Excel testcase tồn tại.
   - Phase 1 summary report tồn tại và có `### Setup Readiness` + `### Precondition Execution Matrix` (1 dòng/TC trong scope).
   - Section `## Setup Strategy (Hợp đồng tiền điều kiện)` tồn tại; mọi precondition trong bảng testcase có tag `[PRE-NN]` map tới catalog; không còn `PRE-NN` mồ côi.
   - Nếu matrix còn `Needs hook`/`Manual-only`: `reports/capability-request.md` tồn tại và liệt kê capability còn thiếu (loại/endpoint/PRE/TC/owner).
   - `task.md` đã được cập nhật đường dẫn output và trạng thái chờ QA xác nhận trước khi publish Jira testcase.

7. **Capability / Test-Hook Request (handoff Dev) — BẮT BUỘC khi còn `Needs hook`/`Manual-only`**

   Nếu `### Precondition Execution Matrix` có bất kỳ dòng `Needs hook` hoặc `Manual-only`, sinh file handoff:

   `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/reports/capability-request.md`

   Mục tiêu: gom mọi blocker thành MỘT danh sách capability để gửi Dev/BE/DevOps, thay vì để rải rác trong matrix và bị phát hiện lại ở từng task. Đây là input Definition of Ready trước Phase 2. Nếu tất cả `PRE-NN` đều `Ready`, chỉ ghi 1 dòng "Không có capability gap" (không cần bảng).

   Nội dung bắt buộc:
   - `## Tổng quan`: bảng đếm `Ready` / `Needs hook` / `Manual-only` (số PRE + số TC ảnh hưởng) — khớp `### Setup Readiness`.
   - `## Capability cần bổ sung`: bảng
     `| # | Loại | Tên/Endpoint đề xuất | Mục đích (state cần dựng) | PRE liên quan | TC bị chặn | Owner đề xuất | Trạng thái |`
     - `Loại` ∈ `test_hook` | `account/role` | `sandbox` | `api` | `config`. KHÔNG có `DB` (kit không nối DB — xem `RULE_GLOBAL.md`).
     - `Tên/Endpoint đề xuất`: cụ thể — vd `POST /test-hooks/<domain>/seed-*` theo contract `tests/support/setup/hooks/README.md`, hoặc "account role X có quyền Y", hoặc "sandbox VNPay/Zoom".
     - `Mục đích`: state cần dựng và vì sao `api`/`ui`/`fixture` không làm được an toàn.
     - `PRE liên quan` / `TC bị chặn`: trace ngược từ matrix.
     - `Owner đề xuất`: Dev/BE/DevOps/QA-Lead.
     - `Trạng thái`: mặc định `Requested`.
   - `## Ghi chú`: nhắc non-prod guard bắt buộc cho test hook; đây là gate capability trước Phase 2.

   Cập nhật đường dẫn `reports/capability-request.md` vào `task.md`.

## Export Excel bắt buộc

Sau khi lưu file Markdown testcase:
1. Export file Markdown sang Excel `.xlsx` bằng script có sẵn:
   ```bash
   node scripts/convert_excel/md_to_xlsx.js <testcase.md> <testcase.xlsx>
   ```
2. File Excel phải nằm cùng thư mục với file Markdown và dùng cùng basename.
   Ví dụ:
   ```bash
   node scripts/convert_excel/md_to_xlsx.js <PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/test-cases/exam_crud_test_cases.md <PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/test-cases/exam_crud_test_cases.xlsx
   ```
3. File Excel phải có cột `Nhóm chức năng`, sheet `Summary`, sheet `Test Cases`, và các sheet riêng theo nhóm nếu converter hỗ trợ.
4. Nếu có nhiều file Markdown testcase, export từng file có bảng `TC ID` sang một file `.xlsx` tương ứng.
5. Sau khi export, kiểm tra file `.xlsx` tồn tại và cập nhật đường dẫn Excel vào `task.md` hoặc summary output.
6. Nếu thiếu dependency `exceljs`, báo rõ blocker; không bỏ qua bước Excel và không coi Phase 1 hoàn tất.
7. Sau khi export Excel, coi file Excel là source of truth **khi gen/publish** (Phase 2 execute mặc định lấy nguồn từ Xray, `TESTCASE_SOURCE=xray`).
8. Không publish Jira trong prompt sinh testcase. Ghi trạng thái `Jira testcase publish: Pending QA confirmation`; Auto Publish Jira là step riêng trong phạm vi Phase 1 và chỉ chạy bằng `prompt_templates/phase1/04_auto_publish_jira.md` sau khi QA xác nhận Excel.
9. Sau khi export Excel, tạo/cập nhật `reports/phase1-summary.md` theo format Phase 1 Summary Report ở trên.
10. Cập nhật `task.md` với đường dẫn Markdown testcase, Excel testcase, trạng thái chờ QA xác nhận publish Jira và Phase 1 summary report.

---

# Quy tắc quan trọng

1. **KHÔNG dùng placeholder** — mọi dữ liệu phải cụ thể
2. **Mỗi field một TC riêng** — không gộp validation nhiều field
3. **Kết quả mong đợi phải chính xác** — không chung chung
4. **Các bước đủ chi tiết** để automation thực thi không cần hỏi thêm
5. **Bao phủ đủ 4 loại**: Positive, Negative, Boundary, Edge
6. Output bằng **Tiếng Việt** (trừ technical terms)
7. **Điểm mờ Blocking (Critical/High) → PHẢI qua Gate làm rõ (Bước 0) TRƯỚC khi gen**: gom câu hỏi vào `reports/phase1-clarifications.md`, đặt `AMBIGUITY_GATE: PENDING`, DỪNG chờ trả lời; **KHÔNG tự suy diễn, KHÔNG gen** phần bị chặn. RESOLVED xong mới phân tích lại rồi gen
8. Chỉ điểm mờ **Medium/Low** mới được tự áp assumption (ghi rõ assumption + Coverage Gap) rồi tiếp tục; **KHÔNG** áp cho Critical/High (những thứ đó phải chờ trả lời)
9. Không tạo testcase quá ngắn để tăng số lượng. Chất lượng chi tiết và khả năng execute ở Phase 2 quan trọng hơn số lượng thuần túy
10. Không được để trống endpoint/method/status ở API testcase
10b. **Oracle hiển thị phải từ tài liệu**: expected cho tên cột/label/format/thứ tự/empty-state trích verbatim từ FS/Figma, KHÔNG suy từ build (chống tautological). Mỗi màn có bảng/field phải có dimension Conformance (mục 12): tên cột exact, format từng field, số cột + thứ tự, field bắt buộc
10c. **Không chỉ UI/field — phải phủ logic/dữ liệu/bảo mật/hiệu năng** (mục 13-16 nếu applicable): kết quả tính toán bằng **giá trị cụ thể** + biên làm tròn và so khớp/delta dữ liệu (mục 13); phân biệt `null`/rỗng/thiếu/`0` và mapping BE→UI cho field trống nghi ngờ (mục 14); IDOR/privilege/injection/mass-assignment/data-exposure (mục 15); SLA/large-dataset/concurrent khi có ngưỡng (mục 16). Dimension không áp dụng → `N/A + lý do` ở Coverage Gaps, KHÔNG bỏ im lặng. Expected của logic/data là **oracle độc lập tự tính**, KHÔNG lấy từ build
11. Không được để steps/expected thành một câu dài; phải xuống dòng hoặc đánh số rõ ràng trong cell
12. Khi chạy trong repo này, phải xuất thêm file Excel `.xlsx` từ testcase Markdown trước khi kết thúc Phase 1
13. Mỗi testcase phải có nhóm chức năng rõ ràng trong cột `Module`; Excel export phải thể hiện được nhóm đó để lọc/review
14. Không coi Phase 1 hoàn tất nếu thiếu `reports/phase1-summary.md` hoặc report không có tổng testcase, breakdown theo loại, `Coverage Summary`, `Risk-based Gate`, `High/Critical Gaps`, `Testcase Quality Issues` và `Final Decision`
15. Không coi Phase 1 hoàn tất nếu testcase/report/task log dùng tiếng Việt không dấu hoặc bị lỗi encoding/mojibake
16. Không coi Phase 1 hoàn tất nếu thiếu section `## Setup Strategy (Hợp đồng tiền điều kiện)`, hoặc còn precondition không có `[PRE-NN]`, hoặc `Setup Source` chung chung không đủ để Phase 2 setup/manual rõ
17. `Setup Source` cho strategy `api` phải dựa trên Swagger đã fetch ở `requirements/swagger/`; nếu không có cách setup thì đánh dấu `Needs hook` hoặc `Manual-only` thay vì bịa endpoint
18. Sau khi Excel tạo thành công, KHÔNG publish Jira trong prompt này; ghi `Pending QA confirmation`. Auto Publish Jira chạy bằng prompt riêng sau khi QA xác nhận. Excel là source of truth khi gen/publish; Phase 2 execute mặc định lấy nguồn từ Xray (`TESTCASE_SOURCE=xray`, kéo về canonical local `from-xray/*.xlsx`), `excel` là opt-out
