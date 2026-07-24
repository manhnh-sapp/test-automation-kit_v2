# UI Conformance Checker — visual oracle dùng chung

`ui_conformance_check.js` là công cụ **project-wide** để bắt các lỗi hiển thị mà automation text-step hay miss: **sai tên cột, thiếu/thừa/sai thứ tự cột, sai format dữ liệu, sai empty-state/label, lệch token design**.

## Nguyên tắc
- **Expected lấy từ catalog** (trích nguyên văn từ FS/Figma), **KHÔNG lấy từ build** → tránh oracle tautological.
- **So khớp CHÍNH XÁC**: equality cho tên cột/label; **regex** cho format; **đếm + đúng thứ tự + đúng tên** cột; token style so với **dung sai**. Không dùng "contains/tồn tại".
- Đây là tầng "visual oracle" mà prompt không tự đóng được (mục 11b của `run_phase2_template.md`).

## Cách chạy
```bash
TASK_ENV=profiles/<TASK>/task.env \
node scripts/qa/ui_conformance_check.js --catalog <PROJECT_OUTPUT_DIR>/tasks/<TASK>/requirements/ui_catalog.json
# out mặc định: <task>/test-results/conformance/  (report md+json + screenshot full-page mỗi màn)
# exit code 1 nếu có deviation -> dùng để gate.
```

## Catalog schema (JSON)
```jsonc
{
  "login": {                    // reuse form login OPS/LMS
    "baseUrlEnv": "OPS_BASE_URL",
    "loginPath": "/auth/login",
    "userEnv": "OPS_USERNAME", "passEnv": "OPS_PASSWORD",
    "userSelector": "input[name=username]", "passSelector": "input[name=password]",
    "submitSelector": "button:has-text(\"Sign In\")"
  },
  "screens": [{
    "name": "Ten man",
    "url": "/duong-dan?query",           // tương đối base hoặc absolute; bỏ nếu chỉ dùng preSteps
    "scopeSelector": "[role=dialog]",     // (tùy) giới hạn trong modal/drawer
    "preSteps": [                          // (tùy) mở modal/nhập filter trước khi check
      { "action": "fill",  "selector": "input[placeholder*=Search]", "value": "NHM3" },
      { "action": "click", "selector": "button:has-text(\"Search\")" },
      { "action": "wait",  "value": 2000 }
    ],
    "table": {
      "headerSelector": "table thead th",
      "rowSelector": "table tbody tr:not(.ant-table-measure-row)",
      "expectedColumns": ["#","User Name","Type","Class","Lesson Name","Lesson date","Check-in","Check-out","Actual workload","Attendance Status","Status","Error message"],
      "formats": { "Check-in": "^\\d{2}:\\d{2}$", "Check-out": "^\\d{2}:\\d{2}$" }
    },
    "texts":  [{ "name": "empty-state", "selector": ".ant-empty-description", "expected": "No data" }],
    "tokens": [{ "name": "Cancel btn", "selector": "button:has-text(\"Cancel\")",
                 "expected": { "color": "#99A1B7", "border-radius": "6px" },
                 "tol": { "colorPerChannel": 8, "px": 2 } }]
  }]
}
```

## Loại deviation báo ra
- `columns.count` — số cột build ≠ spec (bắt cột thiếu/thừa).
- `columns.title/order` — tên cột sai hoặc sai thứ tự tại vị trí i.
- `format.mismatch` / `format.col-missing` / `format.no-sample` — dữ liệu không đúng format regex.
- `text.mismatch` — empty-state/label/placeholder sai chuỗi.
- `token.color` / `token.size` / `token.no-element` — lệch token design ngoài dung sai.

## Lưu ý
- Catalog là **per-task** (sinh ở Phase 1, mục 2b của `run_phase1_template.md`), nhưng công cụ dùng chung.
- Màn cần dữ liệu động (vd `batch_job_id`) thì điền URL sau khi có dữ liệu, hoặc dùng `preSteps` điều hướng.
- Đây là bổ trợ, không thay thế review mắt/vision cho bố cục tổng thể — nhưng bắt trọn phần "exact text/format/column" mà mắt dễ bỏ sót khi bảng dài.

---

# perf_check.js — Performance executable (mục 16)

Đo web vitals + API SLA + large-dataset + resource weight, so ngưỡng catalog → verdict **advisory** (median N lần chống flaky). Không có ngưỡng → N/A. Xem skill `.agent/skills/phase2/perf_check`.

```bash
TASK_ENV=profiles/<TASK>/task.env node scripts/qa/perf_check.js --catalog <.../perf_catalog.json> --runs 3
# out: <task>/reports/perf-report.md + perf-report.json
```

## Catalog block `perf`
```jsonc
{
  "login": { "baseUrlEnv": "OPS_BASE_URL", "loginPath": "/auth/login", "userEnv": "OPS_USERNAME", "passEnv": "OPS_PASSWORD" },
  "perf": {
    "screens": [{
      "name": "Transaction list", "url": "/operations/sales/transactions",
      "preSteps": [{ "action": "wait", "value": 1500 }],
      "thresholds": { "ttfb": 800, "fcp": 1800, "lcp": 2500, "load": 4000, "cls": 0.1 }   // ms; cls là số
    }],
    "api": [{ "name": "list transactions", "url": "/api/v1/product-orders/transactions", "method": "GET", "threshold_ms": 2000 }]
  }
}
```
Ngưỡng lấy từ NFR/SLA/spec; thiếu ngưỡng cho metric nào → metric đó N/A.

---

# security_check.js — Security BASIC executable (mục 15, non-destructive)

Kiểm headers/cookie, unauth, authz/IDOR (2 tài khoản test), exposure. **GET/read-only**, never-auto, cần `--confirm-nonprod`. Control → PASS/FAIL; exposure → finding (mask PII). Xem skill `.agent/skills/phase2/security_check` (ranh giới an toàn bắt buộc).

```bash
TASK_ENV=profiles/<TASK>/task.env node scripts/qa/security_check.js --catalog <.../security_catalog.json> --confirm-nonprod
# out: <task>/reports/security-report.md + security-report.json
```

## Catalog block `security`
```jsonc
{
  "security": {
    "baseUrlEnv": "OPS_BASE_URL",
    "headerTarget": "/",
    "requiredHeaders": ["strict-transport-security","content-security-policy","x-frame-options","x-content-type-options","referrer-policy"],
    "auth": { "loginPath": "/api/v1/auth/login", "userField": "username", "passField": "password", "tokenPath": "data.accessToken", "scheme": "Bearer" },
    "accounts": {                          // 2 tài khoản TEST (xem .env.example). Thiếu → authz/IDOR = NEEDS_ACCOUNT
      "low":  { "userEnv": "OPS_USERNAME_LOW",  "passEnv": "OPS_PASSWORD_LOW"  },
      "high": { "userEnv": "OPS_USERNAME_HIGH", "passEnv": "OPS_PASSWORD_HIGH" }
    },
    "protectedEndpoints":  [{ "name": "me", "url": "/api/v1/users/me" }],           // unauth GET → kỳ vọng 401/403
    "highPrivEndpoints":   [{ "name": "admin config", "url": "/api/v1/admin/config" }], // low role GET → kỳ vọng 403
    "idorEndpoints":       [{ "name": "user B resource", "url": "/api/v1/orders/<ID_CUA_USER_B>" }], // low GET → 403/404
    "sensitiveKeys": ["password","token","secret","hash","api_key"],
    "checkTransport": true
  }
}
```
`idorEndpoints` chỉ trỏ resource của **account test B**, KHÔNG phải khách hàng thật. Fuzzing/quét sâu → OWASP ZAP opt-in, Manual-only.

---

# seed_knowledge_from_jira.js — nạp lịch sử Jira/Xray vào knowledge (Suggest-only)

Bootstrap Risk-Based Testing: kit chỉ điền `knowledge/` khi bug qua Jira gate ở Phase 2, nên dự án mới → knowledge rỗng → `risk_score` cold-start chỉ dựa **Impact** (đoán Likelihood). Script này nạp **bug đã resolved** (→ `knowledge/bugs/`, cấp `bugCount`) và **kết quả execution cũ trên Xray** (→ `knowledge/historical_execution/`, cấp `failRate`) → `risk_score` có Likelihood thật ngay từ ngày đầu. **Không sửa `risk_score`, chỉ cấp dữ liệu.**

```bash
node scripts/qa/seed_knowledge_from_jira.js                    # DRY-RUN: in bảng map module, chưa ghi
node scripts/qa/seed_knowledge_from_jira.js --with-execution   # + preview snapshot execution từ Xray
npm run seed:knowledge:apply -- --since 2025-01-01             # ghi thật vào knowledge/ + rebuild index.json
```

| Flag | Ý nghĩa |
|---|---|
| `--apply` | Ghi thật (mặc định DRY-RUN — chỉ preview). |
| `--project <KEY>` | Jira project (mặc định `JIRA_PROJECT_KEY`). |
| `--jql "<...>"` | Override toàn bộ JQL bug (bỏ qua project/since mặc định). |
| `--since <YYYY-MM-DD>` | Chỉ bug `resolutiondate >=` ngày này. |
| `--module-from component\|label` | Suy `module` từ Jira **component** (mặc định) hay **label**. |
| `--label-prefix <p>` | Khi dùng label: chỉ label bắt đầu bằng `p` là module (cắt prefix). |
| `--with-execution` | Seed thêm `historical_execution` từ Xray Cloud (best-effort; thiếu creds/lỗi schema → skip sạch). |
| `--max <N>` / `--exec-max <N>` | Cap số bug (500) / test execution (50). |
| `--include-all-resolutions` | Bỏ lọc resolution=fix (mặc định loại Duplicate/Won't Do/Cannot Reproduce...). |
| `--fallback-module <name>` | Gán module này khi bug không có component/label (mặc định: bỏ qua). |

**An toàn:** read-only (JQL/GraphQL query, KHÔNG tạo/sửa issue) · DRY-RUN mặc định · mask email/SĐT · idempotent (dedup theo bug id) · đánh dấu `source: "jira-seed"` (xem `knowledge/SCHEMA.md`). Bug chỉ seed khi resolution = fix thật. **QA soi bảng map module trước khi `--apply`** (confidence trong `risk_score` bão hoà nhanh → map sai làm risk lệch).

---

# output_gate.js — Gate chất lượng output THỰC THI (RULE_GLOBAL)

Biến rule chất lượng máy-kiểm-được thành check THỰC THI, tự chạy trước khi push/convert → **không push/convert được payload sai** (agent tự sửa trong session, không chờ user nhắc). Rule ở `scripts/qa/lib/output_rules.js` (hàm thuần, tái dùng).

| Mode | Chặn gì (CHẶN) | Cảnh báo | Wired tự chạy ở |
|---|---|---|---|
| `test-execution` | comment run-on/debug · step thiếu status/ảnh · evidence không phải ảnh/video · case phức tạp thiếu video · **FAIL thiếu tầng-lỗi (G2)** | tautology (G2) · verdict lạ (G4) · attestation lệch/thiếu (G6) | `push_test_execution.js` (trước push) |
| `bug` | bug thiếu ảnh/video · thiếu video case phức tạp · KQ run-on · **thiếu Kết quả hiện tại/mong muốn (G8)** | — | `bug_reporter.js` (loop tạo bug) |
| `gen-testcase` | KQ số ≠ bước · gộp range `1-2.` · chung chung · **oracle rỗng (G2)** | `;`-nhồi-ý · tautology (`--strict` để chặn `;`) | `md_to_xlsx.js` (convert) |

```bash
npm run gate:output -- --status <testcase-status.json>       # test-execution (thêm --fix tự dọn comment)
npm run gate:gen-testcase -- --dir <test-cases/>             # gen-testcase
node scripts/qa/output_gate.js --mode bug --preview <bugs.json>
```

STRICT mặc định BẬT (tắt: `--lenient`/`QA_STRICT=0`/`XRAY_STRICT=0`); QA cố ý bỏ qua: `--qa-approved` (có log).

---

# Forcing functions round-3 (G1–G10)

Nhân mô hình `output_gate` ra TOÀN kit — biến bước quan trọng mọi phase thành gate máy-chặn do entrypoint/hook/CI gọi tự động (không để agent nhớ). Nguồn: `Kế hoạch update kit lần 3.docx`. Non-negotiables luôn-trong-ngữ-cảnh: **`CLAUDE.md`** (repo root, auto-load).

| Gate | Chặn/cảnh báo | Wired |
|---|---|---|
| **`preflight_gate.js` (G1)** | thiếu input bắt buộc / config JSON malformed / (phase2) thiếu testcase canonical = CHẶN | `md_to_xlsx` (phase1) · CI static-check (`--mode generic`) · `npm run preflight` |
| **`design_gate.js` (G5)** | thiếu cột canonical / rỗng ô lõi testcase = CHẶN; thiếu [Negative]/High-risk thiếu [Boundary]/[Security] = cảnh báo | `md_to_xlsx` (trước gen-gate) · `npm run design:gate` |
| **`self_review.js` (G9)** | *advisory* — gộp preflight+design+row-quality+execution thành 1 checklist trước finalize (luôn exit 0) | `npm run self-review -- --task <KEY>` · workflow phase2_04 Bước 0 |
| **`.agent/config/verdict_taxonomy.json` (G4)** | NGUỒN DUY NHẤT: statuses/failureLayers/rerun{2,3}. `output_gate` validate status; prompt trỏ về đây | (config) |
| **`lib/gate_engine.js` (#2)** | interface GateResult {gateId,status,severity,findings} + `aggregate`/`format` — self_review dùng | (lib) |
| **`dependency_graph.js` (P2)** | gộp traceability(module→TC→exec) + impact-map(source→tests) → coverageByModule + impactedTests | `npm run dep:graph -- --task <KEY>` |
| **`quality_decision.js` (P2)** | Risk+Coverage+Reliability+Defect+Security → GO/GO_WITH_RISK/NEEDS_REVIEW/NO_GO/BLOCKED | `npm run quality:decision -- --task <KEY>` |

> **Architecture hardening (`scripts/utils/`, offline):** `lib/testcase/` (canonical TestCase: parseMarkdown/parseXlsx/validate — 1 parser), `test_context.js` (thin execution-context), `evidence/{sanitize,manifest}.js` (PII mask + evidence index/exists-check), `auth/{session_cache,auth_strategy}.js` + `tests/fe/support/auth/opsAuth.ts` (reuse session né throttle), `cleanup/cleanup_manifest.js` (orphan RUN_ID reconcile), `runtime_config.d.ts` (typed).

```bash
node scripts/qa/preflight_gate.js --mode phase2 --task <KEY>   # G1: đủ input trước execute
npm run design:gate -- --dir <test-cases/> --with-rows        # G5: structural+completeness (+row-quality)
npm run self-review -- --task <KEY>                            # G9: checklist gộp trước finalize
```

---

## Hook harness (tuỳ chọn, tự động cao nhất)

2 hook (script **committed**; cấu hình bật ở **local** `.claude/settings.json` — `.claude/` gitignore nên mỗi máy tự khai; xem [`hooks/README.md`](hooks/README.md)):
- `scripts/qa/hooks/gate_on_write.js` = **PostToolUse** (Write|Edit): mỗi khi agent GHI `testcase-status.json`/`test-cases/*.md` → tự chạy gate, vi phạm CHẶN → feedback về agent.
- `scripts/qa/hooks/inject_context.js` = **SessionStart** (G7): bơm context forcing-functions + kết quả preflight config-integrity vào MỌI phiên (chống miss-file tận gốc).

```jsonc
{ "hooks": {
  "SessionStart": [ { "hooks": [ { "type": "command", "command": "node scripts/qa/hooks/inject_context.js", "timeout": 30 } ] } ],
  "PostToolUse":  [ { "matcher": "Write|Edit", "hooks": [ { "type": "command", "command": "node scripts/qa/hooks/gate_on_write.js", "timeout": 60 } ] } ]
} }
```

Thêm xong mở `/hooks` một lần (hoặc restart) để harness nạp settings mới.
