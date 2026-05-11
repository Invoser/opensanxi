# Personal Assistant Web

MVP web shell for the personal assistant workspace. It includes a responsive React UI, page navigation, API client helpers, and Docker packaging.

## Pages

- Home dashboard
- Memos
- Finance
- Chat handoff / iframe placeholder
- Settings

## Setup

```bash
cd D:\webdev\zhuli\personal-assistant-web
npm install
copy .env.example .env
npm run dev
```

## Environment

```bash
VITE_API_BASE_URL=http://localhost:8080/api
VITE_CHAT_URL=http://localhost:3080
```

`VITE_API_BASE_URL` points to the backend API. `VITE_CHAT_URL` points to the chat service, such as a local LibreChat instance.

## Build

```bash
npm run build
```

## Docker

```bash
docker build -t personal-assistant-web .
docker run --rm -p 8088:80 personal-assistant-web
```
