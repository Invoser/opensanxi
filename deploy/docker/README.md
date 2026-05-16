# OpenSanxi Docker Deployment

This directory contains the Docker Compose deployment for OpenSanxi.

## Services

- `caddy`: reverse proxy and optional outer Basic Auth.
- `personal-web`: React web UI.
- `personal-api`: Fastify API for memos, transactions, summaries, and AI tool endpoints.
- `personal-api-migrate`: one-shot Prisma migration job.
- `personal-mcp`: MCP HTTP server exposing memo and finance tools.
- `llm-bridge`: default OpenAI-compatible bridge for LibreChat.
- `librechat`: upstream LibreChat chat UI/API.
- `librechat-rag`, `meilisearch`, `mongo`, `postgres`: LibreChat and data dependencies.
- `hermes`: optional advanced Hermes agent profile; not part of the default chat path.

The Compose project name is `opensanxi`. Services still use the `personal-*`
internal names for compatibility with the existing app configuration.

## Quick Start

```powershell
cd deploy/docker
Copy-Item .\env\.env.example .\.env
```

Edit `.env` before starting:

- `BASIC_AUTH_USER`
- `BASIC_AUTH_HASH`
- `API_SERVER_KEY`
- `UPSTREAM_API_KEY` or `OPENAI_API_KEY`
- database and Meilisearch passwords for any non-local deployment

Generate a Caddy-compatible password hash:

```powershell
docker run --rm caddy:2.10-alpine caddy hash-password --plaintext "your-password"
```

Validate the config:

```powershell
docker compose --env-file .\.env -f .\compose.yaml -f .\compose.dev.yaml config
```

Start the web/API stack:

```powershell
docker compose --env-file .\.env -f .\compose.yaml -f .\compose.dev.yaml up -d
```

Start the AI/chat stack as well:

```powershell
docker compose --env-file .\.env -f .\compose.yaml -f .\compose.dev.yaml --profile ai --profile chat up -d
```

Open:

- Web UI: `http://localhost:8088`
- API: `http://localhost:8088/api/health`
- LibreChat: `http://localhost:8088/chat/`

## Profiles

- No profile: web, API, migrations, Postgres, and Caddy.
- `ai`: MCP server, LLM bridge, and Mongo.
- `chat`: LibreChat, LLM bridge, RAG API, Meilisearch, and Mongo.
- `hermes`: optional Hermes agent gateway. Start it only when you explicitly want Hermes in addition to the default LLM bridge.

## Production

For production, copy examples to real env files and keep them out of git:

```powershell
Copy-Item .\env\personal-api.env.example .\env\personal-api.env
Copy-Item .\env\personal-web.env.example .\env\personal-web.env
Copy-Item .\env\personal-mcp.env.example .\env\personal-mcp.env
Copy-Item .\env\librechat.env.example .\env\librechat.env
Copy-Item .\env\llm-bridge.env.example .\env\llm-bridge.env
Copy-Item .\hermes\hermes.env.example .\hermes\hermes.env
```

Then validate:

```powershell
docker compose --env-file .\.env -f .\compose.yaml -f .\compose.prod.yaml --profile ai --profile chat config
```

Use `compose.prod.yaml` when you want fixed image names and no host-exposed
database/search ports. Use `compose.n100.yaml` as an example for small local
servers that build images directly on the host.

## Upstream Projects

OpenSanxi does not vendor LibreChat, Hermes, or OpenClaw source code. It uses
LibreChat images, uses `llm-bridge` as the default AI connection layer, and
keeps Hermes as an optional separate profile. See `THIRD_PARTY_NOTICES.md` at
the repository root for licenses.
