# syntax=docker/dockerfile:1

# Pinned by digest; Dependabot (docker) bumps the tag and digest together
FROM node:26-slim@sha256:e4db4c914bf8ad241bd24804fc25d272d89bad97e68cdc8a1414862790a02c39 AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# Node 25+ no longer bundles corepack; npm ci installs it from docker/corepack's
# lockfile (pinned by integrity hash), and corepack provides the pnpm in packageManager
COPY docker/corepack/package.json docker/corepack/package-lock.json /opt/corepack/
RUN npm ci --prefix /opt/corepack --omit=dev --ignore-scripts \
  && /opt/corepack/node_modules/.bin/corepack enable --install-directory /usr/local/bin
WORKDIR /app

# Prune the monorepo to fumadocs and its workspace dependencies
FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2.11.10 prune fumadocs --docker

FROM base AS builder
# Install from the pruned manifests and lockfile first so this layer caches across source changes
COPY --from=pruner /app/out/json/ .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --ignore-scripts

COPY --from=pruner /app/out/full/ .
RUN pnpm exec varlock codegen --path ./apps/fumadocs/

ENV NODE_ENV=production
# BuildKit makes the env file available only while the build runs
RUN --mount=type=secret,id=docs_env,target=/app/apps/fumadocs/.env.local pnpm --filter fumadocs run build && rm -f apps/fumadocs/.next/standalone/.env* apps/fumadocs/.next/standalone/apps/fumadocs/.env*
# standalone output excludes public/; ensure it exists so the runner copy never fails
RUN mkdir -p apps/fumadocs/public

# varlock/auto-load is not traced into the standalone output, so install it on its own
FROM base AS varlock
WORKDIR /varlock
# npm ci installs it from docker/varlock's lockfile (pinned by integrity hash), at
# the version in the pnpm catalog; Dependabot updates both in one group
COPY docker/varlock/package.json docker/varlock/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

FROM node:26-slim@sha256:e4db4c914bf8ad241bd24804fc25d272d89bad97e68cdc8a1414862790a02c39 AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=4000

RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=varlock --chown=nextjs:nodejs /varlock/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/apps/fumadocs/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/fumadocs/.next/static ./apps/fumadocs/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/fumadocs/public ./apps/fumadocs/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/fumadocs/.env.schema ./apps/fumadocs/.env.schema

USER nextjs
EXPOSE 4000

WORKDIR /app/apps/fumadocs
CMD ["node", "--import", "varlock/auto-load", "server.js"]
