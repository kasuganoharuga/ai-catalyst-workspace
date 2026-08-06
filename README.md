# AI Catalyst Workspace

Platform-ready workspace for the AI Catalyst Founder Toolkit, starting with downloadable AI Skills and structured module content.

This repository is a development-ready foundation for the AI Catalyst Founder Toolkit MVP.

## V1 Scope

The first version is Skill-first and workspace-ready:

- Browse Toolkit modules
- View module detail pages
- Reserve future workspace and admin routes
- Keep FastAPI available for later AI workflow execution
- Run a Remote MCP Server skeleton (stateless Streamable HTTP, no tools registered yet) that future AI-agent (e.g. Claude) access to the same Toolkit workflows will build on

V1 does not include login, databases, file uploads, RAG, investor matching, or live LLM execution.

## Stack

- Frontend: Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui, pnpm
- Backend: FastAPI, Python (reserved internal AI service)
- MCP: Remote MCP server, Node/TypeScript (skeleton — see [MCP & Services Architecture](#mcp--services-architecture))
- Database: PostgreSQL via Docker Compose
- Content: Markdown + JSON manifest in `packages/toolkit-content`
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
pnpm test:packages
pnpm format:check:web
pnpm build
```

Format locally (before commit):

```powershell
pnpm format:web
```

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

- `develop` → Staging, `main` → Production (isolated buckets, RDS, secrets).
- Artifact downloads default to permissioned backend streaming, not browser → signed URL → S3.
- Local/CI keep `STORAGE_PROVIDER=local` and `EMAIL_PROVIDER=noop`.

## Project Structure

```text
apps/
  web/              Next.js full-stack app for the V1 product
  api/              Reserved FastAPI service for future AI workflows (internal only, see below)
  mcp/              Remote MCP Server skeleton — stateless Streamable HTTP over /mcp, no tools registered yet
packages/
  toolkit-content/  Module metadata, markdown, Skills, templates, and examples
  shared/           Shared TypeScript types
  services/         Reserved Application Service Layer — the single home for business logic (scaffold, no logic yet)
infra/
  docker/           Local Docker Compose setup
  aws/              AWS Staging/Production prep (Terraform, SES, S3, deploy runbook)
```

## Architecture Direction

Next.js is the primary V1 full-stack application. It reads Toolkit content from `packages/toolkit-content` (the `manifest.json` is the source of truth) and serves the browsing and download experience.

FastAPI is intentionally minimal in V1. It reserves the path for future AI orchestration, file processing, RAG, and artefact generation without duplicating the Toolkit data path. It ships with settings, logging, request-id, CORS, and error-handling infrastructure so future workflow endpoints have a stable foundation.

## Service Boundary

Next.js owns the product experience and product data (pages, Toolkit reads, Skill downloads, future workspace/admin). FastAPI owns AI/RAG/file-processing logic and should not become the general product backend. In V1 the browser never talks to model providers directly.

## MCP & Services Architecture

`apps/mcp` is a stateless Streamable HTTP MCP server skeleton: a single `/mcp` endpoint (`POST` only — `GET`/`DELETE` return 405, since there's no session to resume or terminate), a `/health` check, and an empty `tools/list` — no real tools, resources, or prompts are registered yet, and it doesn't call `packages/services` yet either. It runs as its own container in `infra/docker/docker-compose.yml` (`pnpm docker:up` builds and starts it on `http://127.0.0.1:8787`). `packages/services` is still a structure-only scaffold (`package.json` + `tsconfig.json`, no implementation).

Once fully implemented, the layering is:

| Layer | Owns |
|---|---|
| `apps/web` | Pages, product route handlers — thin shells that call `packages/services` |
| `apps/mcp` | Remote MCP server for AI-agent clients (e.g. Claude): tool/resource/prompt shells over a single `/mcp` endpoint — calls `packages/services`, never implements logic itself |
| `packages/services` | The single home for business logic (workflow, module, artifact, storage, invitation, audit) — both `apps/web` and `apps/mcp` call into this layer; it is the only thing that may call `apps/api` |
| `apps/api` | Internal AI service only (generation/rendering/RAG). Called from `packages/services` only — never from `apps/web` or `apps/mcp` directly — and never writes business tables itself |

Framework rules once this is implemented:

1. **No duplicate business logic.** `apps/web` route handlers and `apps/mcp` tool handlers both validate input and delegate to the same `packages/services` function — never two implementations of the same operation.
2. **FastAPI is internal-only.** `packages/services → apps/api`, never `apps/web`/`apps/mcp → apps/api` directly, and FastAPI never writes business tables.
3. **MCP deploys standalone**, not embedded in Next.js — Streamable HTTP's long-lived connections don't fit the Vercel serverless model, so `apps/mcp` runs as its own container alongside `db`/`api`.
4. **Two-layer auth, never mixed.** Claude → MCP uses the platform Bearer token (Better Auth is the Authorization Server; MCP is a Resource Server that only verifies the token and reads scope). MCP → Google Drive uses the separate, encrypted `user_ai_connections`/`accounts` Google token. The platform token is never forwarded downstream to Google.
5. **V1 MCP tools are stateless** — identity/parameters travel with every request; progress is persisted in PostgreSQL, not an MCP session.

Official artifact validation is never exposed as an MCP tool — schema check constraints already gate it so it can't be MCP-triggered; MCP only ever exposes the non-authoritative `run_draft_check` path.

Toolkit content is read at seed time only (`packages/services/src/content-seed/`); the public Skill-download gallery that used to read it at request time has been retired.

## Frontend Conventions

- `apps/web` uses shadcn/ui and Tailwind for shared UI foundations.
- Add UI components with `pnpm dlx shadcn@latest add <component>` (primitives live in `apps/web/components/ui`).
- Design tokens live in `apps/web/app/globals.css` and use the shadcn neutral theme; prefer semantic tokens over hardcoded colors.
- Pages compose components and read content via `apps/web/lib` helpers; keep route handlers thin.

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
