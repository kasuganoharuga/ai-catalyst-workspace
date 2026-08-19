# Multi-stage build leveraging Next.js's standalone output
# (apps/web/next.config.ts sets `output: "standalone"` with
# `outputFileTracingRoot` pointed at the monorepo root), so the final image
# only needs the traced server bundle, not the whole workspace.
FROM node:22-slim AS deps

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.18.0 --activate

WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile

FROM deps AS builder

WORKDIR /app

# Build-time-only placeholders: `next build` collects page data for
# /api/auth/[...all], which imports packages/db's pool at module load time
# (packages/db/src/pool.ts throws immediately if DATABASE_URL is unset) and
# constructs the Better Auth instance (apps/web/lib/auth.ts asserts
# AUTH_ISSUER_URL/BETTER_AUTH_SECRET at module load too, PR 2.2). None of
# these values are used at runtime — the web service's real
# DATABASE_URL/BETTER_AUTH_SECRET/AUTH_ISSUER_URL come from
# docker-compose.yml's `environment:` at container start.
ARG DATABASE_URL=postgresql://ai_catalyst:ai_catalyst@db:5432/ai_catalyst
ARG BETTER_AUTH_SECRET=docker-build-placeholder-not-used-at-runtime
ARG AUTH_ISSUER_URL=http://localhost:3000
ENV DATABASE_URL=${DATABASE_URL}
ENV BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
ENV AUTH_ISSUER_URL=${AUTH_ISSUER_URL}

# These three are different in kind from the placeholders above: they are baked
# into the client bundle and cannot be supplied later. Next.js substitutes
# NEXT_PUBLIC_* at `next build`, so a task-definition variable never reaches
# the browser — setting NEXT_PUBLIC_SENTRY_DSN on the ECS service looks correct
# and reports nothing. Browser error tracking has to be decided here or not at
# all. Empty defaults keep local and CI builds unchanged: instrumentation-client.ts
# skips Sentry.init without a DSN.
ARG NEXT_PUBLIC_SENTRY_DSN=""
ARG NEXT_PUBLIC_APP_ENV=""
ARG NEXT_PUBLIC_RELEASE=""
ENV NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN}
ENV NEXT_PUBLIC_APP_ENV=${NEXT_PUBLIC_APP_ENV}
ENV NEXT_PUBLIC_RELEASE=${NEXT_PUBLIC_RELEASE}

RUN pnpm --filter web build

FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Server-side release marker, deliberately baked in rather than set on the ECS
# task definition. An image and its release are the same fact, so pinning it
# here cannot drift: deploy-aws.yml rewrites only the image on redeploy, which
# means a task-definition RELEASE would keep reporting whichever SHA was
# current when that definition was last hand-edited. Read by
# packages/observability's resolveRelease() and attached to every Sentry event.
ARG RELEASE=""
ENV RELEASE=${RELEASE}

# `output: "standalone"` traces server code but explicitly does not copy
# `public/` or the client-side `.next/static` assets — both must be added
# by hand per Next.js's own deployment docs.
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/login').then((r) => process.exit(r.status < 500 ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", "apps/web/server.js"]
