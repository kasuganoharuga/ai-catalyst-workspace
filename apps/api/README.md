# AI Catalyst API

Reserved FastAPI internal AI service (generation / rendering / RAG). Product
boundaries live in the [root README](../../README.md) — this app must not become
the general product backend, and must not write business tables.

V1 exposes a health check and an AI test stub, plus settings, JSON logging,
request-id, CORS, and a consistent error envelope.

## Development

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Or from the repo root: `pnpm dev:api` / `pnpm dev`.

## Environment

Copy [`.env.example`](.env.example) to `.env`.

Key variables:

- `APP_NAME`
- `APP_ENV`
- `LOG_LEVEL`
- `API_HOST`
- `API_PORT`
- `CORS_ORIGINS`
- `AI_PROVIDER`
- `AI_API_KEY`
- `SENTRY_DSN` (optional)
- `RELEASE` / `GIT_SHA` (optional)
