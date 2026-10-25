# wovain

## Tech Stack

| Area | Tools |
| --- | --- |
| Monorepo | pnpm workspaces (catalog versions), Turborepo |
| Language | TypeScript 6 (API for tooling), TypeScript 7 (`tsc` for type checks) |
| Web app | Next.js 16 (App Router, Turbopack, React Compiler, typed routes) |
| Docs app | Fumadocs (Fumadocs MDX, Fumadocs UI) with AI chat via OpenRouter |
| API | oRPC with OpenAPI, TanStack Query |
| Auth | Better Auth (email and password) |
| Database | PostgreSQL, Drizzle ORM |
| UI | shadcn/ui (Base UI), Tailwind CSS 4 |
| Environment | Varlock (`.env.schema` per app, generated `src/env.ts`) |
| Logging | evlog |
| Lint and format | Ultracite (Oxlint, Oxfmt), Lefthook, commitlint, knip |
| Containers | Docker, Docker Compose |

## Project Structure

```text
wovain/
├── apps/
│   ├── web/          # Next.js application (port 3001)
│   └── fumadocs/     # Documentation site (port 4000)
├── packages/
│   ├── api/          # oRPC routers and procedures
│   ├── auth/         # Better Auth configuration
│   ├── config/       # Shared TypeScript configuration
│   ├── db/           # Drizzle schema, relations and client
│   └── ui/           # Shared shadcn/ui components and styles
├── infra/            # Pulumi: Google Cloud, GitLab settings and Duo flows
├── .agents/skills/   # Agent skills, installed from skills-lock.json
├── .config/          # commitlint, knip and Lefthook configuration
├── .gitlab/ci/       # GitLab CI jobs, one file per stage
└── docker-compose.yml
```

## Getting Started

Requires Node.js 26 (see `.nvmrc`) and pnpm (version pinned in `package.json`).

```bash
pnpm install
pnpm run db:start
pnpm run db:push
pnpm run dev
```

## Environment

Each app owns a `.env.schema`. Set values in the app's ignored `.env` or `.env.local` file. Varlock validates them at startup and generates `src/env.ts` on install; run `pnpm run env:generate` after changing a schema.

## Vendored and Generated Files

These files are kept byte-identical to their upstream sources. They are excluded from linting and formatting and are updated only through their CLIs:

- `packages/ui/src/components`, `hooks`, `lib`: shadcn CLI
- `apps/fumadocs/src/components/{ai,codeblock.tsx,tabs,ui}` and `src/lib/{cn,merge-refs}.ts`: Fumadocs CLI
- `packages/db/src/schema/auth.ts`: `pnpm run auth:generate`
- `packages/db/src/migrations`: `pnpm run db:generate`
- `.agents/skills`: `npx skills experimental_install`

Vendored code is type-checked in its own TypeScript project with relaxed flags (`packages/ui/tsconfig.json`, `apps/fumadocs/tsconfig.vendor.json`), so the rest of the repo keeps the strict base configuration.

## Scripts

| Script | Description |
| --- | --- |
| `pnpm run dev` | Start all apps in development mode |
| `pnpm run dev:web` | Start only the web app |
| `pnpm run build` | Build all apps and packages |
| `pnpm run check-types` | Type-check all apps and packages |
| `pnpm run check` / `pnpm run fix` | Lint and format check / fix |
| `pnpm run knip` | Find unused files, exports and dependencies |
| `pnpm run env:generate` | Regenerate `src/env.ts` from the schemas |
| `pnpm run auth:generate` | Regenerate the Better Auth schema |
| `pnpm run db:start` / `db:stop` / `db:down` | Manage the local PostgreSQL container |
| `pnpm run db:push` / `db:generate` / `db:migrate` / `db:studio` | Drizzle Kit commands |
| `pnpm run docker:build` / `docker:up` / `docker:down` / `docker:logs` | Manage the Docker Compose stack |
| `pnpm run infra:install` / `infra:check-types` / `infra:preview` / `infra:up` | Pulumi in `infra/` |

## Docker

`apps/web/Dockerfile` prunes the monorepo with `turbo prune`, builds the Next.js standalone output and runs it as a non-root user. Docker Compose runs it alongside PostgreSQL and reads `apps/web/.env` through a build secret and `env_file`.

## Deployment

`main` deploys to Google Cloud from GitLab CI (`.gitlab/ci/deploy.yml`), with Workload Identity Federation and no stored key:

1. `pulumi up` applies `infra/`: Cloud Run service `wovain-web`, Cloud SQL Postgres `wovain`, Artifact Registry, Secret Manager, service accounts, GitLab variables, labels, the Workflow board and feature flags.
2. The image from `apps/web/Dockerfile` is pushed to Artifact Registry.
3. `drizzle-kit migrate` runs against Cloud SQL through `cloud-sql-proxy`.
4. `gcloud run deploy` rolls the image out at `https://wovain-web-<project number>.us-central1.run.app`.

Secrets live in Secret Manager under kebab-case ids (`better-auth-secret` is `BETTER_AUTH_SECRET`). A secret gets a value from the stack config, `pulumi config set --secret <id>` in `infra/`, and Cloud Run mounts only the secrets that have one. Pulumi writes `database-url` itself. Logs are JSON lines on stdout (`apps/web/src/lib/cloud-logging.ts`): Cloud Logging parses them, and Error Reporting groups server errors under `wovain-web`.
