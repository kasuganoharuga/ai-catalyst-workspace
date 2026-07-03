# Docker Development

Use Docker Compose from the repository root for backend services:

```bash
pnpm docker:up
```

The compose stack starts:

- `api` on `http://127.0.0.1:8000`

Run the Next.js frontend locally with `pnpm dev:web`.

Stop the stack:

```bash
pnpm docker:down
```

The V1 app uses Next.js as the primary full-stack application and runs locally during development. Docker is reserved for backend services, and future databases should be added to this compose stack.
