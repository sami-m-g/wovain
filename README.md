# wovain

[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/sami-m-g/wovain/badge)](https://scorecard.dev/viewer/?uri=github.com/sami-m-g/wovain)

**An agentic print-on-demand app: Qloo finds who would buy, Tavily finds why now, Nemotron judges the designs, and you approve Fourthwall products and a paused Meta campaign.**

Demo: _URL placeholder, to be added before submission_

The seller flow runs on the website and in ChatGPT, both backed by one Next.js 16 app:

Qloo + Tavily trends → designs → Nemotron judge and autopilot on Nebius Token Factory → approve → Fourthwall products → Meta ad variants → paused campaign.

Full documentation is in the Fumadocs site (`apps/fumadocs`, `pnpm run dev`, port 4000).

## How wovain uses Nemotron on Nebius

Wovain calls **NVIDIA Nemotron 3.5 Super VL** (`nvidia/Nemotron-3.5-Super-VL`, the `NEMOTRON_MODEL` env var, set per environment in Pulumi config) on **Nebius Token Factory**, through the OpenAI-compatible endpoint `https://api.tokenfactory.nebius.com/v1/` with `NEBIUS_API_KEY`.

1. **Brief, judge and ad copy.** Nemotron writes the design brief and listing (`draftBrief`), judges the design (`judgeDesign`: a Zod-validated `ready` or `revise` verdict, a 0 to 100 score, a check for title, description, idea fit and originality, and up to five fixes) and writes up to three ad variants (`writeAdCopy`). The print-size rule is decided by code and overrides the model.
2. **Autopilot.** Nemotron picks the idea (`pickIdea`) and approves or rejects the design (`reviewDesign`), each with a stored reason. Code gates the run: a design the judge says to revise is never approved, the price keeps at least $10 profit and a 30% margin, the daily budget stays between $1 and $500, and every Meta object is created paused. Each step is recorded on the run.
3. **Docs chat.** The AI chat on [docs.wovain.com](https://docs.wovain.com) also runs on Nebius, on Nemotron 3.5 Lightning (`nvidia/Nemotron-3_5-Lightning`, the `DOCS_CHAT_MODEL` env var, $0.06 in and $0.24 out per 1M tokens). It searches the docs, answers in at most 400 tokens, and is rate limited per visitor.
4. **Safe by construction.** Replies that fail validation never reach the seller as raw errors, and no procedure activates a Meta object: campaigns stay paused.

Details: [docs/integrations/nebius-nemotron](apps/fumadocs/content/docs/integrations/nebius-nemotron.mdx).

### Which Nemotron model does what

With the `model-routing` flag on (dev and next.wovain.com; off in production for now), each agent asks for a job, not a model, and the job's model comes from an env var set per environment in Pulumi config (`packages/core/src/model-router.ts`, `AGENT_ROLES` in `packages/core/src/agents.ts`):

| Job | Env var | Model on next.wovain.com | What runs on it |
| --- | --- | --- | --- |
| Default | `NEMOTRON_MODEL_DEFAULT` | Nemotron 3.5 Super VL (`nvidia/Nemotron-3.5-Super-VL`) | Design brief and listing, research themes, ad copy |
| Reasoning | `NEMOTRON_MODEL_REASONING` | Nemotron 3 Ultra (`nvidia/Nemotron-3-Ultra-550b-a55b`) | The design judge's verdict, autopilot's idea pick and go/no-go |
| Vision | `NEMOTRON_MODEL_VISION` | Nemotron 3.5 Super VL | The judge's eyes: it reads the drawn PNG (garment, background, printed words, contrast per shirt color) before the verdict |
| Fast | `NEMOTRON_MODEL_FAST` | Nemotron 3.5 Lightning (`nvidia/Nemotron-3_5-Lightning`) | Ad judges (copy quality, Meta policy), Mastra scorers, prompt-injection and PII guardrails |
| Safety | `NEMOTRON_MODEL_SAFETY` | Nemotron 3.5 Lightning | Mastra moderation on what the merchant publishes |

- **Grounding guard.** Ad copy and listing text may only state numbers and claims (prices, percentages, "best-selling", "#1"…) that appear in what the tools returned. One that doesn't sends the answer back once, naming it; a second miss fails the step (`packages/core/src/grounding.ts`).
- **Real ad scores.** The fast model judges every ad variant with the binary ad judges; the share of passes is the ad score on the Insights page.
- **Which model did what.** Every agent call of a run is saved to its decision trace with the model, the job, the time it took and its result, and shown at `/dashboard/models?run=<id>` (linked from Runs).
- **Where Token Factory helped.** One OpenAI-compatible endpoint and one key serve all three Nemotron sizes, including the vision model that takes an https image URL directly, so routing by job is a config change, not a new provider. Token Factory serves no Nemotron content-safety model yet (checked 2026-10-28), so safety runs on Lightning through Mastra's moderation processor.

## Qloo-powered

Qloo's taste graph decides what a drop is about. Every run calls Qloo, whatever the plan; the `trends-qloo` flag is only a kill switch. The cross-domain taste map, the "Why this idea" panel and the LLM-only switch sit behind the `qloo-taste-map` flag (on in development and next, off in production):

1. **Seed entities.** `/search` resolves the brief to up to 3 Qloo entities (artists, films, books, brands …).
2. **Themes.** `/v2/insights` with `filter.type=urn:tag` returns the genre and keyword tags those fans share. The tags become the themes Tavily researches, and each idea keeps its tag and affinity.
3. **Cross-domain affinities.** `/v2/insights` runs for `urn:entity:brand`, `movie` and `tv_show` with `feature.explainability=true` and `bias.trends=low`. Each affinity keeps the share each seed entity contributed. Their style and mood words (a brand's `personal_style` and `emotional_tone`, a film's style and subgenre tags) go into the design brief. Their names never do.
4. **Why this idea.** Each idea card has a panel with the seed entities, the theme's tag and affinity, the affinities with their contributing entities, and the style cues sent to the brief. When Qloo fails, matches nothing or is off, the panel says so, and it names any domain (brands, films, TV) whose call failed. The failure is also logged at error level and goes to PostHog Error Tracking.
5. **With Qloo vs LLM-only.** A "Use Qloo taste data" switch on the brief step starts a run without Qloo, so the two sets of ideas can be compared. `pnpm --filter @wovain/core run evals` (with `QLOO_API_KEY`, `NEBIUS_API_KEY` and `NEMOTRON_MODEL`) runs 8 seeds through both arms. It writes `packages/core/src/evals/qloo-ablation.report.v1.json` with each arm's grounding, explanation, cue count and distance from the seed, plus the themes the two arms share.

A live trace of steps 1 to 3 for the brief "Studio Ghibli", run on 2026-10-28 (the key is redacted, entity IDs are shortened, and the timings are as measured):

```text
GET /search?query=Studio Ghibli&take=3&types=urn:entity:artist,…,urn:entity:videogame   200  1536 ms
  → Studio Ghibli (artist), Studio Ghibli: The Films of Hayao Miyazaki and Isao Takahata (book),
    Sharing a House with the Never-Ending Man: 15 Years at Studio Ghibli (book)
GET /v2/insights?filter.type=urn:tag&filter.tag.types=urn:tag:genre:media,urn:tag:genre:music,urn:tag:keyword:media
    &signal.interests.entities=D1222FA1…,6E9076C7…,832C1302…&take=10&bias.trends=low          200   252 ms
  → J-pop 1.00 · anime 1.00 · J-rock 1.00 · Video-Game Music 0.99 · soundtrack 0.99 · Visual-kei 0.98
GET /v2/insights?filter.type=urn:entity:movie&feature.explainability=true&bias.trends=low&take=3 …   200  1624 ms
  → Wolfwalkers 0.81, because: Studio Ghibli 35% · the Ghibli films book 33% · the Ghibli memoir 32%
    cues sent to the brief: Atmospheric, Adventure, Two tone visual dichotomy
GET /v2/insights?filter.type=urn:entity:tv_show&feature.explainability=true&bias.trends=low&take=3 … 200   711 ms
  → The Underground Railroad 0.85, Old Enough! 0.85, 63 Up 0.85
    cues: Magical realism, Close up intimacy, Childs eye perspective, Minimalist interview framing
GET /v2/insights?filter.type=urn:entity:brand&feature.explainability=true&bias.trends=low&take=3 …   200   383 ms
  → Vulture 0.83, MacRumors 0.83, Wired 0.83 · cues: Witty, Insightful, Bold, Analytical
```

Known limitations:

- The hackathon server refuses artist insights from an artist seed, and trend bias for books and games, so the cross-domain affinities are brands, films and TV only (no music).
- `bias.trends=medium` replaced the Ghibli fans' brands with unrelated trending ones (a medical association, a bank), so the bias is `low`.
- `/search` takes the top 3 matches. For "Studio Ghibli", two of them are books about the studio, which pulls the affinities toward documentaries.
- Tags carry no explainability, so the "why" for a theme is its tag's affinity with the seed entities' fans. The per-entity shares come from the cross-domain affinities.
- Qloo's hackathon terms limit it to free and demo plans until 2026-11-05. Only Free is sold (`billing-paid-plans` is off everywhere), so no merchant is on a paid plan yet. Opening paid plans waits for a commercial Qloo licence.

Details: [docs/integrations/qloo](apps/fumadocs/content/docs/integrations/qloo.mdx).

## How wovain uses Tavily at runtime

Inside the seller flow, Tavily searches the past week's news within Qloo's themes (the "why now"), and checks marketplace saturation on Etsy, Redbubble and Fourthwall. Results keep their source links. Details: [docs/integrations/tavily](apps/fumadocs/content/docs/integrations/tavily.mdx).

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

Infrastructure is code in `infra/` and runs on Google Cloud, with Workload Identity Federation and no stored key:

1. `pulumi up` applies `infra/` after a guarded, policy-checked preview (see [infra/README.md](infra/README.md#how-infra-changes-ship)): Cloud Run services `wovain-web` and `wovain-docs`, Cloud SQL Postgres `wovain`, Artifact Registry, Secret Manager, the wovain.com zone's records and domain mappings, Search Console verification, Resend's sending domain.
2. Both images are pushed to Artifact Registry.
3. `drizzle-kit migrate` runs against Cloud SQL through `cloud-sql-proxy`.
4. `gcloud run deploy` rolls the images out.

| Host                             | Serves                               |
| -------------------------------- | ------------------------------------ |
| `https://wovain.com`             | apps/web (`www` redirects here)      |
| `https://mcp.wovain.com/api/mcp` | the MCP endpoint ChatGPT connects to |
| `https://docs.wovain.com`        | apps/fumadocs                        |

Secrets live in Secret Manager under kebab-case ids (`better-auth-secret` is `BETTER_AUTH_SECRET`). A secret gets a value from the stack config, `pulumi config set --secret <id>` in `infra/`, and Cloud Run mounts only the secrets that have one. Pulumi generates `database-url`, `better-auth-secret` and `token-encryption-key` itself. A local `pulumi up` needs the Site Verification scope: `gcloud auth application-default login --scopes=https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/userinfo.email,https://www.googleapis.com/auth/siteverification`. Logs are JSON lines on stdout (`apps/web/src/lib/cloud-logging.ts`): Cloud Logging parses them, and Error Reporting groups server errors under `wovain-web`.
