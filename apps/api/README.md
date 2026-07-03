# AI Catalyst API

Reserved FastAPI service for future AI workflow execution, file processing, and RAG features.

V1 uses Next.js as the primary full-stack application. This service intentionally exposes only a health check and an AI test stub.

## Development

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
