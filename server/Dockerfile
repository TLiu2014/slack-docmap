# --- Stage 1: install + build ---
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@11.1.0 --activate
WORKDIR /repo

# Workspace manifests first for better layer caching.
COPY pnpm-workspace.yaml package.json .npmrc ./
COPY server/package.json ./server/
COPY ui/package.json ./ui/

RUN pnpm install --filter @slack-docmap/server... --frozen-lockfile=false

# Copy server source and build.
COPY server ./server
RUN pnpm --filter @slack-docmap/server run build

# Prune to production dependencies only.
RUN pnpm --filter @slack-docmap/server deploy --prod /out

# --- Stage 2: runtime ---
FROM node:20-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000

# Drop privileges.
RUN addgroup -S app && adduser -S app -G app
USER app

COPY --from=builder --chown=app:app /out/node_modules ./node_modules
COPY --from=builder --chown=app:app /out/package.json ./package.json
COPY --from=builder --chown=app:app /repo/server/dist ./dist
# Prisma schema + generated client are needed at runtime (and for `prisma migrate deploy`).
COPY --from=builder --chown=app:app /repo/server/prisma ./prisma

EXPOSE 3000

CMD ["node", "dist/index.js"]
