# apps/web tests

These are integration tests, not unit tests — `auth.db.test.ts` and
`auth.http.test.ts` write real rows to the local Postgres database (via
`apps/web/lib/auth.ts` or `@ai-catalyst/services`), then clean up what they
created in an `afterAll`.

## Prerequisites

1. `db` running and migrated: `pnpm docker:up` (or `pnpm db:migrate` if `db`
   is already up).
2. `apps/web/.env.local` with at least `DATABASE_URL` and
   `BETTER_AUTH_SECRET` set (copy from `apps/web/.env.example`).

## Running

```powershell
pnpm --filter web test
```

## What's covered where

- `auth.db.test.ts` calls `auth.api.*` directly, bypassing the HTTP route
  handler, to isolate Better Auth's core write/read behavior: role forced to
  `pending` and name forced to email on signup, the case-insensitive unique
  email constraint, and a matching `sessions` row on sign-in.
- `auth.http.test.ts` calls the real exported `GET`/`POST` from
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
