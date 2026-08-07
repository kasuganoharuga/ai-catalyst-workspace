# apps/web tests

Files named `*.db.test.ts` here are integration tests, not unit tests —
`auth.db.test.ts`, `auth.http.db.test.ts` and `mcp-oauth.http.db.test.ts` write
real rows to the local Postgres database (via `apps/web/lib/auth.ts` or
`@ai-catalyst/services`), then clean up what they created in an `afterAll`.
Everything else in this directory runs offline.

## Prerequisites

1. `db` running and migrated: `pnpm docker:up` (or `pnpm db:migrate` if `db`
   is already up).
2. `apps/web/.env.local` with at least `DATABASE_URL` and
   `BETTER_AUTH_SECRET` set (copy from `apps/web/.env.example`).

## Running

These run from the repository root, via the `web-unit` / `web-db` projects in
[`vitest.config.ts`](../../../vitest.config.ts):

```powershell
pnpm test                          # offline tests only (all packages + web)
pnpm test:db                       # database-backed tests (all packages + web)
pnpm test:db apps/web/tests        # just this directory's database tests
```

## What's covered where

- `auth.db.test.ts` calls `auth.api.*` directly, bypassing the HTTP route
  handler, to isolate Better Auth's core write/read behavior: role forced to
  `pending` and name forced to email on signup, the case-insensitive unique
  email constraint, and a matching `sessions` row on sign-in.
- `auth.http.db.test.ts` calls the real exported `GET`/`POST` from
  `app/api/auth/[...all]/route.ts` with plain `Request` objects, round-tripping
  the `Set-Cookie` → `Cookie` header the way a browser would, covering the
  full register → session → sign-out flow over the actual HTTP contract. It
  also sends a raw JSON body with an extra `role: "admin"` field (not
  expressible through the typed auth client) to confirm the server ignores
  it — the real attack surface for that guarantee.

Program-run create/Branch/Module business behavior is covered at the service
layer by `packages/services/src/workflow/index.db.test.ts`. Web mutations
that used to have HTTP route-handler tests now go through server actions in
`lib/actions/*`.
