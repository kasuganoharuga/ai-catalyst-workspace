# Docker Development

Use Docker Compose from the repository root for backend services:

```bash
pnpm docker:up
```

`pnpm docker:up` runs `scripts/docker-up.js`, which starts services in dependency order rather than all at once:

1. Start `db` and wait for its healthcheck (`docker compose up -d --wait db`).
2. Run pending migrations from the host against `127.0.0.1:5432` (`pnpm --filter @ai-catalyst/db run migrate`).
3. Start (and build) every other service — currently `api` on `http://127.0.0.1:8000`.

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

## Database Initialization

Schema setup is owned by the versioned migration runner in `packages/db` (`infra/database/migrations/*.sql`), not by `docker-entrypoint-initdb.d` — the `db` container starts with an empty schema, and `pnpm docker:up` / `pnpm db:migrate` apply every migration in order, tracked in a `schema_migrations` table (version + SHA-256 checksum). Editing an already-applied migration file fails the checksum check instead of silently drifting; add a new migration file instead.

`infra/database/migrations/0001_aidb_v5_baseline.sql` is the baseline schema (originally sourced from `local/AIDB_v5.sql`, a local-only planning copy) and is now the versioned source of truth going forward — edit future schema changes as new `NNNN_description.sql` migration files, not by hand-editing `0001`.

To run migrations without the full `docker:up` orchestration (e.g. `db` is already running):

```powershell
pnpm db:migrate
```

### Resetting the local database

```powershell
pnpm db:reset
```

**Warning: `pnpm db:reset` permanently deletes all local database data.** It runs `docker compose down -v` (removing the named `postgres_data` volume) and then re-runs `pnpm docker:up`, so `db` starts from an empty data directory and every migration re-applies from scratch. Do not use it as a plain restart — use `pnpm docker:down` + `pnpm docker:up` for that instead.

### Verifying initialization

Connect with an interactive shell:

```powershell
pnpm db:psql
```

```sql
\dt
\d+ users
```

Or run non-interactive checks that can be copy-pasted directly (useful for confirming migrations were applied and produced the expected tables/triggers):

```powershell
docker compose -f infra/docker/docker-compose.yml exec -T db `
  psql -U ai_catalyst -d ai_catalyst `
  -v ON_ERROR_STOP=1 `
  -c "select count(*) as table_count from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE';"
```

```powershell
docker compose -f infra/docker/docker-compose.yml exec -T db `
  psql -U ai_catalyst -d ai_catalyst `
  -v ON_ERROR_STOP=1 `
  -c "select event_object_table, trigger_name from information_schema.triggers where trigger_schema = 'public' and event_object_table in ('users', 'sessions', 'prompt_versions', 'workflow_definitions', 'module_responses') order by event_object_table, trigger_name;"
```
