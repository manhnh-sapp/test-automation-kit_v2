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
