# Docker Development

Use Docker Compose from the repository root:

```bash
pnpm docker:up
```

The compose stack starts:

- `web` on `http://localhost:3000`
- `api` on `http://127.0.0.1:8000`

Stop the stack:

```bash
pnpm docker:down
```

The V1 app uses Next.js as the primary full-stack application. The FastAPI container is reserved for future AI workflow execution.
