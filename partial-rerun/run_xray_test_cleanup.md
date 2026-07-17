# Run Xray Test Cleanup

> Cleanup Jira/Xray testcase mirror sau khi Partial Rerun đã merge testcase thay đổi được Human Review approve.

## Purpose

Dùng prompt này khi Excel source of truth đã thay đổi sau publish Jira/Xray, thường sau `partial-rerun/run_requirement_apply_approved.md`.

Prompt này chỉ đồng bộ lifecycle của mirror trên Xray theo Excel hiện tại. Nó không regenerate testcase, không execute, không log bug Jira và không hard delete Xray issue.

**Quan trọng — cleanup ≠ publish:** cleanup CHỈ **gắn/gỡ label stale** cho TC bị bỏ khỏi/quay lại Excel. Việc **tạo TC mới + update TC cũ (cả steps)** lên Xray là do bước **re-publish `publish_testcases.js`** (Step 2b của `run_requirement_apply_approved.md`) — cleanup chạy **SAU** re-publish. Đừng dùng cleanup để đẩy TC mới.

## When To Use

| Scenario | Use This Prompt |
|---|---|
| Excel đã bỏ bớt TC sau Partial Rerun Apply Approved | Yes |
| Excel restore TC từng bị deprecated | Yes |
| Jira/Xray đã publish Test trước đó | Yes |
| Chỉ mới chạy Phase 1 lần đầu | No, chưa cần cleanup |
| Chưa có Human Review approval cho thay đổi testcase | No |
| Muốn xóa cứng Xray Test/Test Set | No |

## Inputs

| Input | Required | Notes |
|---|---|---|
| `PROJECT_OUTPUT_DIR` | Yes | Ví dụ `outputs/<YOUR_PROJECT>`. |
| `TASK_KEY` | Yes | Task/feature scope. |
| `JIRA_STORY_KEY` | Yes | Story/Task parent như `SAPP-3255`. |
| `HUMAN_REVIEW_STATUS` | Yes for apply | `APPROVED` hoặc `APPROVED_WITH_RISK`. |
| `APPROVED_REVIEW_FILE` | Recommended | Path tới `change/regen/review-checklist.md`. |
| `MODE` | Yes | `DRY_RUN` hoặc `APPLY`. |
| `UNLINK_STALE` | Optional | `YES` nếu QA muốn unlink stale Test khỏi Story/Task. |

## Gate Before Apply

Chỉ apply thật nếu tất cả điều kiện đúng:

| Gate | Required Result |
|---|---|
| Excel source of truth đã update sau approved merge | Yes |
| Human Review approval rõ ràng | Yes |
| Jira/Xray publish đã từng chạy trước đó | Yes |
| Dry-run cleanup đã được review | Yes |
| QA xác nhận apply cleanup | Yes |

Nếu thiếu bất kỳ gate nào, chỉ được chạy dry-run hoặc dừng.

## Workflow

### Step 0: Echo Scope

Trước khi đọc Excel hoặc gọi cleanup script, echo:

```text
PROJECT_OUTPUT_DIR=<value>
TASK_KEY=<value>
TASK_OUTPUT_DIR=<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>
Workflow=Partial Rerun - Xray Test Cleanup
MODE=<DRY_RUN|APPLY>
UNLINK_STALE=<YES|NO>
```

Nếu `TASK_KEY` không khớp yêu cầu user, dừng ngay.

### Step 1: Validate Artifacts

Kiểm tra:

- `<TASK_OUTPUT_DIR>/test-cases/*.xlsx`
- `<TASK_OUTPUT_DIR>/reports/jira-testcase-publish-summary.md` nếu đã publish
- `<TASK_OUTPUT_DIR>/change/regen/merge-summary.md` nếu cleanup đến từ partial rerun
- `APPROVED_REVIEW_FILE` nếu user cung cấp

Không sửa `.env` hoặc `.env.local` chung khi có session khác đang chạy.

### Step 2: Dry-run

Luôn chạy dry-run trước:

```powershell
npm run jira:testcase-cleanup:dry-run -- --project-output <PROJECT_OUTPUT_DIR> --task <TASK_KEY> --story <JIRA_STORY_KEY>
```

Review summary:

| Action | Meaning |
|---|---|
| `planned_deprecate` | Xray Test đã publish nhưng TC ID không còn trong Excel. |
| `planned_restore` | Xray Test có TC ID quay lại Excel nhưng còn label cleanup. |
| `active_keep` | Xray Test vẫn khớp Excel. |
| `skipped_no_tc_label` | Issue không có label `tc-*`, không tự xử lý. |
| `planned_unlink` | Chỉ có khi bật unlink stale khỏi Story/Task. |

### Step 3: Apply Approved

Chỉ chạy apply khi QA/Human Review xác nhận:

```powershell
npm run jira:testcase-cleanup -- --project-output <PROJECT_OUTPUT_DIR> --task <TASK_KEY> --story <JIRA_STORY_KEY> --apply --qa-approved
```

Nếu QA muốn bỏ coverage link của stale Test khỏi Story/Task, thêm:

```powershell
--unlink
```

## Xray Lifecycle Rules

- Excel là source of truth cho testcase active **khi cleanup** (quyết định TC nào còn/không còn active).
- Ở context cleanup, Xray là mirror của Excel; ở context **execute** (Phase 2 / partial execute), Xray là **nguồn** — hai context khác nhau, không mâu thuẫn.
- Không hard delete Xray `Test`.
- Không hard delete Xray `Test Set`.
- Stale Test chỉ được thêm label cleanup mặc định `deprecated,out-of-scope,stale-from-excel`.
- Test quay lại Excel được remove label cleanup để restore.
- Nếu trước đó publish có bật Test Set theo business flow, cleanup không xóa Test Set; stale Test vẫn được label để QA lọc/review.
- Unlink stale Test khỏi Story/Task là optional, mặc định tắt.
- Không log Jira bug từ partial rerun.

## Outputs

| Output | Location |
|---|---|
| Cleanup JSON | `<TASK_OUTPUT_DIR>/reports/jira-testcase-cleanup.json` |
| Cleanup summary | `<TASK_OUTPUT_DIR>/reports/jira-testcase-cleanup-summary.md` |
| Task tracking update | `<TASK_OUTPUT_DIR>/task.md` |

## Final Response

Trả lời ngắn:

- Mode đã chạy.
- Tổng Xray Test đã scan.
- Planned/Applied deprecate, restore, unlink.
- Đường dẫn cleanup summary.
- Blocker nếu có.

## Example

```text
Đọc partial-rerun/run_xray_test_cleanup.md và chạy:
PROJECT_OUTPUT_DIR=outputs/<YOUR_PROJECT>
TASK_KEY=<TASK_KEY>
JIRA_STORY_KEY=<JIRA_STORY_KEY>
HUMAN_REVIEW_STATUS=APPROVED
MODE=DRY_RUN
UNLINK_STALE=NO
```
