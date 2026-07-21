# Knowledge Base — Schema

> Bộ nhớ học (learning loop) của kit. Lưu **fact đã xác nhận**, dùng lại xuyên task.
> Truy vấn ở giai đoạn này theo **module/tag** qua `index.json` (JSON thuần, KHÔNG vector store).

## Nguyên tắc

- **Chỉ ghi fact đã qua gate.** Bug chỉ ghi sau khi qua Jira gate ở
  `.agent/workflows/phase2_04_report_and_jira_gate.md` (đã loại flaky/setup/data/prompt).
- **Suggest-only.** Knowledge Base là dữ liệu tham chiếu, không tự đưa ra kết luận PASS/FAIL
  hay tự thay đổi scope. Người đọc (QA/agent) quyết định.
- **Không secret / không PII khách hàng.** Không ghi email/số điện thoại khách hàng, credential,
  connection string. Chỉ mô tả bug/module/root cause ở mức kỹ thuật.
- **JSON thuần.** Mỗi entry là 1 file JSON; `index.json` là index phẳng để tra theo module/tag.

## Thư mục

```
knowledge/
├── bugs/                 # 1 file JSON / bug đã confirm là product issue (qua gate)
├── root_causes/          # root cause đã xác định, gắn module/file
├── locators/             # lịch sử locator từng bị heal (Locator Healing — Giai đoạn 2 mới ghi)
├── historical_execution/ # snapshot pass/fail theo module theo thời gian (input cho Dashboard)
├── index.json            # index phẳng: tra cứu theo module/tag
├── examples/             # dữ liệu MẪU minh hoạ (không phải learning data thật — xem examples/README.md)
└── SCHEMA.md             # file này
```

> `knowledge/` (live) khởi tạo **rỗng** cho dự án mới; `learning_recorder` điền dần khi chạy task thật.
> Muốn xem Dashboard có số liệu: copy `examples/*` vào các thư mục tương ứng rồi `npm run dashboard`.

## `bugs/<TASK_KEY>__<slug>.json`

```json
{
  "id": "SAPP-3255",
  "bug": "Timezone hiển thị sai ở Report",
  "module": "Report",
  "tags": ["timezone", "report", "display"],
  "root_cause_ref": "root_causes/report-timezone-utc.json",
  "task_key": "SAPP-3255",
  "detected_phase": "phase2",
  "confirmed_via_gate": true,
  "jira_status": "Open",
  "created_at": "2026-07-21"
}
```

| Field | Bắt buộc | Ý nghĩa |
|---|---|---|
| `id` | ✓ | Jira key hoặc id nội bộ của bug. |
| `bug` | ✓ | Mô tả ngắn (tiếng Việt, 1 dòng). |
| `module` | ✓ | Module nghiệp vụ (khớp cột `Module` của testcase). |
| `tags` | ✓ | Tag tra cứu (kebab/lowercase). |
| `root_cause_ref` |  | Đường dẫn tương đối tới file trong `root_causes/` (nếu đã xác định). |
| `task_key` | ✓ | TASK_KEY phát hiện bug. |
| `detected_phase` | ✓ | `phase1` \| `phase2` \| `rerun`. |
| `confirmed_via_gate` | ✓ | Luôn `true` — chỉ ghi khi đã qua Jira gate. |
| `jira_status` | ✓ | `Open` \| `In Progress` \| `Done` (đồng bộ khi rerun chuyển Done). |
| `created_at` | ✓ | ISO date (YYYY-MM-DD). |

## `root_causes/<slug>.json`

`<slug>` = `<module-lowercase>-<mô-tả-kebab>`, vd `report-timezone-utc`.

```json
{
  "id": "report-timezone-utc",
  "summary": "Backend convert UTC sai timezone khi render Report",
  "module": "Report",
  "affected_files": [],
  "related_bugs": ["SAPP-3255"],
  "status": "open",
  "resolved_at": null
}
```

| Field | Bắt buộc | Ý nghĩa |
|---|---|---|
| `id` | ✓ | Slug, trùng tên file (không đuôi). |
| `summary` | ✓ | Root cause đã xác định (không phải triệu chứng). |
| `module` | ✓ | Module liên quan. |
| `affected_files` |  | File/đường dẫn code liên quan (nếu biết chắc). |
| `related_bugs` | ✓ | Danh sách `id` bug trong `bugs/`. |
| `status` | ✓ | `open` \| `resolved`. |
| `resolved_at` |  | ISO date khi rerun xác nhận PASS thật + Jira Done. |

## `historical_execution/<TASK_KEY>__<YYYY-MM-DD>.json`

Snapshot kết quả execute theo module (input cho Dashboard — Giai đoạn 2).

```json
{
  "task_key": "SAPP-3255",
  "date": "2026-07-21",
  "phase": "phase2",
  "unassisted_pass_rate": 0.83,
  "modules": {
    "Report": { "total": 12, "pass": 10, "fail": 2, "skip": 0 },
    "Login":  { "total": 5,  "pass": 5,  "fail": 0, "skip": 0 }
  }
}
```

Nguồn số liệu: `<TASK_OUTPUT_DIR>/reports/execution-summary.md` (đã có unassisted pass rate).

## `locators/<module>__<slug>.json` (Giai đoạn 2 — Locator Healing)

Ghi bởi `locator_healing_agent` khi heal thành công (chỉ locator bước ACTION, confidence cao).
Tuân theo `.agent/rules/locator_healing_policy.md`.

```json
{
  "element": "Nút Lưu ở form Report",
  "module": "Report",
  "target_type": "action",
  "original": "getByRole('button', { name: 'Lưu' })",
  "healed_to": "getByRole('button', { name: 'Lưu thay đổi' })",
  "confidence_basis": ["accessible_name_exact", "same_role", "same_dom_region"],
  "task_key": "SAPP-3255",
  "healed_at": "2026-07-21"
}
```

| Field | Ý nghĩa |
|---|---|
| `target_type` | Luôn `"action"` — KHÔNG BAO GIỜ heal locator `assertion` (policy). |
| `original` / `healed_to` | Locator trước/sau heal; `healed_to` không được dùng CSS động/`nth-child`/XPath tuyệt đối. |
| `confidence_basis` | 3 tiêu chí đã thoả: `accessible_name_exact`, `same_role`, `same_dom_region` (phải đủ cả 3). |

## `index.json`

Index phẳng để tra cứu theo module/tag mà không phải quét toàn bộ thư mục.

```json
{
  "version": 1,
  "updated_at": "2026-07-21",
  "entries": [
    {
      "type": "bug",
      "file": "bugs/SAPP-3255__timezone-report.json",
      "module": "Report",
      "tags": ["timezone", "report"],
      "task_key": "SAPP-3255",
      "status": "Open"
    },
    {
      "type": "root_cause",
      "file": "root_causes/report-timezone-utc.json",
      "module": "Report",
      "tags": ["timezone"],
      "task_key": "SAPP-3255",
      "status": "open"
    }
  ]
}
```

- `type`: `bug` | `root_cause` | `historical_execution` | `locator`.
- Tra theo module = lọc `entries` theo `module`; tra theo tag = lọc theo `tags`.
- Mỗi lần thêm/cập nhật entry file → cập nhật `entries` tương ứng + `updated_at`.
