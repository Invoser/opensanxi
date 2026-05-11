# Personal Assistant MCP

Node/TypeScript MCP server that exposes memo and finance tools backed by the Personal API.
It runs as Streamable HTTP by default for Docker deployments and can run over stdio for local Hermes debugging.

## Tools

- `add_memo` -> `POST /api/ai/tools/add_memo`
- `search_memos` -> `POST /api/ai/tools/search_memos`
- `add_transaction` -> `POST /api/ai/tools/add_transaction`
- `query_transactions` -> `POST /api/ai/tools/query_transactions`
- `monthly_finance_summary` -> `POST /api/ai/tools/monthly_finance_summary`

The MCP server validates narrow, typed tool inputs and forwards the accepted JSON payload to the matching Personal API endpoint. The Personal API remains the system of record and should do its own validation, authorization, and audit logging.

## Configuration

Copy `.env.example` to `.env` in your runtime environment and set:

| Variable | Required | Description |
| --- | --- | --- |
| `PERSONAL_API_BASE_URL` | Yes | Base URL for the Personal API, without a trailing slash. |
| `PERSONAL_API_TOKEN` | No | Bearer token sent to the Personal API. |
| `PERSONAL_API_TIMEOUT_MS` | No | Request timeout in milliseconds. Defaults to `15000`. |
| `MCP_TRANSPORT` | No | `http` or `stdio`. Defaults to `http`. |
| `HOST` | No | HTTP bind host. Defaults to `0.0.0.0`. |
| `PORT` | No | HTTP port. Defaults to `8787`. |
| `MCP_PATH` | No | HTTP MCP path. Defaults to `/mcp`. |

## Local Development

```bash
npm install
npm run typecheck
npm run build
PERSONAL_API_BASE_URL=http://127.0.0.1:3001 npm run dev
```

## Production Run

```bash
npm ci
npm run build
PERSONAL_API_BASE_URL=http://personal-api:8080 PERSONAL_API_TOKEN=... npm start
```

## Docker

```bash
docker build -t personal-assistant-mcp .
docker run --rm -i \
  -p 8787:8787 \
  -e PERSONAL_API_BASE_URL=http://personal-api:8080 \
  -e PERSONAL_API_TOKEN=replace-with-token \
  personal-assistant-mcp
```

## Hermes MCP Example

HTTP deployment:

```json
{
  "mcpServers": {
    "personal-assistant": {
      "type": "streamable-http",
      "url": "http://personal-mcp:8787/mcp"
    }
  }
}
```

Stdio deployment for local debugging:

```json
{
  "mcpServers": {
    "personal-assistant": {
      "command": "node",
      "args": ["D:/webdev/zhuli/personal-assistant-mcp/dist/index.js"],
      "env": {
        "MCP_TRANSPORT": "stdio",
        "PERSONAL_API_BASE_URL": "http://127.0.0.1:3001",
        "PERSONAL_API_TOKEN": "replace-with-token"
      }
    }
  }
}
```
