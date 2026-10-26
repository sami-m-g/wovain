# wovain

**An agentic print-on-demand app: Qloo finds who would buy, Tavily finds why now, Nemotron judges the designs, and you approve Fourthwall products and a paused Meta campaign.**

Demo: _URL placeholder, to be added before submission_

The seller flow runs on the website and in ChatGPT, both backed by one Next.js 16 app:

Qloo + Tavily trends → designs → Nemotron judge and autopilot on Nebius Token Factory → approve → Fourthwall products → Meta ad variants → paused campaign.

Full documentation is in the Fumadocs site (`apps/fumadocs`, `pnpm run dev`, port 4000).

## How wovain uses Nemotron on Nebius

Wovain calls **NVIDIA Nemotron 3 Super** (`nvidia/nemotron-3-super-120b-a12b`) on **Nebius Token Factory**, through the OpenAI-compatible endpoint `https://api.tokenfactory.nebius.com/v1/` with `NEBIUS_API_KEY`.

1. **Brief, judge and ad copy.** Nemotron writes the design brief and listing (`draftBrief`), judges the design (`judgeDesign`: a Zod-validated `ready` or `revise` verdict, a 0 to 100 score, a check for title, description, idea fit and originality, and up to five fixes) and writes up to three ad variants (`writeAdCopy`). The print-size rule is decided by code and overrides the model.
2. **Autopilot.** Nemotron picks the idea (`pickIdea`) and approves or rejects the design (`reviewDesign`), each with a stored reason. Code gates the run: a design the judge says to revise is never approved, the price keeps at least $10 profit and a 30% margin, the daily budget stays between $1 and $500, and every Meta object is created paused. Each step is recorded on the run.
3. **Docs chat.** The AI chat on [docs.wovain.com](https://docs.wovain.com) also runs on Nebius, on the smallest Nemotron (`nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`, $0.06 in and $0.24 out per 1M tokens). It searches the docs, answers in at most 400 tokens, and is rate limited per visitor.
4. **Safe by construction.** Replies that fail validation never reach the seller as raw errors, and no procedure activates a Meta object: campaigns stay paused.

Details: [docs/integrations/nebius-nemotron](apps/fumadocs/content/docs/integrations/nebius-nemotron.mdx).

## How wovain uses Qloo

Qloo is the first step of every run. The seed is resolved to Qloo entities (`/search`), their cross-domain taste tags (`/v2/insights`) become the design themes, and the names Qloo matched are saved as names never to print. Ideas are ranked in code with the inputs saved alongside. Details: [docs/integrations/qloo](apps/fumadocs/content/docs/integrations/qloo.mdx).

## How wovain uses Tavily at runtime

Inside the seller flow, Tavily searches the past week's news within Qloo's themes (the "why now"), and checks marketplace saturation on Etsy, Redbubble and Fourthwall. Results keep their source links. Details: [docs/integrations/tavily](apps/fumadocs/content/docs/integrations/tavily.mdx).

## GitLab Duo flows

After the code ships, three GitLab Duo flows automate post-code DevSecOps:

| Flow | What it does |
| --- | --- |
| Self-healing | Reads production errors from evlog wide events and opens a fix merge request; feature-flag fault injection makes it demonstrable |
| Scout | Reads KPIs and UI and files improvement issues |
| Developer | Takes an issue to a merge request |

Details: [docs/flows.md](docs/flows.md) and [Agent flows](apps/fumadocs/content/docs/agent-flows.mdx).

## Architecture

| Path | Role |
| --- | --- |
| `apps/web` | Next.js 16 app (App Router, oRPC, Better Auth, evlog); the ChatGPT MCP server is `POST https://mcp.wovain.com/api/mcp` |
| `apps/fumadocs` | Documentation site |
| `packages/api` | oRPC routers, seller-flow steps and the MCP server |
| `packages/core` | Providers and rules: Qloo, Tavily, Nemotron, fal, pricing, judge, autopilot |
| `packages/auth` | Better Auth configuration |
| `packages/db` | Drizzle schema and client for PostgreSQL (Cloud SQL on GCP) |
| `packages/ui` | Shared shadcn/ui components |

## Quick start

```bash
pnpm install
docker compose up -d   # local PostgreSQL
pnpm run dev           # web app and docs
```

Environment variables are validated by [Varlock](https://varlock.dev): each app has a `.env.schema`. The web app needs `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` and `DATABASE_URL`; provider keys are `NEBIUS_API_KEY`, `QLOO_API_KEY` and `TAVILY_API_KEY` (fal runs on each merchant's own fal account, connected in Connections).

Before committing: `pnpm run check`, `pnpm run check-types` and `pnpm run knip`.

## Hackathons

See the [Hackathons page](apps/fumadocs/content/docs/hackathons.mdx) for where each requirement is met.

## License

[MIT](LICENSE)

## Deployment

`main` deploys to Google Cloud from GitLab CI (`.gitlab/ci/deploy.yml`), with Workload Identity Federation and no stored key:

1. `pulumi up` applies `infra/` after a guarded, policy-checked preview (see [infra/README.md](infra/README.md#how-infra-changes-ship)): Cloud Run services `wovain-web` and `wovain-docs`, Cloud SQL Postgres `wovain`, Artifact Registry, Secret Manager, the wovain.com zone's records and domain mappings, Search Console verification, Resend's sending domain, GitLab variables, labels, the Workflow board and feature flags.
2. Both images are pushed to the GitLab container registry (Container Scanning) and Artifact Registry.
3. `drizzle-kit migrate` runs against Cloud SQL through `cloud-sql-proxy`.
4. `gcloud run deploy` rolls the images out.

| Host                             | Serves                                  |
| -------------------------------- | --------------------------------------- |
| `https://wovain.com`             | apps/web (`www` redirects here)         |
| `https://mcp.wovain.com/api/mcp` | the MCP endpoint ChatGPT connects to    |
| `https://docs.wovain.com`        | apps/fumadocs                           |
| `https://status.wovain.com`      | the status page (GitLab Pages, proxied) |

Secrets live in Secret Manager under kebab-case ids (`better-auth-secret` is `BETTER_AUTH_SECRET`). A secret gets a value from the stack config, `pulumi config set --secret <id>` in `infra/`, and Cloud Run mounts only the secrets that have one. Pulumi generates `database-url`, `better-auth-secret` and `token-encryption-key` itself. A local `pulumi up` needs the Site Verification scope: `gcloud auth application-default login --scopes=https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/userinfo.email,https://www.googleapis.com/auth/siteverification`. Logs are JSON lines on stdout (`apps/web/src/lib/cloud-logging.ts`): Cloud Logging parses them, and Error Reporting groups server errors under `wovain-web`.
