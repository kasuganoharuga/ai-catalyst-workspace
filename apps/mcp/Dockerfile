# Runs the whole pnpm workspace through `pnpm install` rather than a
# selective multi-stage copy — apps/mcp has no workspace deps yet, but the
# architecture calls for it to depend on packages/services soon, at which
# point a partial copy would silently go stale. Revisit with a proper
# multi-stage (deps -> build -> slim runtime) once image size/build time
# actually matters.
FROM node:22-slim

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.18.0 --activate

WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile

ENV NODE_ENV=production
ENV MCP_PORT=8787

# Baked in for the same reason as apps/web/Dockerfile's copy: deploy-aws.yml
# rewrites only the image, so a task-definition RELEASE would go stale while
# looking current. src/sentry.ts attaches it to every event.
ARG RELEASE=""
ENV RELEASE=${RELEASE}

EXPOSE 8787

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8787/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["pnpm", "--filter", "@ai-catalyst/mcp", "start"]
