---
name: risk_scorer
description: Risk-Based Testing có thực thi — chấm Risk = Likelihood × Impact per module từ knowledge/ + config, sinh risk-register (Suggest-only), và gate depth theo band (default cảnh báo, --enforce chặn). QA override band.
---

# Risk Scorer

## Purpose

Biến RBT từ "gợi ý prose" thành quy trình **tính được — QA chốt được — ép được**:
- **Tính** (`scripts/qa/risk_score.js`): đọc `knowledge/{bugs,historical_execution}` + `requirements/git-impact.md` + `.agent/config/risk_model.json` → Risk = Likelihood × Impact per module → `reports/risk-register.{md,json}`.
- **Chốt** (human): QA review register, override band (`band_override` + `override_reason` trong JSON).
- **Ép** (`scripts/qa/risk_gate.js`): đối chiếu testcase với `depthPolicy` theo band; High thiếu độ sâu → CRITICAL; `--enforce` → exit≠0.

## Mức tự chủ

- `risk_score.js`: **Suggest-only** — chỉ sinh register, không đổi scope, không PASS/FAIL.
- `risk_gate.js`: mặc định **suggest-only** (cảnh báo, exit 0); chỉ **chặn** khi `--enforce` VÀ có CRITICAL ở band High.

## Chống cold-start (QUAN TRỌNG — `knowledge/` rỗng là mặc định)

Likelihood có **prior = Impact**, blend theo lượng data: `L = confidence·observed + (1−confidence)·prior` (floor 1).
- Chưa data (confidence 0) → `L = Impact` → **band do Impact dẫn** (module tiền/bảo mật vẫn High ở dự án mới).
- Có bug/historical → Likelihood sắc lại theo tần suất thực (learning loop). Chưa khai Impact & chưa data → band `UNKNOWN`, QA quyết.

## Config — nguồn duy nhất

`.agent/config/risk_model.json` (override `risk_model.example.json`): `impact.modules/tagWeights`, `likelihood.{prior,confidenceFull,...}`, `bands`, **`depthPolicy` (minCount + requiredDimensions theo band — NGUỒN DUY NHẤT cho density)**, `dimensionKeywords` (heuristic phát hiện dimension mục 12–17). Prose ở 02_gen/phase1_00/tc_validator chỉ trỏ tới đây.

## Khi nào chạy

| Bước | Việc |
|---|---|
| `phase1_00_scope_planning.md` | `npm run risk` → đưa register + thứ tự execute vào `phase1-summary.md`; QA chốt/override band. |
| `phase1_03` / `tc_validator` | `npm run risk:gate` sau khi có testcase; gap High-risk = Critical gap → không PASS coverage gate. |
| `phase2_01_prepare_execution.md` | Execute theo `executeOrder` của register (High trước). |
| Sau Phase 2 | `learning_recorder` ghi bug/historical → lần sau `risk_score` tự tính lại với data tươi. |

## Commands

| Việc | Lệnh |
|---|---|
| Chấm risk | `TASK_ENV=profiles/<TASK>/task.env npm run risk` |
| Gate (cảnh báo) | `TASK_ENV=profiles/<TASK>/task.env npm run risk:gate` |
| Gate (chặn CI) | `TASK_ENV=profiles/<TASK>/task.env npm run risk:gate:enforce` |

## Decision Rules

- Cold-start: band từ Impact; **override thủ công trước khi bật `--enforce`** trên dự án mới.
- Gate CHẶN (CRITICAL) chỉ dựa **đếm** (bảo thủ): High + 0 TC hoặc < 50% minCount. Thiếu requiredDimension (keyword) → **WARN**, không tự chặn.
- Module có lý do chính đáng → `gate_waiver` trong register (hạ CRITICAL→WARN).
- Tên module trong `impact.modules` nên khớp `Nhóm chức năng` cột Module của testcase để gate map đúng.

## Constraints

- Không coi risk số là tuyệt đối — heuristic dimension chỉ cảnh báo; QA xác nhận cuối.
- Không để `--enforce` làm hỏng cold-start: dự án mới thiếu data → override band trước khi enforce.
- Không ghi secret/PII vào register (chỉ module/score/driver kỹ thuật).
- 1 model duy nhất: `risk_gate` là bản executable của "Risk depth" trong `tc_validator`, không phải gate thứ 2.

## Anti-Patterns

- Công thức sập về 0 ở cold-start (phải có prior = Impact).
- Định nghĩa density ở nhiều nơi (chỉ `depthPolicy` là nguồn).
- `--enforce` chặn trên heuristic dimension (chỉ chặn theo đếm high-confidence).
- Coi band máy chấm là cuối cùng mà bỏ human override.

## Related

- [[learning_recorder]] — nguồn `knowledge/bugs`+`historical_execution` cho Likelihood.
- [[git_impact_analyzer]] — `git-impact.md` bơm module bị đụng vào register.
- [[tc_validator]] — Risk depth gate (risk_gate là bản executable).
- `.agent/workflows/phase1_00_scope_planning.md`, `phase2_01_prepare_execution.md`.
