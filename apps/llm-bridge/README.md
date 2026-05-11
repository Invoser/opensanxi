# Personal Assistant LLM Bridge

OpenAI-compatible local bridge for LibreChat.

It exposes:

- `GET /health`
- `GET /v1/models`
- `POST /v1/chat/completions`

The bridge validates LibreChat requests with `API_SERVER_KEY`, forwards model calls to a Responses API-compatible upstream using `UPSTREAM_API_KEY` or `OPENAI_API_KEY`, and returns Chat Completions-shaped responses.

This is intentionally separate from upstream LibreChat and Hermes code so those projects can be updated independently.
