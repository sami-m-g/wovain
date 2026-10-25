# wovain

**An agentic print-on-demand app: Qloo finds who would buy, Tavily finds why now, Nemotron judges the designs, and you approve Fourthwall products and a paused Meta campaign.**

Demo: _URL placeholder, to be added before submission_

The seller flow runs on the website and in ChatGPT, both backed by one Next.js 16 app:

Qloo + Tavily trends → designs → Nemotron judge and autopilot on Nebius Token Factory → approve → Fourthwall products → Meta ad variants → paused campaign.

Full documentation is in the Fumadocs site (`apps/fumadocs`, `pnpm run dev`, port 4000).

## How wovain uses Nemotron on Nebius

Wovain calls **NVIDIA Nemotron 3 Super** (`nvidia/nemotron-3-super-120b-a12b`) on **Nebius Token Factory**, through the OpenAI-compatible endpoint `https://api.tokenfactory.nebius.com/v1/` with `NEBIUS_API_KEY`.

1. **Design judge.** Before a design is shown, Nemotron receives the brief (idea, blank, placement, colors, artwork metadata, listing) and returns a Zod-validated verdict (`ready` or `revise`), a 0 to 100 score, a pass or fail per print rule and up to five fixes. Rules code can decide (print size, transparency, title length, color count) override the model.
2. **Autopilot.** Each approval point (idea, listing and price, ad concepts, campaign budget) is a Nemotron decision. After every reply, code applies hard limits: a price floor from breakeven, a budget cap, a trademark screen, a judge pass and a maximum spend. Every decision is stored with Nemotron's reasoning and any code override.
3. **Safe by construction.** Replies that fail validation never reach the seller as raw errors, and no procedure activates a Meta object: campaigns stay paused.

Details: [docs/integrations/nebius-nemotron](apps/fumadocs/content/docs/integrations/nebius-nemotron.mdx).

## How wovain uses Qloo

Qloo is the first step of every run. The seed is resolved to Qloo entities, their cross-domain taste tags become the design themes, and Qloo's trending velocity confirms or discounts the news. Ideas are scored in code on demand, momentum, low saturation and IP safety. After a design is chosen, Qloo's demographics and heatmap insights become the Meta audience suggestion (age, gender, top countries). Details: [docs/integrations/qloo](apps/fumadocs/content/docs/integrations/qloo.mdx).

## How wovain uses Tavily at runtime

Inside the seller flow, Tavily searches the past week's news within Qloo's themes (the "why now"), checks marketplace saturation on Etsy, Redbubble and Amazon, and screens titles and art words for trademarks in autopilot. Results keep their source links. Details: [docs/integrations/tavily](apps/fumadocs/content/docs/integrations/tavily.mdx).

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
| `apps/web` | Next.js 16 app (App Router, oRPC, Better Auth, evlog) and the ChatGPT MCP server |
| `apps/fumadocs` | Documentation site |
| `packages/api` | oRPC routers and procedures |
| `packages/auth` | Better Auth configuration |
| `packages/db` | Drizzle schema and client for PostgreSQL (Cloud SQL on GCP) |
| `packages/ui` | Shared shadcn/ui components |

## Quick start

```bash
pnpm install
docker compose up -d   # local PostgreSQL
pnpm run dev           # web app and docs
```

Environment variables are validated by [Varlock](https://varlock.dev): each app has a `.env.schema`. The web app needs `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` and `DATABASE_URL`; provider keys are `NEBIUS_API_KEY`, `QLOO_API_KEY`, `TAVILY_API_KEY` and `FAL_KEY`.

Before committing: `pnpm run check`, `pnpm run check-types` and `pnpm run knip`.

## Hackathons

See the [Hackathons page](apps/fumadocs/content/docs/hackathons.mdx) for where each requirement is met.

## License

[MIT](LICENSE)
