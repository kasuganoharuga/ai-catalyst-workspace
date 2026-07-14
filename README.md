# AI Catalyst Workspace

Platform-ready workspace for the AI Catalyst Founder Toolkit, starting with downloadable AI Skills and structured module content.

This repository is a development-ready foundation for the MVP described in `local/AI Catalyst Workspace — Project Setup & Architecture Notes.pdf`. The `local/` folder is intentionally ignored by Git.

## V1 Scope

The first version is Skill-first and workspace-ready:

- Browse Toolkit modules
- View module detail pages
- Download module `SKILL.md` files
- Reserve future workspace and admin routes
- Keep FastAPI available for later AI workflow execution

V1 does not include login, databases, file uploads, RAG, investor matching, or live LLM execution.

## Stack

- Frontend: Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui, pnpm
- Backend: FastAPI, Python (reserved AI service)
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

Start backend services with Docker:

```powershell
pnpm docker:up
```

The API is available at `http://127.0.0.1:8000` (health check at `/health`). PostgreSQL is available locally on port `5432`.

Run the web app locally (primary V1 product):

```powershell
pnpm dev:web
```

The web app is available at `http://localhost:3000`.

For local FastAPI debugging without Docker, run:

```powershell
pnpm dev:api
```

Run the standard development setup (local web + Docker backend):

```powershell
pnpm dev
```

`pnpm dev` runs the web app and Docker backend together via `scripts/dev.js`; press `Ctrl+C` to stop both — the script explicitly runs `docker compose down` on shutdown (containers may take a few seconds to stop gracefully; pressing `Ctrl+C` again during that window is a no-op, not a force-kill). (`pnpm docker:up` alone still starts Docker detached, for cases where you want it running independently of a foreground command.)

## Verification

Run frontend checks before opening a pull request:

```powershell
pnpm lint
pnpm typecheck:web
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

Start backend services (`api` + `db`):

```powershell
pnpm docker:up
```

Stop backend services:

```powershell
pnpm docker:down
```

The `db` service initializes from `infra/docker/init/` on first start (empty data volume only). **`pnpm db:reset` permanently deletes all local database data** — see [`infra/docker/README.md`](infra/docker/README.md#database-initialization) for initialization details, verification queries, and reset semantics.

## Continuous Integration

GitHub Actions validates the project on push to `main` and on pull requests, split into three jobs:

- **frontend**: install workspace deps with the lockfile, lint, and build the Next.js app
- **backend**: install FastAPI dependencies and smoke check the app import
- **infrastructure**: validate the Docker Compose configuration

## Project Structure

```text
apps/
  web/              Next.js full-stack app for the V1 product
  api/              Reserved FastAPI service for future AI workflows
packages/
  toolkit-content/  Module metadata, markdown, Skills, templates, and examples
  shared/           Shared TypeScript types
infra/
  docker/           Local Docker Compose setup
  aws/              Future deployment notes
```

## Architecture Direction

Next.js is the primary V1 full-stack application. It reads Toolkit content from `packages/toolkit-content` (the `manifest.json` is the source of truth) and serves the browsing and download experience.

FastAPI is intentionally minimal in V1. It reserves the path for future AI orchestration, file processing, RAG, and artefact generation without duplicating the Toolkit data path. It ships with settings, logging, request-id, CORS, and error-handling infrastructure so future workflow endpoints have a stable foundation.

## Service Boundary

Next.js owns the product experience and product data (pages, Toolkit reads, Skill downloads, future workspace/admin). FastAPI owns AI/RAG/file-processing logic and should not become the general product backend. In V1 the browser never talks to model providers directly.

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
