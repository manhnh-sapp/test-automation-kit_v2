# Project Context

> Context không nhạy cảm để agent định hướng trước Phase 1/Phase 2.

## Project Metadata

| Field | Value |
|---|---|
| Project name | `<YOUR_PROJECT_NAME>` |
| Output convention | `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/` |
| Task key convention | Jira key hoặc scope ngắn của feature, ví dụ `<TASK_KEY>` |

## Sites

### LMS

| Field | Env key |
|---|---|
| Base/Login/User/Password | `LMS_BASE_URL`, `LMS_LOGIN_URL`, `LMS_USERNAME`, `LMS_PASSWORD` |
| API/Swagger | `LMS_API_BASE_URL`, `LMS_SWAGGER_URL` |

### OPS

| Field | Env key |
|---|---|
| Base/Login/User/Password | `OPS_BASE_URL`, `OPS_LOGIN_URL`, `OPS_USERNAME`, `OPS_PASSWORD` |
| API/Swagger | `OPS_API_BASE_URL`, `OPS_SWAGGER_URL` |
| Feature URLs | `FEATURE_1_URL`, `FEATURE_2_URL`, `FEATURE_3_URL` |

## Rules

- Không đặt password, token, cookie, private key hoặc secret ở file này.
- Secret phải nằm trong `.env.local`, `.env`, CI env hoặc secret store.
- Không dùng Jira key/domain/module name làm project name; chúng chỉ là `TASK_KEY` hoặc scope.
- Nếu thiếu `PROJECT_OUTPUT_DIR` hoặc input bắt buộc không thể suy ra từ context/env, dừng và hỏi user.
