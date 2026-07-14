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

## Database Initialization

`init/001_ai_catalyst_schema.sql` is an exact, unmodified copy of `local/AIDB_v5.sql` (the finalized schema). It is mounted read-only into the `db` container at `/docker-entrypoint-initdb.d`. The official `postgres` image runs every script in that directory, in sorted filename order, but **only when the data directory is empty** — it will not re-run against an existing volume.

Keep the copy byte-identical to the source of truth. To confirm there is no drift:

```bash
cmp local/AIDB_v5.sql infra/docker/init/001_ai_catalyst_schema.sql
```

```powershell
(Get-FileHash local/AIDB_v5.sql -Algorithm SHA256).Hash -eq (Get-FileHash infra/docker/init/001_ai_catalyst_schema.sql -Algorithm SHA256).Hash
```

If the schema changes, update `local/AIDB_v5.sql` first, then re-copy it here as-is — do not hand-edit the copy or add headers/comments to it.

Future initialization files (e.g. seed data) should follow the same `NNN_description.sql` naming convention with an incrementing prefix, so ordering stays predictable.

### Resetting the local database

```powershell
pnpm db:reset
```

**Warning: `pnpm db:reset` permanently deletes all local database data.** It runs `docker compose down -v` (removing the named `postgres_data` volume) and then brings the stack back up, so `db` starts from an empty data directory and re-runs everything in `init/` from scratch. Do not use it as a plain restart — use `pnpm docker:down` + `pnpm docker:up` for that instead.

### Verifying initialization

Connect with an interactive shell:

```powershell
pnpm db:psql
```

```sql
\dt
\d+ users
```

Or run non-interactive checks that can be copy-pasted directly (useful for confirming the SQL file was mounted, executed, and produced the expected tables/triggers):

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
