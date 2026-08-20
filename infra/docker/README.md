# Docker Development

Use Docker Compose from the repository root for backend services:

```bash
pnpm docker:up
```

`pnpm docker:up` runs `scripts/docker-up.js`, which starts services in dependency order rather than all at once:

1. Start `db` and wait for its healthcheck (`docker compose up -d --wait db`).
2. Run pending migrations from the host against `127.0.0.1:5432` (`pnpm --filter @ai-catalyst/db run migrate`).
3. Seed the founder-toolkit content catalog.
4. Start (and build) every other service: `api` on `http://127.0.0.1:8000`, `web` on `http://127.0.0.1:3000`, and `mcp` on `http://127.0.0.1:8787` (its `/health` and stateless `/mcp` endpoint; no real tools yet — see [`apps/mcp`](../../apps/mcp)).

This requires a repo-root `.env` (copy [`.env.example`](../../.env.example)) with `BETTER_AUTH_SECRET` set — the `web` service fails fast at compose-config time if it's missing. `docker-up.js` passes `--env-file` (not `--project-directory`) explicitly, since `docker compose -f infra/docker/docker-compose.yml` otherwise looks for `.env` next to the compose file, not the repo root.

You can still run the Next.js frontend locally instead with `pnpm dev:web` (faster iteration, no rebuild-per-change) — just don't run both the `web` container and `pnpm dev:web` at once, they'd fight over port 3000.

Stop the stack:

```bash
pnpm docker:down
```

The V1 app uses Next.js as the primary full-stack application; `pnpm dev:web` (local, fast reload) is still the usual way to iterate on it day to day, but `pnpm docker:up` also builds and runs it as a container — useful for verifying the production (`output: "standalone"`) build path, or running the whole stack (`db`, `api`, `web`, `mcp`) without any local language runtimes beyond Docker itself.

Default local database credentials:

```text
DATABASE_URL=postgresql://ai_catalyst:ai_catalyst@127.0.0.1:5432/ai_catalyst
```

## Database Initialization

Schema setup is owned by the versioned migration runner in `packages/db` (`infra/database/migrations/*.sql`), not by `docker-entrypoint-initdb.d` — the `db` container starts with an empty schema, and `pnpm docker:up` / `pnpm db:migrate` apply every migration in order, tracked in a `schema_migrations` table (version + SHA-256 checksum). Editing an already-applied migration file fails the checksum check instead of silently drifting; add a new migration file instead.

`infra/database/migrations/0001_aidb_v5_baseline.sql` is the baseline schema and the versioned source of truth — edit future schema changes as new `NNNN_description.sql` migration files, not by hand-editing `0001`.

To run migrations without the full `docker:up` orchestration (e.g. `db` is already running):

```powershell
pnpm db:migrate
```

> **[TEMPORARY] `0001_aidb_v5_baseline` rebaseline notice — remove this box once everyone has reset.**
> `infra/database/migrations/0001_aidb_v5_baseline.sql` was rewritten in place to translate its Chinese comments and `RAISE EXCEPTION` messages to English (source commit `ed373f39fbb1c09bc512b67f89e9f9a9b6ed71fd`, branch `feature/baseline-sql-english`). This is a one-time, explicitly authorized pre-release exception — no table, column, constraint, index, or trigger changed (verified via a controlled text diff and a `pg_dump --schema-only` comparison); only comment text and error-message wording changed. Because the file's bytes changed, its SHA-256 checksum changed too, so **any environment that already applied the old `0001` must run `pnpm db:reset` before migrating again**, or the migration runner will fail with a checksum-mismatch error. After this rebaseline, the "applied migrations are immutable" rule resumes with no further exceptions — all future schema changes are new `NNNN_description.sql` files.

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
