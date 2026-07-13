# syntax=docker/dockerfile:1.6
#
# Single-image build for the deployed DocMap instance.
#
# The runtime container serves the built UI (Vite → static files) from
# the same origin as the Express API + Bolt Socket Mode connection. No
# database — graphs live in-memory for the container's lifetime (see
# server/src/store.ts). This makes the image small and boot instant.
#
# Stages:
#   1. ui-builder      → Vite-built UI in /repo/ui/dist
#   2. server-builder  → Compiled server in /repo/server/dist
#   3. runtime         → node:22-alpine + prod deps + both outputs

# ─── 1. UI builder ─────────────────────────────────────────────────────────
FROM node:22-alpine AS ui-builder
RUN corepack enable && corepack prepare pnpm@11.1.0 --activate
WORKDIR /repo

COPY pnpm-workspace.yaml package.json .npmrc* ./
COPY server/package.json ./server/
COPY ui/package.json ./ui/

RUN pnpm install --filter @slack-docmap/ui... --frozen-lockfile=false

COPY ui ./ui
RUN pnpm --filter @slack-docmap/ui run build

# ─── 2. Server builder ─────────────────────────────────────────────────────
FROM node:22-alpine AS server-builder
RUN corepack enable && corepack prepare pnpm@11.1.0 --activate
WORKDIR /repo

COPY pnpm-workspace.yaml package.json .npmrc* ./
COPY server/package.json ./server/
COPY ui/package.json ./ui/

RUN pnpm install --filter @slack-docmap/server... --frozen-lockfile=false

COPY server ./server
RUN pnpm --filter @slack-docmap/server run build

# Prune to production-only deps for the server workspace.
RUN pnpm --filter @slack-docmap/server deploy --prod --legacy /out

# ─── 3. Runtime ────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000

RUN addgroup -S app && adduser -S app -G app

# Prod deps + built server.
COPY --from=server-builder --chown=app:app /out/node_modules ./node_modules
COPY --from=server-builder --chown=app:app /out/package.json ./package.json
COPY --from=server-builder --chown=app:app /repo/server/dist ./dist

# UI static assets — served from `<app>/public` by src/index.ts static mount.
COPY --from=ui-builder --chown=app:app /repo/ui/dist ./public

USER app
EXPOSE 3000

CMD ["node", "dist/index.js"]
