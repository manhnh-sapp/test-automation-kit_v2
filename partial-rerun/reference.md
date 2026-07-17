# Partial Rerun Reference

> Tài liệu tham chiếu duy nhất cho nhánh phụ xử lý thay đổi nội dung requirement/design/API.

## Mục đích

`partial-rerun` là nhánh phụ độc lập. Chỉ dùng khi tài liệu nguồn đã đổi nội dung sau khi đã có testcase hoặc execution result.

Nhánh này không thuộc Main Flow, không tự chạy, không block Phase 1/Phase 2/Re-run và có thể xóa mà Main Flow vẫn hoạt động.

## Khi nào dùng

| Tình huống | Hành động |
|---|---|
| Jira/Confluence/Figma/Swagger đổi nội dung nhưng link/path giữ nguyên | Chạy `run_requirement_prepare_review.md`. |
| Đã có Human Review approve testcase thay đổi | Chạy `run_requirement_apply_approved.md`. |
| Đã merge Excel/testcase thay đổi và cần đồng bộ Jira/Xray mirror | Chạy `run_xray_test_cleanup.md`. |
| Chưa có testcase baseline | Chạy Phase 1 chính, không dùng partial rerun. |
| Dev fix bug đã log | Dùng Re-run chính, không dùng partial rerun. |
| Cần log Jira bug | Chuyển về Phase 2/Main Flow bug triage, không log trực tiếp từ partial rerun. |

## Luồng chuẩn

```text
Tài liệu nguồn đổi nội dung
↓
Prepare Review
↓
Diff + Impact + Draft testcase
↓
Human Review
↓
Apply Approved
↓
Merge testcase đã approve
↓
Re-publish Xray (update TC cũ + tạo TC mới, đúng subfolder)
↓
Optional Xray Test Cleanup (label stale TC bị bỏ khỏi Excel)
↓
Pull affected từ Xray → Partial Execute subset (mặc định TESTCASE_SOURCE=xray)
↓
Push Test Execution + link Test Plan (subset)
↓
PASS hoặc bug candidate handoff về Main Flow
```

## Phase con 1: Prepare Review

Entry point:

```text
partial-rerun/run_requirement_prepare_review.md
```

Mục tiêu:

- So sánh nội dung mới với snapshot/baseline cũ của cùng link/path.
- Tạo diff theo requirement/API/design/data section.
- Mapping diff tới requirement, business rule, API/UI/data behavior và TC ID.
- Phân loại risk: `Critical`, `High`, `Medium`, `Low`.
- Gán lifecycle: `ACTIVE`, `UPDATED`, `DEPRECATED`, `NEW`, `NEED_REVIEW`.
- Sinh testcase draft cho `UPDATED` và `NEW`.
- Tách testcase `DEPRECATED` riêng.
- Tạo `review-checklist.md`.
- Dừng tại `WAITING_FOR_HUMAN_REVIEW`.

Output chính:

```text
<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/change/
├── snapshots/
├── diffs/
├── impact/
└── regen/
```

## Phase con 2: Apply Approved

Entry point:

```text
partial-rerun/run_requirement_apply_approved.md
```

Mục tiêu:

- Chỉ chạy khi có Human Review approve.
- Merge testcase theo lifecycle đã approve.
- Export/update Excel nếu testcase chính thay đổi.
- **Re-publish Xray** TC `UPDATED` + `NEW` (dedup: update theo TC ID + tạo mới, vào đúng subfolder Test Repository); Optional cleanup chỉ **label stale** TC bị bỏ khỏi Excel.
- Chọn subset execute: testcase `NEW`, `UPDATED`, và testcase bị ảnh hưởng. Mặc định execute **từ Xray** (pull affected về canonical local).
- Không chạy full regression mặc định.
- Execute thật subset đã chọn.
- **Đẩy Test Execution + link Test Plan** cho subset đã execute (như các phase khác); kit chỉ link Test Plan, không tạo.
- Tạo bug candidate package nếu có fail nghi product bug.
- Không log Jira trực tiếp.

Output chính:

```text
<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/change/
├── regen/merge-summary.md
└── partial-execution/
    ├── selected-tc-list.txt
    ├── execution-summary.md
    ├── bug-candidates.md
    └── artifacts/
<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/reports/jira-testcase-publish-summary.md (re-publish Step 2b)
<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/reports/xray-execution-summary.md (Test Execution Step 6b)
<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/reports/jira-testcase-cleanup-summary.md (nếu chạy cleanup mirror)
```

## Lifecycle testcase

| Lifecycle | Ý nghĩa | Merge sau approve |
|---|---|---|
| `ACTIVE` | Testcase không bị ảnh hưởng | Giữ nguyên. |
| `UPDATED` | Testcase cần sửa theo thay đổi mới | Replace theo TC ID. |
| `DEPRECATED` | Testcase không còn hợp lệ | Chuyển sang deprecated/archive section. |
| `NEW` | Behavior mới cần testcase mới | Append vào testcase chính. |
| `NEED_REVIEW` | Chưa đủ rõ hoặc còn blocker | Không merge, không execute. |

## Quy tắc merge

- Không replace testcase chính trong Phase 1 Prepare Review.
- Không tự động merge nếu chưa có Human Review.
- Không merge item `REJECTED` hoặc `NEED_CLARIFICATION`.
- Không đổi expected result sau approval nếu chưa review lại.
- Giữ audit trail: source link/path, change reason, TC ID, reviewer decision.

## Quy tắc execute

- Sau merge + re-publish, chỉ partial execute subset bị ảnh hưởng.
- Nguồn execute mặc định là **Xray** (`TESTCASE_SOURCE=xray`): pull TC affected về canonical local rồi execute; `excel` để chạy thuần local.
- Execute xong, đẩy **Test Execution** (chỉ subset) + link **Test Plan** có sẵn (`PUSH_XRAY_EXECUTION=1`); kit chỉ link, không tạo Test Plan.
- Không chạy full regression mặc định.
- Full regression chỉ khi business flow/API contract/UI shared thay đổi diện rộng hoặc QA Lead yêu cầu.
- Với `RUN_ID`, output execute nằm dưới:

```text
<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/test-results/runs/<RUN_ID>/
<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/reports/runs/<RUN_ID>/
```

## Xray cleanup trong partial rerun

Nếu testcase baseline đã từng publish lên Jira/Xray và Apply Approved làm Excel thay đổi:

- **Re-publish (Step 2b, `publish_testcases.js`) chạy TRƯỚC cleanup** — re-publish tạo TC mới + update TC cũ; cleanup **chỉ label stale** TC bị bỏ khỏi Excel, KHÔNG tạo/update TC.
- Chạy `partial-rerun/run_xray_test_cleanup.md` sau khi merge + re-publish approved testcase.
- Luôn dry-run trước, apply thật chỉ khi Human Review/QA approval rõ ràng.
- Không hard delete Xray `Test` hoặc `Test Set`.
- Stale Xray Test chỉ được label `deprecated,out-of-scope,stale-from-excel`.
- Unlink stale Test khỏi Story/Task là optional, chỉ bật khi QA yêu cầu.
- Excel vẫn là source of truth; Jira/Xray chỉ là mirror.

## Bug candidate handoff

Nếu partial execute phát hiện fail nghi product bug:

- Tạo `change/partial-execution/bug-candidates.md`.
- Ghi TC ID, expected, actual, evidence, rerun count và nguyên nhân đã loại trừ.
- Không log Jira trong partial rerun.
- User/QA chuyển sang Main Flow Phase 2 bug triage nếu muốn log Jira.

## Snapshot schema tối thiểu

`change/snapshots/snapshot_context.json` nên có:

```json
{
  "project_output_dir": "outputs/<YOUR_PROJECT>",
  "task_key": "<TASK_KEY>",
  "sources": [
    {
      "source_id": "confluence-xxx",
      "type": "confluence|jira|figma|swagger|file",
      "url_or_path": "<same-source-link-or-path>",
      "content_hash_before": "<hash>",
      "content_hash_after": "<hash>",
      "last_checked_at": "YYYY-MM-DDTHH:mm:ssZ"
    }
  ],
  "testcases": [
    {
      "tc_id": "<TC_ID>",
      "source_ids": ["confluence-xxx"],
      "lifecycle": "ACTIVE|UPDATED|DEPRECATED|NEW|NEED_REVIEW",
      "risk": "Critical|High|Medium|Low"
    }
  ]
}
```

## Hard Rules

- Không gọi partial-rerun từ Main Flow.
- Không thêm dependency từ Phase 1/Phase 2/Re-run sang partial-rerun.
- Không tự động trigger khi chạy Phase 1/Phase 2.
- Không block Main Flow nếu partial-rerun thiếu file hoặc bị xóa.
- Không log Jira trực tiếp từ partial-rerun.
- Không dùng partial-rerun cho Dev fix bug; dùng Re-run chính.
