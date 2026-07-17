# Run Requirement Prepare Review

> Phase 1 của Requirement Change Management: tạo diff, impact, testcase draft và Human Review package.

## Purpose

Dùng prompt này khi tài liệu requirement/design/API đã được cập nhật nội dung sau khi đã có testcase hoặc execution result.

Phase này chỉ chuẩn bị review package. Nó không merge testcase chính, không execute testcase và không tự chuyển sang Phase 2.

Sau khi Human Review approve, `run_requirement_apply_approved.md` sẽ (tự động theo flow): merge testcase → **re-publish TC UPDATED+NEW lên Xray** (đúng subfolder Test Repository) → **pull affected từ Xray** làm nguồn execute → partial execute subset → **đẩy Test Execution + link Test Plan**. Draft ở phase này vì vậy cần TC ID + lifecycle + source trace rõ để phase sau map đúng.

## When To Use

| Scenario | Use This Prompt |
|---|---|
| BA cập nhật nội dung Jira/Confluence nhưng link không đổi | Yes |
| UIUX cập nhật nội dung Figma nhưng link/file không đổi | Yes |
| BE cập nhật nội dung Swagger/OpenAPI nhưng URL/file không đổi | Yes |
| Cần biết testcase nào bị ảnh hưởng bởi nội dung tài liệu mới | Yes |
| Chưa có testcase baseline | No, chạy Phase 1 chính của kit |
| Human Review đã approve và cần merge/execute | No, dùng `run_requirement_apply_approved.md` |
| Dev fix bug và cần rerun bug | No, dùng Rerun Main Flow |

## Inputs

| Input | Required | Notes |
|---|---|---|
| `PROJECT_OUTPUT_DIR` | Yes | Ví dụ `outputs/<YOUR_PROJECT>`. |
| `TASK_KEY` | Yes | Task/feature scope. |
| `UPDATED_DOC_URLS_OR_FILES` | Yes | Cùng link/file source đã dùng trước đó; nội dung có thể đã đổi. |
| `CHANGE_SOURCE` | Recommended | Jira, Confluence, Figma, Swagger/OpenAPI hoặc local file. |
| `CHANGE_NOTE` | Recommended | Tóm tắt phần BA/UIUX/BE đã sửa để giảm token. |
| `SCOPE_HINT` | Optional | Module, TC ID, endpoint, screen, user story. |

## Source Link Rule

Nguồn tài liệu không đổi đường link/path.

| Rule | Required Behavior |
|---|---|
| Link/path giữ nguyên | So sánh nội dung mới với snapshot/baseline cũ của cùng link/path. |
| Nội dung bên trong link thay đổi | Tạo diff theo section, endpoint, screen hoặc rule bị đổi. |
| User đưa link mới khác baseline | Không tự replace source cũ; hỏi xác nhận hoặc mark `NEED_REVIEW`. |
| Không có snapshot cũ | Dùng `task.md`, cached requirements/testcase trace và current source làm baseline tạm; ghi rõ limitation. |
| Link chết hoặc không đọc được | Mark blocker, không regenerate testcase đoán mò. |

## Files To Read

Đọc theo thứ tự tiết kiệm token:

| Priority | File/Source |
|---:|---|
| 1 | `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/task.md` |
| 2 | `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/test-cases/` testcase liên quan |
| 3 | `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/reports/phase1-summary.md` nếu có |
| 4 | `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/reports/execution-summary.md` nếu có |
| 5 | `<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>/change/snapshots/snapshot_context.json` nếu có |
| 6 | Source links/files trong `UPDATED_DOC_URLS_OR_FILES` |

Không đọc toàn bộ raw docs lớn nếu `CHANGE_NOTE` hoặc `SCOPE_HINT` đã chỉ rõ phạm vi.

## Workflow

### Step 0: Echo Scope

Trước khi ghi file hoặc chạy command, bắt buộc echo:

```text
PROJECT_OUTPUT_DIR=<value>
TASK_KEY=<value>
TASK_OUTPUT_DIR=<PROJECT_OUTPUT_DIR>/tasks/<TASK_KEY>
RUN_ID=<value-or-N/A>
Workflow=Partial Rerun Phase 1 Prepare Review
```

Nếu `TASK_KEY` không khớp yêu cầu user, dừng ngay.
Nếu yêu cầu hiện tại của user không nêu rõ `TASK_KEY`, không dùng `TASK_KEY` từ `.env` hoặc context cũ để chạy; phải hỏi lại.

Không chạy Partial Rerun Phase 1 song song cùng một `TASK_KEY` vì phase này ghi `change/snapshots`, `change/diffs`, `change/impact` và `change/regen` chính. Nếu cần thử nhiều hướng, dùng task branch/suffix riêng rồi Human Review trước khi merge.

### Step 1: Validate Scope

| Check | Action |
|---|---|
| `PROJECT_OUTPUT_DIR` và `TASK_KEY` tồn tại | Xác định task output path. |
| Testcase baseline tồn tại | Tiếp tục. |
| Không có testcase baseline | Dừng, đề xuất chạy Phase 1 chính. |
| Source link/path khác baseline | Không tự thay; ghi `SOURCE_LINK_CHANGED_NEED_REVIEW`. |

### Step 2: Detect Content Change

Thực hiện trực tiếp theo rule trong `partial-rerun/reference.md`.

Yêu cầu:

- Snapshot source mới theo cùng link/path.
- Tính content hash mới.
- So sánh với hash/snapshot cũ nếu có.
- Ghi rõ source nào không đổi nội dung để tránh regenerate thừa.
- Ghi diff ngắn gọn theo requirement/API/design/data section.

Output:

```text
change/snapshots/snapshot_context.json
change/snapshots/source-after.*
change/diffs/
```

### Step 3: Analyze Impact

Thực hiện trực tiếp theo rule trong `partial-rerun/reference.md`.

Yêu cầu:

- Mapping từng diff item tới requirement/business rule/API/UI/data behavior.
- Mapping tới TC ID hiện có.
- Gán risk `Critical`, `High`, `Medium`, `Low`.
- Gán lifecycle `ACTIVE`, `UPDATED`, `DEPRECATED`, `NEW`, `NEED_REVIEW`.
- Không đánh dấu `UPDATED` nếu diff không làm thay đổi expected/steps/assertion/data.

Output:

```text
change/impact/impact-matrix.md
change/impact/affected-tc-map.json
change/impact/risk-summary.md
```

### Step 4: Regenerate Draft

Thực hiện trực tiếp theo rule trong `partial-rerun/reference.md`.

Yêu cầu:

- Chỉ regenerate testcase `UPDATED` và `NEW`.
- Lưu testcase bị `DEPRECATED` riêng, không xóa khỏi testcase chính.
- Giữ TC ID cũ cho testcase `UPDATED`.
- TC `NEW` dùng ID tiếp nối convention hiện tại.
- Mỗi testcase draft phải có source trace, change reason, expected mới và assertion intent.
- Không ghi đè testcase chính.

Output:

```text
change/regen/regenerated_test_cases.md
change/regen/deprecated_test_cases.md
change/regen/regenerated_test_cases.xlsx
change/regen/lifecycle-summary.md
```

### Step 5: Build Human Review Package

Tạo:

```text
change/regen/review-checklist.md
```

Checklist bắt buộc:

| Column | Required |
|---|---|
| Change ID | Yes |
| Source link/path | Yes |
| Source section | Yes |
| TC ID | Yes |
| Lifecycle | Yes |
| Risk | Yes |
| Proposed change | Yes |
| Expected result source trace | Yes |
| Reviewer decision | Yes |
| Blocker/question | If any |

Phase này kết thúc tại:

```text
WAITING_FOR_HUMAN_REVIEW
```

## Hard Rules

- Không merge testcase chính.
- Không execute testcase.
- Không log Jira bug.
- Không tự chuyển sang Phase 2.
- Không tự thay source link/path.
- Không đổi expected result nếu source mới chưa rõ.
- Không tạo testcase mới nếu behavior đã được cover bởi testcase hiện có.
- Không bỏ coverage Critical/High nếu chưa có risk note và Human Review.

## Final Response

Trả lời ngắn:

- Source link/path đã xử lý.
- Source nào có content change.
- Diff chính.
- Số TC theo lifecycle.
- Review package path.
- Trạng thái `WAITING_FOR_HUMAN_REVIEW`.
- Blocker/`NEED_REVIEW` nếu có.

## Example

```text
Đọc partial-rerun/run_requirement_prepare_review.md và chạy:
PROJECT_OUTPUT_DIR=outputs/<YOUR_PROJECT>
TASK_KEY=<TASK_KEY>
UPDATED_DOC_URLS_OR_FILES=<same links/files>
CHANGE_SOURCE=Confluence + Swagger
CHANGE_NOTE=<BA/BE update summary>
SCOPE_HINT=<module/endpoints/TC IDs nếu có>
```


