# AI Catalyst Workspace

Platform-ready workspace for the AI Catalyst Founder Toolkit, starting with downloadable AI Skills and structured module content.

This repository is a development-ready foundation for the AI Catalyst Founder Toolkit MVP.

## V1 Scope

Skill-first Founder Toolkit with authenticated workspace flows:

- Browse Toolkit modules and work through module attempts
- Persist progress in PostgreSQL (`module_attempts`, artifacts, interviews, …)
- Better Auth login / invitations; MCP OAuth for AI-agent clients (e.g. Claude)
- Remote MCP server (`apps/mcp`) exposing thin tool shells over Streamable HTTP
- Shared business logic in `packages/services` (web and MCP both call it)
- FastAPI reserved for future internal AI workflow execution (RAG, generation)

V1 does not include investor matching or browser-direct model-provider calls.

## Stack

- Frontend: Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui, pnpm
- Backend: FastAPI, Python (reserved internal AI service)
- MCP: Remote MCP server, Node/TypeScript (see [MCP & Services Architecture](#mcp--services-architecture))
- Database: PostgreSQL via Docker Compose
- Content: Markdown + JSON manifest in `packages/toolkit-content` (seeded into DB)
- Observability: `packages/observability` (JSON logs + redaction); Sentry optional via DSN
- Tooling: Docker Compose for backend services, GitHub Actions CI

## Prerequisites

- Node.js 22+
- pnpm 10+
- Python 3.11+
- Docker Desktop (optional, for the container stack)

## Local Development

Install dependencies from the repository root:

```powershell
pnpm install
```

Copy the root env file (the `web` service reads `BETTER_AUTH_SECRET` from it) and start the full stack with Docker:

```powershell
cp .env.example .env
# fill in BETTER_AUTH_SECRET, e.g. via `openssl rand -base64 32`
pnpm docker:up
```

The API is available at `http://127.0.0.1:8000` (health check at `/health`), the web app at `http://127.0.0.1:3000`, and the MCP server at `http://127.0.0.1:8787` (health check at `/health`; see [MCP & Services Architecture](#mcp--services-architecture)). PostgreSQL is available locally on port `5432`.

Run the web app locally (primary V1 product):

```powershell
pnpm dev:web
```

The web app is available at `http://localhost:3000`.

For local FastAPI debugging without Docker, run:

```powershell
pnpm dev:api
```

Run the standard development setup (Docker Postgres, migrated, plus local web + API with fast reload):

```powershell
pnpm dev
```

`pnpm dev` (`scripts/dev.js`) starts only the `db` container, runs pending migrations against it via `packages/db`, then runs `web` (`next dev`) and `api` (`uvicorn --reload`) as local processes; press `Ctrl+C` to stop everything — the script explicitly runs `docker compose down` on shutdown (containers may take a few seconds to stop gracefully; pressing `Ctrl+C` again during that window is a no-op, not a force-kill). It requires a local Python environment with `apps/api/requirements.txt` installed (see [`apps/api/README.md`](apps/api/README.md#development)). (`pnpm docker:up` starts the full containerized stack — `db`, `api`, `web`, and `mcp` all as built containers — detached, for cases where you want it running independently of a foreground command instead of iterating on `web`/`api` locally.)

## Environment

Each app has its own `.env.example` scoped to what it actually reads from `process.env` — copy each to the sibling `.env`/`.env.local` file rather than sharing one file across apps:

- [`.env.example`](.env.example) (repo root): copy to `.env` before running `pnpm docker:up` — the monorepo/Docker-wide `DATABASE_URL`, `BETTER_AUTH_SECRET` (required; the `web` service fails fast without it), and port conventions, shared by reference rather than duplicated below.
- [`apps/web/.env.example`](apps/web/.env.example): `DATABASE_URL`, `BETTER_AUTH_SECRET`, `AUTH_ISSUER_URL`, `MCP_RESOURCE_URL` — copy to `apps/web/.env.local`.
- [`apps/api/.env.example`](apps/api/.env.example): FastAPI's own settings — copy to `apps/api/.env`. See [`apps/api/README.md`](apps/api/README.md#environment).
- [`apps/mcp/.env.example`](apps/mcp/.env.example): only used if you run `apps/mcp` outside Docker Compose (`pnpm --filter @ai-catalyst/mcp dev`) — `docker:up` sets these directly on the `mcp` service instead.

Never commit real secrets; see [`.github/SECURITY.md`](.github/SECURITY.md).

## Verification

Run frontend checks before opening a pull request:

```powershell
pnpm lint
pnpm typecheck:web
pnpm typecheck:packages
pnpm test
pnpm format:check
pnpm build
```

`pnpm test` covers every test that runs without a database. The
database-backed suites (`*.db.test.ts`) need a migrated Postgres, so they run
separately once `pnpm docker:up` is healthy:

```powershell
pnpm test:db
```

Both are driven by the projects in [`vitest.config.ts`](vitest.config.ts);
`pnpm test:all` runs the two together, and `pnpm test:watch` /
`pnpm test:watch:db` watch the same two halves.

Format locally (before commit):

```powershell
pnpm format
```

`pnpm format` and `pnpm format:check` cover the whole repo from the root
Prettier config. [`.prettierignore`](.prettierignore) excludes generated font
blobs and the Toolkit content under `packages/toolkit-content/{modules,skills}/`,
which `content-seed` reads verbatim.

Validate the Docker Compose configuration:

```powershell
docker compose -f infra/docker/docker-compose.yml config
```

## Docker

Start the full stack (`db`, `api`, `web`, `mcp`):

```powershell
pnpm docker:up
```

Stop it:

```powershell
pnpm docker:down
```

`pnpm docker:up` starts `db`, waits for it to be healthy, applies pending migrations from `infra/database/migrations/`, seeds Toolkit content, then builds and starts the rest of the stack. It requires a repo-root `.env` with `BETTER_AUTH_SECRET` set (see [Environment](#environment)) — `web`'s compose config fails fast without it. **`pnpm db:reset` permanently deletes all local database data** — see [`infra/docker/README.md`](infra/docker/README.md#database-initialization) for initialization details, verification queries, and reset semantics.

## Continuous Integration

GitHub Actions validates the project on push to `main`/`develop` and on pull requests, split into four jobs (see [`.github/workflows/ci.yml`](.github/workflows/ci.yml)):

- **frontend**: install workspace deps with the lockfile, check formatting, lint, typecheck, and build the Next.js app
- **packages**: typecheck and test `packages/*`/`apps/mcp`, and check architectural import boundaries (`pnpm depcruise`)
- **backend**: install FastAPI dependencies and smoke check the app import
- **infrastructure**: validate the Docker Compose configuration, run migrations against a real Postgres instance, verify Better Auth's schema is in sync, run Better Auth integration tests, verify migration checksum protection, build+smoke-test the `web`/`mcp` containers, validate Terraform, and dry-run ECS task definition rendering

Manual cloud deploy (no auto-push): [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) — matrix build for `web` / `api` / `mcp`. See [`infra/aws/README.md`](infra/aws/README.md).

## Cloud deploy architecture (Staging / Production)

```text
Developer → GitHub → Actions → ECR → ECS Fargate → ALB
                                      → Web / MCP (public)
                                      → API (private)
                                      → RDS / S3 / SES / Secrets Manager
```

- `develop` → Staging. The previous AWS production environment has been retired (`main` has no deploy target until a new prod stack exists).
- Artifact downloads default to permissioned backend streaming, not browser → signed URL → S3.
- Local/CI keep `STORAGE_PROVIDER=local` and `EMAIL_PROVIDER=noop`.

## Project Structure

```text
apps/
  web/              Next.js full-stack product (pages + thin route handlers)
  api/              Reserved FastAPI internal AI service
  mcp/              Remote MCP server — Streamable HTTP over /mcp, thin tool shells
packages/
  toolkit-content/  Module metadata, markdown, Skills, templates (seed-time only)
  shared/           Shared TypeScript types
  contracts/        Cross-cutting types (e.g. ActorContext)
  services/         Application Service Layer — sole home for business logic
  observability/    JSON logger, SERVICE_NAME constants, PII redaction (leaf)
  db/               pg pool + migration runner (leaf)
  clients/          Outbound HTTP clients to apps/api (scaffold until AI calls land)
infra/
  docker/           Local Docker Compose setup
  aws/              AWS Staging (Terraform, SES, S3, deploy runbook)
  database/         SQL migrations
```

## Architecture Direction

Next.js is the primary full-stack application. Toolkit catalog content is seeded from `packages/toolkit-content` into PostgreSQL at deploy/migrate time; runtime product paths go through `packages/services`, not disk reads of the content package.

FastAPI stays minimal in V1. It reserves the path for future AI orchestration, file processing, RAG, and artefact generation without duplicating the Toolkit data path. It ships with settings, JSON logging, request-id, CORS, and error-handling infrastructure so future workflow endpoints have a stable foundation.

## Service Boundary

Next.js owns the product experience (pages, auth, workspace/admin shells). FastAPI owns future AI/RAG/file-processing logic and must not become the general product backend. The browser never talks to model providers directly.

## MCP & Services Architecture

`apps/mcp` is a standalone Streamable HTTP MCP server: a single `/mcp` endpoint (`POST` for MCP; unauthenticated calls return 401), `GET /health`, OAuth protected-resource metadata, and thin tool handlers that call `packages/services`. It runs as its own container in `infra/docker/docker-compose.yml` (`pnpm docker:up` → `http://127.0.0.1:8787`).

| Layer               | Owns                                                                                                                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`          | Pages, product route handlers — thin shells that call `packages/services`                                                                                                                    |
| `apps/mcp`          | Remote MCP server for AI-agent clients (e.g. Claude): tool shells over a single `/mcp` endpoint — calls `packages/services`, never implements logic itself                                   |
| `packages/services` | The single home for business logic (workflow, module, artifact, storage, invitation, audit, interview, …) — both `apps/web` and `apps/mcp` call into this layer; only it may call `apps/api` |
| `apps/api`          | Internal AI service only (generation/rendering/RAG). Called from `packages/services` only — never from `apps/web` or `apps/mcp` directly — and never writes business tables itself           |

Framework rules:

1. **No duplicate business logic.** `apps/web` route handlers and `apps/mcp` tool handlers both validate input and delegate to the same `packages/services` function — never two implementations of the same operation.
2. **FastAPI is internal-only.** `packages/services → apps/api`, never `apps/web`/`apps/mcp → apps/api` directly, and FastAPI never writes business tables.
3. **MCP deploys standalone**, not embedded in Next.js — Streamable HTTP's long-lived connections don't fit the Vercel serverless model, so `apps/mcp` runs as its own container alongside `db`/`api`.
4. **Two-layer auth, never mixed.** Claude → MCP uses the platform Bearer token (Better Auth is the Authorization Server; MCP is a Resource Server that only verifies the token and reads scope). MCP → Google Drive uses the separate, encrypted `user_ai_connections`/`accounts` Google token. The platform token is never forwarded downstream to Google.
5. **V1 MCP tools are stateless** — identity/parameters travel with every request; progress is persisted in PostgreSQL, not an MCP session.

Official artifact validation is never exposed as an MCP tool — schema check constraints already gate it so it can't be MCP-triggered; MCP only ever exposes the non-authoritative `run_draft_check` path.

Toolkit content is read at seed time only (`packages/services/src/content-seed/`).

**Observability note:** process containers set `SERVICE_NAME` to `aicatalyst-web` / `aicatalyst-api` / `aicatalyst-mcp`. Library code in `packages/services` logs with `service: aicatalyst-services` so business-layer events stay filterable even when they run inside a web or MCP process. Domain history lives in Postgres (`module_events`); MCP tool audit is a separate best-effort table (`mcp_tool_audit_logs`) — do not merge the two.

## Frontend Conventions

- `apps/web` uses shadcn/ui and Tailwind for shared UI foundations.
- Add UI components with `pnpm dlx shadcn@latest add <component>` (primitives live in `apps/web/components/ui`).
- Design tokens live in `apps/web/app/globals.css` and use the shadcn neutral theme; prefer semantic tokens over hardcoded colors.
- Pages compose components and read content via `apps/web/lib` helpers; keep route handlers thin.

## Code comments

Prefer short **why** over restating **what**. File headers and non-obvious JSDoc stay in the 2–4 line range; field notes are usually one line. Keep security, lock-ordering, and state-machine invariants. Use `// --- Name ---` for section banners. Domain deep-dives belong in READMEs (e.g. `apps/web/lib/mcp-oauth-compat/`), not in every source file.

## Development Workflow

Use `main` as the stable branch and `develop` as the active integration branch.

```text
feature/* -> PR -> develop -> PR -> main
```

Branch roles:

- `main`: stable branch for reviewed, CI-passing code
- `develop`: active integration branch for upcoming work
- `feature/*`: individual task branches created from `develop`

Start new work from `develop`:

```powershell
git checkout develop
git pull --ff-only origin develop
git checkout -b feature/your-change-name
```

When the feature is ready, push and open a pull request into `develop`:

```powershell
git push -u origin feature/your-change-name
```

After a batch of work is stable on `develop`, open a pull request from `develop` into `main`.

Before opening a pull request, run the relevant checks (see [Verification](#verification)); CI must pass.

## Commit Message Format

Use a short Conventional Commit-style summary, followed by an optional body when the change needs context:

```text
chore: set up project foundation

Add pnpm workspace, Next.js frontend, FastAPI backend, Docker Compose, CI, and setup documentation.
```

Format:

- First line: concise summary, usually `type: description`
- Blank line
- Body: one or two sentences explaining the change

Commit only when explicitly requested.
