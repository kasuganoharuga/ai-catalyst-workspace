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

## Quality Commands

```bash
pnpm lint
pnpm typecheck
pnpm format:check
pnpm build
```

Use `pnpm format` to apply Prettier formatting within the web app.

## Component Conventions

- Prefer server components unless client interactivity is required.
- Import UI primitives from `@/components/ui/*`.
- Keep app-specific composition outside `components/ui`.
- Keep module data access in server-side helpers under `lib`.

## Content Source

Toolkit metadata and Skill content come from `packages/toolkit-content`.
