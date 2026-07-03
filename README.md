# AI Catalyst Workspace

Platform-ready workspace for the AI Catalyst Founder Toolkit, starting with downloadable Skills and structured module content.

## V1 Scope

The first version is Skill-first and workspace-ready:

- Browse Toolkit modules
- View module detail pages
- Download module `SKILL.md` files
- Reserve future workspace and admin routes
- Keep FastAPI available for later AI workflow execution

V1 does not include login, databases, file uploads, RAG, investor matching, or live LLM execution.

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

## Local Development

Install dependencies:

```bash
pnpm install
```

Run the web app:

```bash
pnpm dev:web
```

Run the reserved API service:

```bash
pnpm dev:api
```

Run both services:

```bash
pnpm dev
```

## Docker

Start the local stack:

```bash
pnpm docker:up
```

Stop the local stack:

```bash
pnpm docker:down
```

## Architecture Direction

Next.js is the primary V1 full-stack application. It reads Toolkit content from `packages/toolkit-content` and serves the browsing and download experience.

FastAPI is intentionally minimal in V1. It reserves the path for future AI orchestration, file processing, RAG, and artefact generation without duplicating the Toolkit data path.
