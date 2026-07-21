# Project Context Example

> Copy thành `.agent/config/project_context.md` cho project mới và chỉ điền thông tin không nhạy cảm.

## Project Metadata

| Field | Value | Ghi chú |
|---|---|---|
| Project name | `<YOUR_PROJECT_NAME>` | Tên project để phân biệt output, ví dụ `crm-automation`. |
| Output convention | `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/` | Ví dụ `outputs/crm/tasks/CRM-123`. |
| Task key convention | `<TASK_KEY>` | Jira key hoặc scope ngắn, ví dụ `PROJ-123`. |

## Sites

### LMS

| Field | Env key | Ghi chú |
|---|---|---|
| Base/Login/User/Password | `LMS_BASE_URL`, `LMS_LOGIN_URL`, `LMS_USERNAME`, `LMS_PASSWORD` | Bắt buộc nếu test app này. |
| API/Swagger | `LMS_API_BASE_URL`, `LMS_SWAGGER_URL` | Optional nếu chỉ test UI. |

### OPS

| Field | Env key | Ghi chú |
|---|---|---|
| Base/Login/User/Password | `OPS_BASE_URL`, `OPS_LOGIN_URL`, `OPS_USERNAME`, `OPS_PASSWORD` | Optional nếu project chỉ có một app. |
| API/Swagger | `OPS_API_BASE_URL`, `OPS_SWAGGER_URL` | Optional nếu không test API app 2. |
| Feature URLs | `FEATURE_1_URL`, `FEATURE_2_URL`, `FEATURE_3_URL` | Optional cho module đặc thù. |

## Dashboard branding (optional)

Dashboard (`npm run dashboard`) mặc định dùng **SAPP Academy Design System**. Để đổi branding cho project
khác (màu/logo/font/tên), copy `.agent/config/dashboard.branding.example.json` →
`.agent/config/dashboard.branding.json` và chỉ khai field muốn đổi (phần thiếu kế thừa default SAPP).
Không có file override → giữ nguyên SAPP DS.

## Learning data

`knowledge/` (live) khởi tạo **rỗng** cho project mới; `learning_recorder` điền dần khi chạy task thật.
Dữ liệu mẫu minh hoạ nằm ở `knowledge/examples/` (không phải learning data của project bạn).

## Rules

- Không ghi secret vào Markdown, testcase, report, log hoặc `task.md`.
- Không hardcode project cụ thể vào prompt/template dùng chung.
- Nếu cần nhiều app/site hơn, thêm section App 3/App 4 theo cùng format.
