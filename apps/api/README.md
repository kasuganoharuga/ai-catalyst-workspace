# AI Catalyst API

Reserved FastAPI service for future AI workflow execution, file processing, and RAG features.

V1 uses Next.js as the primary full-stack application. This service intentionally exposes only a health check and an AI test stub.

## Backend Foundation

The API includes lightweight production-oriented infrastructure:

- Settings are loaded from `.env` through `pydantic-settings`.
- Logging uses Python's standard library and is controlled by `LOG_LEVEL`.
- Every request gets an `X-Request-ID` response header.
- Validation, HTTP, and unhandled errors return a consistent error envelope.
- CORS origins are configured through `CORS_ORIGINS`.

Error responses use this shape:

```json
{
  "error": {
    "code": "HTTP_ERROR",
    "message": "Not Found",
    "request_id": "..."
  }
}
```

## Development

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Environment

Copy `.env.example` to `.env` for local overrides.

Key variables:

- `APP_NAME`
- `APP_ENV`
- `LOG_LEVEL`
- `API_HOST`
- `API_PORT`
- `CORS_ORIGINS`
- `AI_PROVIDER`
- `AI_API_KEY`
