---
doc: spec
status: approved
---

# wovain — Technical Spec

## How This Works, In Plain Language

One Next.js 16 app runs on Google Cloud Run at <https://wovain.com>. It serves the website, an API and an MCP server that ChatGPT connects to. The website and ChatGPT call the same API procedures, so they always do the same thing. A PostgreSQL database on Cloud SQL remembers users, connections, runs, ideas, designs, products and campaigns.

When the seller asks for ideas, the API asks Qloo which themes the seed's fans love and asks Tavily what is in the news and on marketplaces inside those themes. Nemotron, hosted on Nebius Token Factory, writes the design brief and listing; fal draws the art; Nemotron judges it, and code re-checks the print size. On approval the API creates a Fourthwall product and, later, a Meta campaign, always paused. The documentation lives separately at <https://docs.wovain.com>.

Why not something more elaborate: one app and one set of procedures keep the proof of concept small and the two surfaces identical.

## The Core Journey Through the System

PRD ref: `prd.md > The Core Journey`.

1. The seller signs in → Better Auth (`/api/auth`) creates a session in PostgreSQL. ChatGPT instead signs in through Better Auth's OAuth server and calls `POST /api/mcp` with an access token.
2. The seller enters a seed → the page or the MCP tool `research_trends` calls `ideas.research` → `researchIdeas` in `packages/api/src/flow/ideas.ts` uses Qloo and Tavily from `packages/core` → ranked ideas are saved.
3. The seller picks an idea → `designs.generate` (`generateDesign`) → Nemotron brief (`draftBrief`), fal art (`createArtist`), price (`priceFor`), Nemotron judge (`judgeDesign`) → the design is saved as `pending_approval`.
4. The seller approves → `designs.approve` (`decideDesign`).
5. `products.create` (`createDesignProduct`) calls Fourthwall through the seller's sealed connection; `products.publish` makes it public.
6. `campaigns.create` (`createProductCampaign`) → Nemotron ad copy (`writeAdCopy`) → `stagePausedCampaign` creates the campaign, ad set and ads paused on Meta.
7. `runs.start` (`startRun`) chains these steps; with `autopilot: true` Nemotron picks the idea (`pickIdea`) and reviews the design (`reviewDesign`).

## Stack

| Layer | Choice | Docs |
| --- | --- | --- |
| App | Next.js 16, App Router, React 19 | <https://nextjs.org/docs> |
| API | oRPC procedures in `packages/api`, mounted at `/api/rpc` | <https://orpc.dev> |
| MCP | `@modelcontextprotocol/server` in `packages/api/src/mcp.ts`, served at `/api/mcp` | <https://modelcontextprotocol.io> |
| Auth | Better Auth with the MCP and JWT plugins in `packages/auth`, mounted at `/api/auth` | <https://better-auth.com> |
| Domain logic | `packages/core`: providers, pricing, judge, autopilot |  |
| Data | Drizzle ORM, PostgreSQL on Cloud SQL, in `packages/db` | <https://orm.drizzle.team> |
| Logs | evlog wide events, one per request | <https://evlog.dev> |
| UI | shadcn/ui on Base UI, Tailwind CSS 4, in `packages/ui` | <https://ui.shadcn.com> |
| Environment | Varlock schemas, typed `ENV` | <https://varlock.dev> |
| Docs site | Fumadocs with en, fr and es | <https://fumadocs.dev> |
| Models | NVIDIA Nemotron 3 Super (`NEMOTRON_MODEL`) on Nebius Token Factory | <https://docs.tokenfactory.nebius.com> |

## Where It Runs and How Someone Tries It

- **Production:** Cloud Run at <https://wovain.com>; docs at <https://docs.wovain.com>.
- **ChatGPT:** add a connector with the URL `https://wovain.com/api/mcp`. OAuth discovery is served at `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server`; the seller signs in and approves access on the consent page.
- **Locally:** Node.js (see `.nvmrc`), pnpm and Docker for PostgreSQL.

```bash
pnpm install
docker compose up -d
pnpm run dev
```

Keys go in `apps/web/.env.schema` values: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `DATABASE_URL`, `TOKEN_ENCRYPTION_KEY`, `NEBIUS_API_KEY`, `QLOO_API_KEY`, `TAVILY_API_KEY`, `FAL_KEY`, `META_APP_ID`, `META_APP_SECRET`. Never commit real values.

Submission needs a short demo video and the public repository; deployment is additional. Video URL: to be added. Repository URL: to be added.

## Look and Feel

Warm, plain, numbers first; coach voice. Light and dark themes from shadcn tokens; one primary action per card. Works at phone width.

## Components

### Web app (`apps/web`)

Pages (`login`, `dashboard`, `consent`), `/api/rpc`, `/api/auth`, `/api/mcp`, `/api/connections/[provider]/start` and `callback`, and the `.well-known` OAuth routes. `src/services.ts` builds `db`, `auth` and `core`. PRD ref: `prd.md > Screens and Layout`.

### API (`packages/api`)

`appRouter` in `src/routers/index.ts` lists `ideas`, `designs`, `products`, `campaigns`, `runs` and `connections`; the step logic is in `src/flow/*`. `publicProcedure` adds evlog logging; `protectedProcedure` requires a session or an MCP user. PRD ref: `prd.md > Features and Behavior`.

### MCP server (`packages/api/src/mcp.ts`)

`createMcpServer` registers `list_connections`, `research_trends`, `generate_design`, `approve_design`, `reject_design`, `create_product`, `publish_product`, `create_campaign`, `start_run` and `get_run`, each calling the same router. PRD ref: `prd.md > Screens and Layout`.

### Core (`packages/core`)

`createCore` wires Qloo (`qloo.ts`), Tavily (`trends.ts`), Nemotron (`nemotron.ts`), fal (`fal.ts`), pricing (`pricing.ts`), the judge (`design.ts`), autopilot (`autopilot.ts`), ads (`ads.ts`), Fourthwall (`fourthwall.ts`), the upstream OAuth client (`upstream.ts`) and token sealing (`sealing.ts`). PRD ref: `prd.md > Features and Behavior`.

### Auth (`packages/auth`)

`createAuth` builds Better Auth on the Drizzle database; `mcpResource` is the URL access tokens are bound to. PRD ref: `prd.md > States and Boundaries`.

### Database (`packages/db`)

Better Auth tables in `src/schema/auth.ts`; seller tables in `src/schema/seller.ts`. PRD ref: `prd.md > States and Boundaries`.

### Duo flows

Self-healing, scout and developer flows around the repository; definitions in `docs/flows.md`. PRD ref: `prd.md > Features and Behavior` (After deploy).

## Data Model

| Table | Holds | Updated |
| --- | --- | --- |
| `user`, `session`, `account` and OAuth tables | Better Auth | Sign-up, sign-in, OAuth consent |
| `connection`, `connection_flow` | A seller's Fourthwall and Meta grants, tokens sealed with AES-256-GCM; pending OAuth flows | On connect |
| `run` | A pass from a seed: autopilot flag, status, current step, error | Every step |
| `idea` | Ranked ideas with their research and the names never to print | On research |
| `design` | Brief, art, judgment, price, status and decision reason | On generate and decide |
| `product` | The Fourthwall product and its published state | On create and publish |
| `campaign` | The paused Meta campaign and its ad copy | On create |

Migrations are generated with `pnpm run db:generate`.

## File Structure

```
wovain/
├── apps/
│   ├── web/              # Next.js 16: pages, /api/rpc, /api/auth, /api/mcp
│   └── fumadocs/         # docs site, content/docs in en, fr, es
├── packages/
│   ├── api/              # oRPC routers, flow steps, MCP server
│   ├── auth/             # Better Auth configuration
│   ├── core/             # providers, pricing, judge, autopilot
│   ├── db/               # Drizzle schema, relations, client, migrations
│   ├── ui/               # shared shadcn/ui components
│   └── config/           # shared tsconfig
├── docs/                 # scope, PRD, spec, app map, flows
├── infra/                # deployment
└── AGENTS.md
```

## External Services and Dependencies

| Service | Use | Key | Notes |
| --- | --- | --- | --- |
| Nebius Token Factory | Nemotron brief, judge, ad copy and autopilot, OpenAI-compatible at `NEBIUS_BASE_URL` (`https://api.tokenfactory.nebius.com/v1/`) | `NEBIUS_API_KEY` | Pay per token |
| Qloo | `/search` and `/v2/insights` at `QLOO_API_URL` (`https://hackathon.api.qloo.com`) | `QLOO_API_KEY` | Hackathon key |
| Tavily | Live search of news and marketplaces (etsy.com, redbubble.com, fourthwall.com) | `TAVILY_API_KEY` | Rate limited |
| fal | Print art with GPT Image on fal | `FAL_KEY` | Pay per image |
| Fourthwall | Catalog, previews, products and publish through its MCP server | OAuth per seller |  |
| Meta Ads | Campaign, ad set and ads, created paused, through its MCP server | `META_APP_ID`, `META_APP_SECRET`, OAuth per seller | App review may be needed |
| Cloud SQL, Cloud Run | PostgreSQL and hosting | GCP project |  |

## Important Failure Modes

- **A provider key is missing** → the step fails with `NOT_CONFIGURED` naming the variable; other steps still work.
- **A seller has not connected Fourthwall or Meta** → the MCP tool returns the error, why, the fix and the connect link.
- **A step fails in a run** → the run is `failed` with its step and error.

## What Was Simplified and Why

- **One app** instead of separate API and MCP services — one set of procedures keeps surfaces consistent.
- **JSON tool results** instead of ChatGPT widgets — less code; widgets can come later.
- **Paused campaigns** instead of live launches — removes the risk of unintended spend.
- **T-shirt only** — one product proves the loop.
- **No optimizer** — it needs real spend data first.

## Decisions and Open Issues

- Code gates and Nemotron decides inside them — chosen so a model error cannot publish an unchecked design or spend money; the tradeoff is occasional overrides of a good model answer.
- Qloo before Tavily — taste narrows the news search; the tradeoff is dependence on Qloo coverage of the seed.
- Resolved: ChatGPT connects to `https://wovain.com/api/mcp`; Better Auth's MCP plugin is the OAuth server and `requireMcpAuth` verifies each token.
- Open: Meta app review scope for server-side campaign creation.
- Unfamiliar concept discussed: the difference between a model suggesting a value and code guaranteeing it. Clarified by the rule that code-decided checks (print size, price floor, budget range) are not model output, shown by the tests in `packages/core/src/design.test.ts`.
