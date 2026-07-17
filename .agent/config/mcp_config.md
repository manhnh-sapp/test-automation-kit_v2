# Cấu hình MCP

> Template an toàn để cấu hình MCP server cho Jira, Confluence, Figma, HubSpot và Playwright.

## Mục đích

File này cung cấp mẫu cấu hình MCP dùng chung cho kit. Không lưu token thật trong file này.

## Khi Nào Dùng

| Trường hợp | Cách dùng |
|---|---|
| Cần kết nối Jira/Confluence | Dùng server `atlassian`. |
| Cần đọc Figma design | Dùng server `figma`. |
| Cần đọc dữ liệu HubSpot test | Dùng server `hubspot` với package đã được team approve. |
| Cần inspect UI qua browser | Dùng server `playwright`. |
| Cần cấu hình local có secret | Lưu trong `.env.local`, `.env` hoặc MCP settings local của IDE. |

## Template

```json
{
  "mcpServers": {
    "atlassian": {
      "command": "npx.cmd",
      "args": [
        "-y",
        "mcp-atlassian"
      ],
      "env": {
        "JIRA_URL": "${JIRA_URL}",
        "JIRA_USERNAME": "${JIRA_USERNAME}",
        "JIRA_API_TOKEN": "${JIRA_API_TOKEN}",
        "CONFLUENCE_URL": "${CONFLUENCE_URL}",
        "CONFLUENCE_USERNAME": "${CONFLUENCE_USERNAME}",
        "CONFLUENCE_API_TOKEN": "${CONFLUENCE_API_TOKEN}"
      }
    },
    "figma": {
      "command": "npx.cmd",
      "args": [
        "-y",
        "@tmegit/figma-developer-mcp",
        "--stdio"
      ],
      "env": {
        "FIGMA_API_KEY": "${FIGMA_API_KEY}"
      }
    },
    "hubspot": {
      "command": "npx.cmd",
      "args": [
        "-y",
        "@hubspot/mcp-server@0.4.0"
      ],
      "env": {
        "HUBSPOT_ENV": "${HUBSPOT_ENV}",
        "HUBSPOT_BASE_URL": "${HUBSPOT_BASE_URL}",
        "HUBSPOT_UI_DOMAIN": "${HUBSPOT_UI_DOMAIN}",
        "HUBSPOT_PORTAL_ID": "${HUBSPOT_PORTAL_ID}",
        "HUBSPOT_ACCESS_TOKEN": "${HUBSPOT_ACCESS_TOKEN}",
        "HUBSPOT_PRIVATE_APP_ACCESS_TOKEN": "${HUBSPOT_ACCESS_TOKEN}"
      }
    },
    "playwright": {
      "command": "npx.cmd",
      "args": [
        "-y",
        "@playwright/mcp"
      ]
    }
  }
}
```

## Server

| Server | Mục đích | Package |
|---|---|---|
| `atlassian` | Kết nối Jira và Confluence để đọc story, requirement và tài liệu BA. | `mcp-atlassian` |
| `figma` | Đọc Figma để phân tích UI, flow và hỗ trợ sinh testcase/locator. | `@tmegit/figma-developer-mcp` |
| `hubspot` | Đọc dữ liệu HubSpot test như contact, company, deal hoặc metadata CRM phục vụ testcase. | `@hubspot/mcp-server@0.4.0` |
| `playwright` | Inspect UI và hỗ trợ browser automation qua MCP. | `@playwright/mcp` |

## Setup Local

1. Copy key cần thiết từ `.env.example` sang `.env.local` hoặc `.env`.
2. Đặt Jira, Confluence, Figma và HubSpot test token thật trong file local hoặc MCP settings của IDE.
3. Copy JSON template phía trên vào cấu hình MCP local.
4. Nếu dùng HubSpot, chạy `hs account auth` trước để tạo config CLI tại `C:\Users\<USER>\.hscli\config.yml`.
5. Nếu IDE không tự expand `${...}`, thay placeholder bằng local env value trong cấu hình local, không sửa file template này.

## Rules

- Không commit token, password, cookie, private key hoặc service-account JSON.
- Không hardcode secret vào Markdown dùng chung.
- Chỉ dùng HubSpot test account cho MCP/automation trong kit.
- Không dùng HubSpot production account trong kit nếu chưa có approval riêng.
- Không dùng HubSpot MCP package lạ/chưa review vì MCP server có quyền truy cập dữ liệu CRM.
- Nếu cần ghi chú cấu hình local có secret, tạo `.agent/config/mcp_config.local.md`; file local này phải nằm ngoài Git.
- Nếu token từng bị commit hoặc chia sẻ, phải rotate token trong provider console.

## References

| Document | Purpose |
|---|---|
| [README.md](../../README.md) | Landing page của kit. |
| [RULE_GLOBAL.md](../../RULE_GLOBAL.md) | Rule vận hành chung. |
