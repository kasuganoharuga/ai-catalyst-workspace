# Docker Development

Use Docker Compose from the repository root for backend services:

```bash
pnpm docker:up
```

The compose stack starts:

- `api` on `http://127.0.0.1:8000`
- `db` (PostgreSQL) on `127.0.0.1:5432`

Run the Next.js frontend locally with `pnpm dev:web`.

Stop the stack:

```bash
pnpm docker:down
```

The V1 app uses Next.js as the primary full-stack application and runs locally during development. Docker is reserved for backend services and local databases.

Default local database credentials:

```text
DATABASE_URL=postgresql://ai_catalyst:ai_catalyst@127.0.0.1:5432/ai_catalyst
```
