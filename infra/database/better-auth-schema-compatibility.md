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

## PR 2.2: MCP OAuth provider tables (`mcp_oauth_*`)

Better Auth's legacy `mcp()` plugin (enabled in `apps/web/lib/auth.ts` for
PR 2.2) needs three tables that its own bundled schema
(`plugins/oidc-provider/schema.mjs`) calls `oauthApplication` /
`oauthAccessToken` / `oauthConsent`, with camelCase fields. This project
renames them to `mcp_oauth_applications` / `mcp_oauth_access_tokens` /
`mcp_oauth_consents` with snake_case columns — see
[`0004_mcp_oauth_provider_schema.sql`](migrations/0004_mcp_oauth_provider_schema.sql)
— matching every other table in this schema.

**This rename would not work through `mcp()`'s own config.** Confirmed by
reading `better-auth@1.6.23`'s compiled `plugins/mcp/index.mjs`: `mcp()`
internally builds `provider = oidcProvider({...opts})` (whose own schema
*would* correctly honor an `options.schema` override, via
`mergeSchema(schema, options?.schema)` — this is how `oidcProvider()` on its
own supports renaming) but then returns the plugin object with the bare,
un-merged `schema` import from `oidc-provider/schema.mjs` instead of
`provider.schema` — so anything passed as `mcp({ oidcConfig: { schema: ... } })`
is silently ignored.

The actual fix, in `apps/web/lib/mcp-oauth-compat/schema-override.ts`: a
second, schema-only plugin object (no endpoints/hooks of its own) declaring
the desired `modelName`/`fieldName` overrides, placed *after* `mcp()` in the
`plugins` array. Verified empirically (a throwaway script constructing a
`betterAuth()` instance with both plugins and inspecting
`getAuthTables(auth.options)` from `@better-auth/core/db`) that
`getAuthTables()` merges every plugin's `.schema` by table key across the
*entire* plugins array — independent of what `mcp()`'s own plugin object
carries — so a later plugin's `modelName`/`fieldName` entries for the same
table key win. Since both the migration-diff tool (`getMigrations`, used by
`pnpm --filter web run auth:check`) and the live Postgres adapter's
model/field-name resolution (`getFieldName`/`getModelName`) are pure
functions of this same merged `getAuthTables()` result, the override applies
identically to both schema-checking and real runtime reads/writes.

No `authentication_scheme` column: `plugins/mcp/index.mjs`'s DCR handler
writes `data.authenticationScheme`, but neither the plugin's own schema nor
this project's override schema declares that field. Confirmed via
`@better-auth/core`'s adapter factory (`transformInput`): it only ever
copies `data[field]` for `field in schema[model].fields` — an extra,
undeclared key on the input object is silently skipped, never inserted and
never causing an error. `verifyMcpBearerToken`
(`packages/services/src/mcp-auth`) checks `type = 'public'` and an
empty/null `client_secret` instead, matching the DCR handler's real branch
(`finalClientSecret = clientType === "public" ? "" : clientSecret`).

**Any Better Auth version bump must re-verify all of the above** — this is
called out in `apps/web/lib/mcp-oauth-compat/README.md`.
