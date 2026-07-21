# CI/CD — Test Automation Kit

4 workflow GitHub Actions (bản GitLab tương đương ở `.gitlab-ci.yml` root). Dùng GitHub thì xoá `.gitlab-ci.yml`, và ngược lại.

## Workflows

| File | Trigger | Vai trò | Cần secret? |
|---|---|---|---|
| `static-check.yml` | **mỗi push/PR** | `node --check` toàn bộ script + validate JSON config/knowledge + dry-run an toàn (dashboard rỗng, risk cold-start, security-guard từ chối). Bắt vỡ tooling. | ❌ Không |
| `integration-check.yml` | **manual** | Kiểm kết nối Jira/Confluence/Xray + **dry-run** publish/bug (KHÔNG publish thật). | ✅ JIRA/XRAY/CONFLUENCE |
| `task-execute.yml` | **manual** (dispatch task_key/suite) | Phase 2 task-scoped, sharded + risk-gate + artifact theo task. Chỉ chạy spec **đã committed**. | ✅ OPS (+JIRA nếu cần) |
| `ci.yml` | **nightly + manual** (KHÔNG every-push) | Live regression sharded → gộp 1 HTML report. `--pass-with-no-tests` khi chưa có spec. | ✅ OPS |

> **Vì sao chia vậy:** kit là AI-agent-driven; Phase 1/2 do agent sinh testcase/automation (CI không tái tạo được), và automation per-task nằm trong `outputs/` (gitignored). Nên **regression thật chỉ có nghĩa sau khi promote spec ổn định vào `tests/fe|api`** (human gate). Trong lúc đó, `static-check` là CI giá trị-thật-ngay.

## Secrets (Settings → Secrets and variables → Actions)

| Secret | Dùng cho |
|---|---|
| `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` | integration check, dry-run publish/bug |
| `XRAY_CLIENT_ID`, `XRAY_CLIENT_SECRET` | Xray (nếu dùng) |
| `CONFLUENCE_URL`, `CONFLUENCE_USERNAME`, `CONFLUENCE_API_TOKEN` | integration check Confluence |
| `OPS_BASE_URL`, `OPS_USERNAME`, `OPS_PASSWORD` | login khi execute FE/regression |

CI nạp qua **env từ secrets**, KHÔNG tạo file `.env` (đúng rule kit: không commit secret/token/cookie).

## An toàn (bắt buộc)

- **Không auto publish/log Jira**: publish testcase / log bug thật cần `--qa-approved` (hành động local). CI chỉ dry-run. Muốn publish thật trong CI → tạo **GitHub Environment có required reviewers** rồi mới thêm job publish vào đó.
- **Secrets chỉ cho protected branch, KHÔNG expose cho fork PR** (tránh lỗ hổng `pull_request_target`). `static-check` (chạy trên PR) cố ý **không dùng secret**.
- **Live regression chỉ non-prod, không every-push**: hit UAT thật → để nightly/manual, không mutate dữ liệu UAT (đúng rule non-destructive). `OPS_BASE_URL` phải trỏ UAT/staging.
- **Mobile-native (Appium) không nằm trong CI này**: cần runner riêng (Android emulator trên Linux; iOS cần macOS runner / device farm).

## Gotchas kỹ thuật

- `playwright.config.js` **throw nếu thiếu `PROJECT_OUTPUT_DIR` + `TASK_KEY`** khi load → các job chạy `playwright test` đã set sẵn 2 biến này (`outputs/ci` + `CI-REGRESSION` cho regression; theo input cho task-execute).
- `--pass-with-no-tests` cần `@playwright/test >= 1.44` (kit dùng `^1.60` → OK).
- Sharding: mỗi shard set `RUN_ID` riêng → output không đè; các shard xuất `--reporter=blob`, job cuối `merge-reports --reporter=html` gộp 1 HTML.
- GitLab: `parallel: 4` + `--shard=$CI_NODE_INDEX/$CI_NODE_TOTAL`, image `mcr.microsoft.com/playwright` (browser cài sẵn — đổi tag khớp version).
