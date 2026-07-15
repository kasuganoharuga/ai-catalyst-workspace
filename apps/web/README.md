# AI Catalyst Web

Next.js full-stack app for the AI Catalyst Founder Toolkit V1 experience.

## Development

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Frontend Infrastructure

- App Router with React Server Components by default.
- Tailwind CSS v4 for styling.
- shadcn/ui-compatible component setup with the default neutral token set.
- `components/ui` contains reusable UI primitives.
- `components` contains app-specific composed components.
- `lib/utils.ts` exposes `cn()` for class merging.

## Environment

Copy `.env.example` to `.env.local` for local overrides (`DATABASE_URL`,
`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`). `pnpm dev`/`pnpm docker:up` already
provision `db` and run migrations, so `DATABASE_URL` can stay pointed at the
Docker Postgres instance.

## Quality Commands

```bash
pnpm lint
pnpm typecheck
pnpm format:check
pnpm test
pnpm build
```

Use `pnpm format` to apply Prettier formatting within the web app.

`pnpm auth:check` verifies Better Auth's expected schema (from `lib/auth.ts`)
still matches the database after the latest migration — see
`scripts/check-auth-schema.ts`. It never writes to the database; a mismatch
means a new `infra/database/migrations/NNNN_*.sql` migration is needed.

## Component Conventions

- Prefer server components unless client interactivity is required.
- Import UI primitives from `@/components/ui/*`.
- Keep app-specific composition outside `components/ui`.
- Keep module data access in server-side helpers under `lib`.

## Content Source

Toolkit metadata and Skill content come from `packages/toolkit-content`.
