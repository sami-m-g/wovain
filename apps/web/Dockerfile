# syntax=docker/dockerfile:1

FROM node:26-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# Node 25+ no longer bundles corepack
RUN npm install --global corepack@latest && corepack enable
WORKDIR /app

# Prune the monorepo to web and its workspace dependencies
FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2.11.10 prune web --docker

FROM base AS builder
# Install from the pruned manifests and lockfile first so this layer caches across source changes
COPY --from=pruner /app/out/json/ .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --ignore-scripts

COPY --from=pruner /app/out/full/ .
RUN pnpm exec varlock codegen --path ./apps/web/ && pnpm exec varlock codegen --path ./packages/db/

ENV NODE_ENV=production
# BuildKit makes the env file available only while the build runs
RUN --mount=type=secret,id=web_env,target=/app/apps/web/.env.local pnpm --filter web run build && rm -f apps/web/.next/standalone/.env* apps/web/.next/standalone/apps/web/.env*
# standalone output excludes public/; ensure it exists so the runner copy never fails
RUN mkdir -p apps/web/public

# varlock/auto-load is not traced into the standalone output, so install it on its own
FROM base AS varlock
WORKDIR /varlock
COPY --from=pruner /app/out/json/pnpm-workspace.yaml /tmp/pnpm-workspace.yaml
# Use the varlock version pinned in the pnpm catalog
RUN npm install --omit=dev --no-save --no-package-lock "varlock@$(sed -n 's/^  varlock: *//p' /tmp/pnpm-workspace.yaml)"

FROM node:26-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3001

RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=varlock --chown=nextjs:nodejs /varlock/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.env.schema ./apps/web/.env.schema

USER nextjs
EXPOSE 3001

WORKDIR /app/apps/web
CMD ["node", "--import", "varlock/auto-load", "server.js"]
