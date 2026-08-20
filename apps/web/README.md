# AI Catalyst Web

Next.js full-stack app for the AI Catalyst Founder Toolkit. Service boundaries
and monorepo layout live in the [root README](../../README.md).

## Development

From the repo root:

```bash
pnpm dev:web
```

Open [http://localhost:3000](http://localhost:3000). Prefer `pnpm dev` at the
root when you also need Postgres + API (see root README).

## Environment

Copy [`.env.example`](.env.example) to `.env.local` for local overrides
(`DATABASE_URL`, `BETTER_AUTH_SECRET`, `AUTH_ISSUER_URL`, `MCP_RESOURCE_URL`).
`MCP_RESOURCE_URL` must match `apps/mcp`'s env of the same name — see
[`lib/mcp-oauth-compat/README.md`](lib/mcp-oauth-compat/README.md).

## Quality

Run checks from the **repo root** (`pnpm lint`, `pnpm typecheck:web`,
`pnpm test`, `pnpm test:db`, `pnpm build`). App-local:

```bash
pnpm --filter web lint
pnpm --filter web typecheck
pnpm --filter web run auth:check
```

`auth:check` verifies Better Auth's expected schema (from `lib/auth.ts`) still
matches the database after the latest migration — see
`scripts/check-auth-schema.ts`. It never writes; a mismatch means a new
`infra/database/migrations/NNNN_*.sql` is needed.

Web test conventions: [`tests/README.md`](tests/README.md).
