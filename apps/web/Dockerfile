FROM node:22-alpine AS base

WORKDIR /workspace

RUN corepack enable

COPY package.json pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/toolkit-content/package.json packages/toolkit-content/package.json

RUN pnpm install --filter web... --frozen-lockfile=false

COPY apps/web apps/web
COPY packages packages

WORKDIR /workspace/apps/web

EXPOSE 3000

CMD ["pnpm", "dev", "--hostname", "0.0.0.0"]
