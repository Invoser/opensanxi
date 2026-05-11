# Personal Assistant API

MVP backend for a personal assistant service built with TypeScript, Fastify, Prisma, and Postgres.

## Features

- `GET /health` and `GET /health/db`
- Memo CRUD with search by text and tag
- Transaction CRUD with summary totals
- AI tool endpoint for memo and transaction actions
- Audit event capture for writes, searches, summaries, and AI tool calls
- Dockerfile and local Postgres compose setup

## Requirements

- Node.js 20+
- Postgres 16+
- npm

## Setup

```bash
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

The API listens on `http://localhost:3000` by default.

## Docker

```bash
docker compose up --build
```

The compose file starts Postgres, applies Prisma migrations, and runs the API.

## Endpoints

### Health

- `GET /health`
- `GET /health/db`

### Memos

- `GET /memos?q=meeting&tag=work&archived=false&limit=25&offset=0`
- `GET /memos/:id`
- `POST /memos`
- `PATCH /memos/:id`
- `DELETE /memos/:id`

Example:

```json
{
  "title": "Call Alex",
  "content": "Discuss travel dates",
  "tags": ["personal", "planning"]
}
```

### Transactions

- `GET /transactions?type=EXPENSE&category=food&from=2026-01-01&to=2026-12-31`
- `GET /transactions/summary?currency=USD&from=2026-01-01`
- `GET /transactions/:id`
- `POST /transactions`
- `PATCH /transactions/:id`
- `DELETE /transactions/:id`

Example:

```json
{
  "type": "EXPENSE",
  "amount": 12.5,
  "currency": "USD",
  "category": "food",
  "description": "Lunch",
  "occurredAt": "2026-05-09T12:00:00.000Z"
}
```

### AI Tools

`POST /ai/tools`

Supported `tool` values:

- `memo.search`
- `memo.create`
- `transaction.create`
- `transaction.summary`
- `webhook.forward`

Example:

```json
{
  "tool": "memo.search",
  "input": {
    "q": "travel",
    "limit": 5
  }
}
```

`webhook.forward` requires `AI_WEBHOOK_URL` and optionally uses `AI_WEBHOOK_TOKEN` as a bearer token.

### Audit Events

- `GET /audit-events?action=CREATE&entity=Memo&limit=25&offset=0`

Set `X-Actor-Id` on requests to attach an actor to audit records.

## Validation

```bash
npm run lint
npm run build
```
