# Harness hooks (forcing functions)

Hook script được **commit** (ở đây), nhưng cấu hình bật nằm ở `.claude/settings.json` — **local, gitignored** (mỗi máy tự khai). Copy đoạn dưới vào `.claude/settings.json` để bật (merge, đừng ghi đè hook khác).

## Hook có sẵn

| Hook | Event | Vai trò |
|---|---|---|
| `gate_on_write.js` | PostToolUse (Write\|Edit) | Chạy output_gate khi ghi `testcase-status.json` / `test-cases/*.md` → CHẶN output sai chuẩn ngay lúc ghi. |
| `inject_context.js` (G7) | SessionStart | Bơm context forcing-functions + kết quả preflight config-integrity vào MỌI phiên (chống "miss đọc file" tận gốc — harness inject, không để agent nhớ). |

## Cấu hình (.claude/settings.json)

```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [ { "type": "command", "command": "node scripts/qa/hooks/inject_context.js", "timeout": 30 } ] }
    ],
    "PostToolUse": [
      { "matcher": "Write|Edit", "hooks": [ { "type": "command", "command": "node scripts/qa/hooks/gate_on_write.js", "timeout": 60 } ] }
    ]
  }
}
```

Sau khi sửa `.claude/settings.json`: mở `/hooks` một lần (reload) hoặc khởi động lại phiên để harness nạp cấu hình mới.

> Hook là **forcing function** ở tầng harness — chạy tự động, không phụ thuộc agent nhớ gọi. Xem kế hoạch round-3 (G1–G10) và `CLAUDE.md`.
