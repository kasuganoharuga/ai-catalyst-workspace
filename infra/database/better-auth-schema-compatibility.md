# Better Auth Schema Compatibility

How `infra/database/migrations/0001_aidb_v5_baseline.sql`'s `users` /
`sessions` / `accounts` / `verifications` tables were verified against what
Better Auth (pinned to `1.6.23`, matching `apps/web/package.json`'s
`better-auth` dependency) actually expects — not just what its docs describe.

## Method

Better Auth's `generate` command for the Kysely/Postgres adapter doesn't only
do static generation from config: it **introspects the live database** the
`auth` instance is connected to and reports either a full `create table` diff
or `Your schema is already up to date.`. That makes it a real compatibility
check, not just documentation-reading:

```powershell
docker compose -f infra/docker/docker-compose.yml down -v
docker compose -f infra/docker/docker-compose.yml up -d --wait db   # empty db
pnpm --filter web exec auth generate --output ../../local/better-auth-reference-schema.sql --dialect postgresql -y
```

Against the **empty** database this generated the full reference schema
Better Auth would create from `apps/web/lib/auth.ts`'s config (field mappings,
`generateId: "uuid"`, `additionalFields.role`, etc.):

```sql
create table "users" ("id" uuid default pg_catalog.gen_random_uuid() not null primary key, "name" text not null, "email" text not null unique, "email_verified" boolean not null, "image" text, "created_at" timestamptz default CURRENT_TIMESTAMP not null, "updated_at" timestamptz default CURRENT_TIMESTAMP not null, "role" text not null);

create table "sessions" ("id" uuid default pg_catalog.gen_random_uuid() not null primary key, "expires_at" timestamptz not null, "token" text not null unique, "created_at" timestamptz default CURRENT_TIMESTAMP not null, "updated_at" timestamptz not null, "ip_address" text, "user_agent" text, "user_id" uuid not null references "users" ("id") on delete cascade);

create table "accounts" ("id" uuid default pg_catalog.gen_random_uuid() not null primary key, "account_id" text not null, "provider_id" text not null, "user_id" uuid not null references "users" ("id") on delete cascade, "access_token" text, "refresh_token" text, "id_token" text, "access_token_expires_at" timestamptz, "refresh_token_expires_at" timestamptz, "scope" text, "password" text, "created_at" timestamptz default CURRENT_TIMESTAMP not null, "updated_at" timestamptz not null);

create table "verifications" ("id" uuid default pg_catalog.gen_random_uuid() not null primary key, "identifier" text not null, "value" text not null, "expires_at" timestamptz not null, "created_at" timestamptz default CURRENT_TIMESTAMP not null, "updated_at" timestamptz default CURRENT_TIMESTAMP not null);

create index "sessions_user_id_idx" on "sessions" ("user_id");
create index "accounts_user_id_idx" on "accounts" ("user_id");
create index "verifications_identifier_idx" on "verifications" ("identifier");
```

This confirmed the field mapping in `auth.ts` (`fields: {...}`,
`modelName: "users"` etc.) resolves to exactly the snake_case column names
`0001_aidb_v5_baseline.sql` already uses — a config/name-mapping mistake would
have shown up here as a completely different set of column names, not a
missing-column diff.

## Field-by-field comparison

| Table | Better Auth requires | `0001_aidb_v5_baseline.sql` has | Verdict |
|---|---|---|---|
| `users` | `id`, `name`, `email` (unique), `email_verified`, `image`, `created_at`, `updated_at`, `role` | all of the above, plus `deleted_at`, a `role` check constraint, a `default 'pending'` on `role`, and a case-insensitive unique index on `email` | ✅ compatible — extra columns/constraints don't affect Better Auth, and the `role` check values (`pending`/`founder`/`mentor`/`admin`) already match what `databaseHooks.user.create.before` writes |
| `sessions` | `id`, `expires_at`, `token` (unique), `created_at`, `updated_at`, `ip_address`, `user_agent`, `user_id` (FK → `users.id` cascade), index on `user_id` | all of the above; index is named `idx_sessions_user` instead of `sessions_user_id_idx` | ✅ compatible — Better Auth reads/writes by column name, not index name |
| `accounts` | `id`, `account_id`, `provider_id`, `user_id` (FK cascade), `access_token`, `refresh_token`, `id_token`, `access_token_expires_at`, `refresh_token_expires_at`, `scope`, `password`, `created_at`, `updated_at`, index on `user_id` | all of the above, plus a `unique (provider_id, account_id)` constraint and index named `idx_accounts_user` | ✅ compatible — the extra uniqueness constraint is stricter than what Better Auth requires, never violated by it |
| `verifications` | `id`, `identifier`, `value`, `expires_at`, `created_at`, `updated_at`, index on `identifier` | all columns present; **no index on `identifier`** | ⚠️ gap — see below |

## Gap found and fixed

`verifications` had every required column but was missing the index on
`identifier` that Better Auth's reference schema creates (every
email-verification / password-reset / magic-link check does a lookup by
`identifier`). Fixed in
[`0002_verifications_identifier_index.sql`](migrations/0002_verifications_identifier_index.sql):

```sql
create index verifications_identifier_idx
  on verifications (identifier);
```

Re-running the same `auth generate` introspection against the migrated
database (`0001` + `0002` applied) confirmed the gap is closed:

```
Your schema is already up to date.
```

## Deferred (Iteration 3, per `local/00/AI Catalyst V1 迭代计划.md`)

- OAuth provider schema pre-validation (`socialProviders` config, provider
  columns beyond what email/password needs).
- `account.encryptOAuthTokens` is set in `apps/web/lib/auth.ts`, but no OAuth
  provider is configured yet in V1, so no OAuth tokens are written to
  `accounts` to exercise it.
