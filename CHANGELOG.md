# Changelog

> Lịch sử thay đổi **kit dùng chung** (shared). Kit chưa dùng semver → ghi theo **ngày + nhóm chủ đề**,
> nguồn là `git log main` (kèm commit hash để tra ngược).
>
> Vì sao cần file này: mọi thay đổi ở `playwright.config.js`, `package.json`, `scripts/**`, `prompt_templates/**`,
> `.agent/**`, `tests/support/**` đều là **shared change** (xem `RULE_GLOBAL.md` §Shared Change Gate) —
> ảnh hưởng mọi story đang chạy. Mỗi mục ghi **vấn đề → cách chữa**, không chỉ liệt kê tính năng.

## 2026-08-06 — Khép vòng học · chống flaky expand · đồng bộ tài liệu

**Added**
- `scripts/qa/learn_bugs.js` (`npm run learn:bugs[:apply]`) — nạp bug từ **Jira** (label `auto-bug` + sub-task của story) vào `knowledge/bugs/` + `index.json`. Trước đó `bugCount` luôn = 0 nên `risk_score` chỉ có `failRate`. Không cần sửa `bug_reporter.js`. Idempotent (đã có → chỉ đồng bộ `jira_status`). Nghiệm thu: SAPP-23439 → 7 bug, `risk_score` từ `0 bug` → `7 bug, 9 snapshot`. (`7482523`)
- `scripts/utils/ui/ensure_expanded.js` + regression `tests/fe/infra/ensure-expanded.spec.ts` — mở panel/accordion trên DOM "nhiều icon giống nhau": thử ứng viên → **nghiệm thu bằng sentinel**, tự Escape khi click nhầm modal/dropdown, idempotent, không dùng toạ độ chuột. Thay cho click chevron theo toạ độ (nguồn flaky kinh điển; SAPP-24395 thử ~8 lần không ổn định). (`683d67e`)
- `select_tests.js` dùng learning data thật: xếp hạng file theo `(fail + 0.5×flaky)/runs`, `--include-risky <N>`, `--risk-first`, cảnh báo test quarantine. Trước đây code ghi rõ *"risk hiện in gợi ý, chưa auto-lọc"*. (`7482523`)

**Fixed**
- `metrics_collect.js`: test `skipped` có `results` **rỗng** nên chỉ đọc `results[last].status` → **15/26 record là `unknown`**, làm hỏng tín hiệu reliability/risk. Fallback `t.status`; đồng thời chuẩn hoá `file` về repo-relative để `select_tests` map được. (`7482523`)
- `self_review`: đòi KPI cả với task execute bằng script tự chế (không sinh `results.json`) → **chặn oan** (SAPP-23439). Nay chỉ đòi khi task thực sự có `results.json`. (`7482523`)
- `ensure_expanded`: dùng `offsetParent !== null` để kiểm hiển thị làm overlay `position: fixed` (antd/bootstrap) bị coi là ẩn → mất khả năng tự-Escape. Đổi sang `rect + computedStyle`. (`683d67e`)

**Docs**
- `README.md` + `USER_GUIDE.md` đồng bộ cho toàn bộ thay đổi kit-wide gần đây; bù **12 npm script** vốn chưa từng được ghi → nay đủ **51/51**. (`76bf164`)

## 2026-08-04 — Learning loop tự động

**Added**
- `scripts/qa/learn_task.js` (`npm run learn`, `learn:backfill`) — thu KPI + snapshot `historical_execution/<TASK>__<date>.json` với `modules` theo **tên module nghiệp vụ** (map `tcId → Module` từ testcase canonical), cập nhật `index.json`. Idempotent; thời điểm lấy từ artifact nên backfill giữ đúng trend. Backfill 16 task → 12 KPI run + 9 snapshot; `risk_score` thoát cold-start, `dashboard` từ rỗng → 9 snapshot/84 module. (`73391e3`)
- `scripts/qa/learn_reporter.js` — Playwright reporter **tự thu sau mỗi test run**, khai **cuối** danh sách `reporter`. (Đo thật: `globalTeardown` chạy *trước* khi reporter `json` ghi `results.json` nên không dùng được.) Guard: `LEARN_AFTER_RUN=0` · CI · thiếu TASK context · 0 test · run bị ngắt; never-throw. (`4399acf`)
- `self_review` check thứ 4: execute xong mà thiếu snapshot/KPI → **CHẶN** kèm lệnh sửa. (`73391e3`)

**Changed**
- `RULE_GLOBAL` §Cleanup Rules: pattern `scratch_*.py|js|ts` → **`scratch_*` mọi đuôi** + rule "dump ad-hoc ghi vào scratchpad, KHÔNG ghi root repo"; `.gitignore` thêm `scratch_*`. Lý do: 7 file `scratch_*` (dump swagger/API) sót ở root, **chưa gitignore** → một lần `git add .` là commit lộ PII (dump swagger chứa 24 email + 6 SĐT ở giá trị mẫu). (`f6f6cf1`)

## 2026-07-31 — Non-functional sâu · cross-browser lane

**Added**
- `scripts/qa/lighthouse_check.js` (`npm run lighthouse`) — điểm **Performance/Accessibility/SEO/Best-practices** qua CDP (`playwright-lighthouse`). Opt-in nặng (thiếu dep → skip sạch), never-auto + non-prod, verdict **advisory** theo dải chuẩn, evidence = ảnh bảng điểm. (`2a8ba04`)
- `perf_check --deep` — coverage động JS/CSS, `Performance.getMetrics`, heap, CPU/network throttling qua CDP thô. (`b8cd8e3`)
- **Lane cross-browser**: `CROSS_BROWSER=1` → thêm project `firefox-desktop` + `webkit-desktop`; `CROSS_BROWSER_GREP` cho tập critical; job `cross-browser` (manual) ở cả `.gitlab-ci.yml` và `ci.yml`. Lý do tách lane: `project` trong Playwright = **nhân bản suite**, gộp vào PR sẽ nhân 3× lượt chạy/evidence/nhiễu flaky. (`3ea1769`)

**Fixed**
- `desktopIgnore` dùng chung + thêm `**/support/**`: spec hạ tầng dưới `tests/support` đọc file **lúc load** làm **vỡ collection toàn suite** (`--list` ra `Total: 0` → gate F1 dễ `INFRA_FAILURE`). Sau fix: 238 test/53 file. (`3ea1769`)

## 2026-07-30 — Đọc tài liệu kỹ · siết Ambiguity Gate

- `RULE_GLOBAL` §"Analysis & Ambiguity Gate" (canonical) + digest ở `core_rules`: **đọc tài liệu THẬT KỸ** (mọi mục/bảng/ghi chú/footnote trong scope) và **gom câu hỏi làm rõ TRƯỚC khi gen testcase**; còn điểm Blocking → `AMBIGUITY_GATE: PENDING`, dừng chờ trả lời, **không đoán**. `02_gen_testcases.md` thêm "Bước 0" và bỏ escape *"cứ gen với assumption"* cho mức Critical/High. (`cb380b6`)

## 2026-07-27 — Token Broker (hết gián đoạn vì token 30')

- `tests/fe/support/auth/tokenBroker.ts` + `scripts/utils/auth/pick_token.js` — giữ 1 phiên SPA đã login sống, lấy **token tươi** mỗi lần gọi API (ưu tiên **capture header `Authorization`** thật của SPA), 401/403 → refresh → retry. Bỏ hẳn việc F12 dán `OPS_API_TOKEN`/`LMS_API_TOKEN`; `task.env` chỉ cần user/password. (`f70e786`)
- `tests/fe/support/lmsLogin.ts` + alias app-neutral cho LMS (Keycloak). **Fix quan trọng**: LMS SPA phát hiện automation → loop trang login trắng; chữa bằng `--disable-blink-features=AutomationControlled` (global, đã nghiệm thu vô hại với Firefox/WebKit) + override `navigator.webdriver`. (`0e3bf79`)

## 2026-07-24 — Architecture hardening V2.1 · Forcing functions round-3

- **Canonical TestCase** (`scripts/lib/testcase/`): 1 parser duy nhất cho Markdown/XLSX, xoá 4 parser trùng; sửa lỗi `split('|')` làm lệch cột khi cell có `\|`. (`9fa14d9`→`9f537c3`)
- **GateEngine** (interface gate chuẩn + aggregate), **EvidenceManager** (sanitize + manifest), **TestContext**, **typed RuntimeConfig**, **Cleanup Manifest**, **DependencyGraph**, **QualityDecision** (GO/NO-GO). (`964efb1`, `6310e27`, `a5d6767`, `ddd6797`)
- **EvidenceRecorder** atomic + parallel-safe (shard per-TC, temp+rename). (`5717dae`)
- **Auth Strategy** — reuse session né throttle/lockout; seed localStorage bằng `addInitScript` **trước** khi SPA boot. (`415827c`, `888fced`)
- **Round-3 G1–G10**: `preflight_gate` (G1), `output_gate` phân tầng lỗi + chống oracle tautology (G2), `CLAUDE.md` non-negotiables (G3), verdict taxonomy 1 nguồn (G4), `design_gate` (G5), attestation-verify chống "tick suông" (G6), SessionStart hook bơm context (G7), bug gate (G8), `self_review` (G9).

## 2026-07-23 — CI integrity · coverage thật · metrics

- **GĐ1 CI integrity**: chống false-green (`test_inventory_gate`, SHARD_EMPTY), risk gate enforce, policy-source check, env pin, `secret_scan` + `audit_ci`, eslint/typecheck.
- **GĐ2 coverage**: suite FE/API thật đầu tiên (Order Total Amount Due, Transaction list, Product-Orders API) — verified UAT; ma trận traceability REQ→TC→AUTO→EXEC→BUG; `select_tests` (F9).
- **GĐ3 metrics**: `metrics_collect` (F11) + `reliability_index` (F10) + persistence commit-back `knowledge/metrics`.
- **Output Quality Gate** thành gate THỰC THI cho Test Execution / gen-testcase / bug + harness hook.

## 2026-07-21 — Knowledge Base · Risk-Based Testing

- `knowledge/` (schema `SCHEMA.md`) + skill `learning_recorder` + `git_impact_analyzer`.
- `risk_score`/`risk_gate` (RBT) + `seed_knowledge_from_jira` (bootstrap từ lịch sử Jira/Xray) + tune `risk_model.json` cho SAPP.
- Rule: "Kết quả mong đợi" đánh số **khớp từng bước**, cấm gộp range.
