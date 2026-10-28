# wovain

[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/sami-m-g/wovain/badge)](https://scorecard.dev/viewer/?uri=github.com/sami-m-g/wovain)

**A Qloo-powered agentic print-on-demand app for independent designers. Qloo finds who would buy and what else they love, Tavily finds why now and checks the evidence, NVIDIA Nemotron on Nebius Token Factory writes and judges the drop, and you approve the Fourthwall products and a paused Meta campaign.**

- Demo: https://next.wovain.com (the hackathon build; see [Demo login](#demo-login))
- Production: https://wovain.com runs the 2026-10-27 build, frozen for another hackathon's judging until 2026-11-16. The features this README marks "on next" are not on it.
- Docs: https://docs.wovain.com, or `apps/fumadocs` locally
- License: [MIT](LICENSE)

The seller flow runs on the website and in ChatGPT, both backed by one Next.js 16 app:

Qloo taste graph → Tavily evidence → you pick ideas → Nemotron brief → fal draws the art → the Nemotron judge looks at it → you approve → Fourthwall products → Nemotron ad copy → a paused Meta campaign targeted from Qloo demographics.

## Demo login

Judges share one ready account on [next.wovain.com](https://next.wovain.com):

1. Open https://next.wovain.com/login.
2. Sign in with `judges@wovain.com` and the password in the Devpost testing instructions.
3. You land on the overview. Its **Start here** checklist shows what's left: the brand is set, and the agent drafts only (hidden products, paused campaigns) within a $5 daily spend cap.
4. On **Billing**, redeem the judges' code from the Devpost testing instructions if the credits aren't there yet. It works only on this account and covers about 17 full drops.

The password and the code are never in this repository. The owner seeds the account with `pnpm --filter @wovain/auth seed:judges --env next` ([infra/README.md](infra/README.md#the-judges-demo-account-on-next-one-time-by-a-project-owner)).

A 3-minute path:

1. **New drop.** Type a brief, for example "cottagecore garden club for plant people", and start the run with "Use Qloo taste data" on.
2. **Ideas.** Each idea card has a "Why this idea" panel with the Qloo entities, tag, affinities and style cues behind it, plus the Tavily sources, competitor prices and an on-demand research dossier. Tick two ideas and press **See designs**.
3. **Designs.** Each design shows the judge's verdict, the checks the vision model ran on the drawn art, and any trademark findings with links. Approve one.
4. **Products and ads.** wovain lists the approved design on Fourthwall, writes the ad variants and stages a paused Meta campaign.
5. **Which model did what.** In **Runs**, open the run's **Models** link (`/dashboard/models?run=<id>`, "Which model did what") to see every agent call with its Nemotron model, time and result.
6. **Without Qloo.** Start the same brief with "Use Qloo taste data" off and compare the ideas.

## Nemotron on Nebius Token Factory

wovain calls NVIDIA Nemotron on Nebius Token Factory through its OpenAI-compatible endpoint (`NEBIUS_BASE_URL`, `https://api.tokenfactory.nebius.com/v1/`) with one key, `NEBIUS_API_KEY`. The app code holds no model ID. Each one is an env var that Pulumi sets per environment: `infra/next/Pulumi.next.yaml` for next.wovain.com, `infra/Pulumi.prod.yaml` for production and dev.

### Which model does what

With the `model-routing` flag on (dev and next.wovain.com; off in production), each agent asks for a job, and the job's env var names the model ([`packages/core/src/model-router.ts`](packages/core/src/model-router.ts), `AGENT_ROLES` in [`packages/core/src/agents.ts`](packages/core/src/agents.ts)):

| Job | Env var | Model on next.wovain.com | What runs on it |
| --- | --- | --- | --- |
| Default | `NEMOTRON_MODEL_DEFAULT` | Nemotron 3.5 Super VL (`nvidia/Nemotron-3.5-Super-VL`) | Design brief and listing ([`draftBrief`](packages/core/src/design.ts)), research themes ([`themes.ts`](packages/core/src/themes.ts)), ad copy ([`writeAdCopy`](packages/core/src/ads.ts)) |
| Reasoning | `NEMOTRON_MODEL_REASONING` | Nemotron 3 Ultra (`nvidia/Nemotron-3-Ultra-550b-a55b`) | The design judge's verdict ([`judgeDesign`](packages/core/src/design.ts)), autopilot's idea pick and go/no-go ([`pickIdea`, `reviewDesign`](packages/core/src/autopilot.ts)) |
| Vision | `NEMOTRON_MODEL_VISION` | Nemotron 3.5 Super VL | The judge's eyes. It reads the drawn PNG for a garment or mockup as the subject, a background, cropping, printed words that differ from the brief, and art that disappears on a shirt color |
| Fast | `NEMOTRON_MODEL_FAST` | Nemotron 3.5 Lightning (`nvidia/Nemotron-3_5-Lightning`) | Ad judges (copy quality, Meta policy), Mastra scorers, prompt-injection and PII guardrails |
| Safety | `NEMOTRON_MODEL_SAFETY` | Nemotron 3.5 Lightning | Mastra moderation on what the merchant publishes |

With the flag off, as in production, every agent uses `NEMOTRON_MODEL` (Nemotron 3.5 Super VL) and the judge's vision check uses `NEMOTRON_VISION_MODEL`. The docs chat runs on `DOCS_CHAT_MODEL` (Nemotron 3.5 Lightning, `reasoning_effort: none`, at most 400 output tokens, rate limited per visitor).

### What the agents do

- **Brief, judge and ad copy.** The brief writer turns an approved idea into a design brief and a listing. The judge returns a Zod-validated `ready` or `revise` verdict, a 0 to 100 score and up to five fixes. A `revise` design is redrawn once from the fixes at no extra credit; if it fails again, the card lists the failed checks. Code decides the print size and overrides the model.
- **Grounding guard.** Ad copy and listing text may only state numbers and claims (prices, percentages, "best-selling", "#1") that appear in what the tools returned. An answer that breaks the rule goes back once with the problem named, and a second miss fails the step with `UNGROUNDED_CLAIM` ([`grounding.ts`](packages/core/src/grounding.ts)).
- **Guardrails.** Web text from Tavily is untrusted. Before the brief writer reads it, a prompt-injection detector blocks injected instructions and a PII detector blocks personal data. Ad copy is moderated and checked for PII on the way out ([`agents.ts`](packages/core/src/agents.ts)).
- **Ad scores.** The fast model runs the binary ad judges on every variant. The share of passes is the ad score on the Insights page.
- **Autopilot.** With autopilot on, Nemotron picks the idea and approves or rejects the design, each with a stored reason. Code still gates the run: a design the judge sent back is never approved, the price keeps at least $10 profit and a 30% margin, the daily budget stays between $1 and $500, and every Meta object is created paused.
- **Trace.** Every agent call and guard check of a run goes into its decision trace with the agent, model, duration and result. Only the input's field names are stored, never their values. `/dashboard/models?run=<id>` shows the trace, linked from Runs.
- **Evals.** `pnpm --filter @wovain/core run evals` checks the six judges against a labeled set ([`judges.v1.json`](packages/core/src/evals/judges.v1.json)). On 2026-10-28, `nemotron-3-super-120b-a12b` and Nemotron 3.5 Super VL both agreed with all 20 scored labels. With a set this small, that is a smoke test.

### Where Token Factory helped

- One endpoint and one key serve Super VL, Ultra and Lightning, so routing by job is a config change per environment.
- The vision model takes an https image URL, so the judge reads the fal-hosted PNG without a re-upload.
- Strict `response_format: json_schema` works on Super VL, so the judge, the brief and the ad copy come back as validated JSON.
- `/v1/models` lists each model's `supported_features` (tools, reasoning). That made it quick to confirm replacements for the two models Nebius removes on 2026-11-09, `nemotron-3-super-120b-a12b` and `NVIDIA-Nemotron-3-Nano-30B-A3B`, both of which wovain used.
- Token Factory serves no Nemotron content-safety model yet (checked 2026-10-28), so moderation runs on Lightning through Mastra's moderation processor.

Details: [Nebius and Nemotron](apps/fumadocs/content/docs/%28developers%29/integrations/nebius-nemotron.mdx).

## Qloo-powered

Qloo's taste graph decides what a drop is about and who its ads reach. On next.wovain.com every run calls Qloo, whatever the plan, and the `trends-qloo` flag is only a kill switch. The cross-domain taste map, the "Why this idea" panel and the LLM-only switch are behind `qloo-taste-map`; Qloo-driven Meta targeting is behind `qloo-audiences`. Both are on in development and next and off in production.

### Endpoints

Every call goes to `QLOO_API_URL` (`https://hackathon.api.qloo.com`) from [`packages/core/src/qloo.ts`](packages/core/src/qloo.ts).

| Call | Parameters | What wovain does with the result |
| --- | --- | --- |
| `GET /search` | the brief, top 3, all entity types | Resolves the brief to seed entities (artists, films, books, brands, TV, podcasts, games) |
| `GET /v2/insights` | `filter.type=urn:tag`, genre and keyword tag types, `signal.interests.entities`, `bias.trends=low` | The tags those fans share become the themes Tavily researches. Each idea keeps its tag and affinity, and the affinity is 30% of the idea's score ([`score.ts`](packages/core/src/score.ts)) |
| `GET /v2/insights` | `filter.type=urn:entity:brand`, `movie` or `tv_show`, `feature.explainability=true`, `bias.trends=low` | Cross-domain affinities, with the share each seed entity contributed. Their style and mood tags go into the design brief, and their names never do ([`design.ts`](packages/core/src/design.ts)) |
| `GET /v2/insights` | `filter.type=urn:demographics` | Age and gender affinity of the brand's Qloo entities, mapped to the Meta ad set's `age_min`, `age_max` and `genders` ([`targeting.ts`](packages/core/src/targeting.ts)) |
| `GET /v2/insights` | `filter.results.entities` with `signal.demographics.audiences` | Scores 27 apparel-relevant `urn:audience` IDs against the brand's Qloo brands and keeps up to 3 that beat the average ([`qloo-audiences.ts`](packages/core/src/qloo-audiences.ts)). Their names go to Meta's interest search and into the ad writer's persona |

A step that fails is logged at error level to PostHog Error Tracking, marked failed on the idea or in the run's decision trace, and left out. The "Why this idea" panel ([`taste-map.tsx`](apps/web/src/components/app/taste-map.tsx)) says when Qloo failed, matched nothing or was off, and names any domain whose call failed.

### What breaks without Qloo

The "Use Qloo taste data" switch sends `qloo: false` to `runs.start`. The run still finishes, but these parts go generic:

- **Themes.** Nemotron splits the brief into themes. They stay close to the words the merchant typed, because nothing links them to what those fans also love.
- **Ranking.** Ideas have no affinity, so the 30% demand weight sits at a neutral 0.5 for every idea, and Tavily's news and marketplace signals decide the order.
- **The brief.** The brief writer gets no cross-domain style or mood cues.
- **The evidence.** The "Why this idea" panel has nothing to show, and the Tavily research dossier gets no `qloo-taste.json`.
- **Ads.** The Meta ad set targets countries only, without Qloo's ages, gender or audiences, and the ad writer gets no persona.

[`qloo-ablation.eval.ts`](packages/core/src/evals/qloo-ablation.eval.ts) runs 8 seeds through both arms with the app's own theme step. It reports each arm's grounding, explanation, cue count and distance from the seed, plus the themes the two arms share. It needs `QLOO_API_KEY`, `NEBIUS_API_KEY` and `NEMOTRON_MODEL`, and writes `packages/core/src/evals/qloo-ablation.report.v1.json`.

### A live trace

The first calls for the brief "Studio Ghibli", run on 2026-10-28. The key is redacted, entity IDs are shortened, and the timings are as measured:

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

What we found working with the hackathon API:

- It refuses artist insights from an artist seed, and trend bias for books and games, so the cross-domain affinities are brands, films and TV (no music).
- `bias.trends=medium` replaced the Ghibli fans' brands with unrelated trending ones (a medical association, a bank), so wovain uses `low`.
- `/search` takes the top 3 matches. For "Studio Ghibli", two are books about the studio, which pulls the affinities toward documentaries.
- Tags carry no explainability, so a theme's "why" is its tag's affinity with the seed entities' fans. The per-entity shares come from the cross-domain affinities.
- Audience scores separate brands well (Supreme, Patagonia) but come back flat (0.765) for artists and films, so audiences are scored on brands only.
- Qloo's hackathon terms limit it to free and demo plans until 2026-11-05. Only Free is sold (`billing-paid-plans` is off everywhere), and paid plans open only with a commercial Qloo licence.

Details: [Qloo](apps/fumadocs/content/docs/%28developers%29/integrations/qloo.mdx).

## Tavily

Tavily is wovain's live web evidence, called on every run from [`packages/core/src/trends.ts`](packages/core/src/trends.ts) and [`packages/core/src/evidence.ts`](packages/core/src/evidence.ts).

- **Search.** Each Qloo theme gets two searches. A news search (`topic: news`, `time_range: month`, `search_depth: advanced`) finds why the theme matters now. A marketplace search on Etsy, Redbubble, TeePublic and Fourthwall shows how crowded it already is. Code drops results under 0.4 relevance, news older than 31 days and archive or tag pages, then keeps the top 3 sources with their links.
- **Extract.** Behind `tavily-evidence` (on in development and next), Tavily Extract reads up to 5 competitor listings per theme. Their median price feeds the margin score. When a page fails, the margin falls back to the prices in the search snippets.
- **Research.** **Research this idea** on an idea card starts a Tavily Research task (`TAVILY_RESEARCH_MODEL`, `mini`) with an `output_schema` of why now, saturation, price band, risks and citations. The idea's Qloo theme and the brand's Qloo entities go in as a `qloo-taste.json` file. It runs once per idea and costs the merchant no credits.
- **Trademark check.** Every phrase printed on a design is searched as an exact phrase on uspto.gov, trademarkia, Justia trademarks and EUIPO, and on the marketplaces. A register page whose title carries the phrase fails the judge's `trademark` rule, and the redraw rewrites the words. A marketplace match shows as a caution with its link.

Guardrails:

- Each search settles on its own. A failed search is logged at error level, the idea stands on the other one, and the card says which search failed. The step fails, and refunds the credit, only when every search fails.
- The trademark check fails closed. A phrase that couldn't be checked holds the design at `revise`, and the merchant decides.
- Everything Tavily returns is kept as data. The prompt-injection and PII guardrails read it before the brief writer does, and the grounding guard stops ad copy from stating a number Tavily didn't return.

Details: [Tavily](apps/fumadocs/content/docs/%28developers%29/integrations/tavily.mdx).

## Limitations

- **Two builds.** wovain.com stays on the 2026-10-27 build until 2026-11-16. Everything this README describes past that build runs on next.wovain.com only, behind flags that are on in development and next and off in production.
- **Spend only through approvals.** Meta campaigns are staged paused. With `media-buying-live`, a campaign starts only when the merchant approves it inside their daily and monthly caps; the demo account's cap is $5 a day and its autonomy level drafts only. The ads optimizer proposes reallocations through the same queue and never moves money on its own.
- **No mobile app yet.** The Expo app (#86) is not merged: its dependencies need a license exception for `react-native` and an OSV decision on the zod 3 that `@expo/cli` pulls in. Voice input works on the web only.
- **Meta interest search is untested live.** wovain calls Graph `search?type=adinterest` with the app token. If Meta refuses it, the step fails visibly and the ad set keeps Qloo's ages and gender.
- **fal.** With the onboarding wizard on, designs draw on wovain's own fal key and the design's credits pay for them; without it, each merchant connects their own fal account. Voice commands always transcribe on wovain's key.
- **Feedback needs history.** The feedback loop and the ads optimizer learn from sales and ad results, so a new account starts on the default weights.
- **Small evals.** The judge set has 20 scored cases. The Qloo ablation report and a judge run on the routed models (Ultra, Lightning) are not in the repo yet, because both need the provider keys.
- **Ultra's latency.** Nemotron 3 Ultra must answer within the 90 s agent timeout. If it doesn't, `nemotronModelReasoning` on next goes back to Super VL, which is a config change.
- **Tavily images.** The news search returns images, and wovain doesn't use them yet.
- **Durable runs.** On next, 10% of runs use the Mastra workflow on Inngest and the rest use the earlier engine. Both run the same steps.
- **Retry.** "Try again" on a failed run starts it with Qloo on, because the run doesn't store the switch.

## What changed since Aug 26 / Sep 30

The repository's first commit is from 2026-10-06. All of wovain was built after the Nebius submission period opened (2026-08-26) and after the Qloo period opened (2026-09-30).

| Dates | What shipped |
| --- | --- |
| Oct 19–23 | The first MCP app for ChatGPT: ideas, designs, Fourthwall products and ad concepts. Qloo taste signals and Tavily search in trend research. The design judge and autopilot on Nemotron through Nebius. Fourthwall, fal and Meta connections, with grants sealed by Cloud KMS |
| Oct 25–26 | The web app on Cloud Run and Cloud SQL, with Better Auth, Google sign-in and email verification. The seller flow as oRPC procedures and MCP tools. Mastra agents with scorers, guardrails, memory and tracing, and runs as a durable Mastra workflow on Inngest. Credits and the Polar catalog (Free only). The docs site in en, es and fr with a Nemotron docs chat. The Build With AI: Basics submission (tag `submission/basics`) |
| Oct 27 | Development moved to GitHub: Actions CI, Dependabot, and PostHog feature flags managed by Pulumi |
| Oct 28 | Model IDs as env vars per environment, ahead of Nebius's 2026-11-09 removals (#28). The judge looks at the drawn art (#23). Designs only for the ideas the merchant approves (#21). next.wovain.com in its own Pulumi stack (#25, #57). Autonomy levels, one approval queue and decision traces (#60). Nemotron routing by job, the grounding guard, real ad scores and the models page (#74). The Qloo taste map with explainability, cross-domain cues and the LLM-only ablation (#79). Qloo demographics and audiences driving Meta targeting and the ad persona (#75). Tavily as the evidence layer: per-search failures, competitor prices, research dossiers and the trademark check (#73). SAST, dependency, license, secret and SBOM scanning (#61). The onboarding wizard (#76), scheduled autopilot triggers (#78), live media buying through approvals (#72), the ads optimizer (#70), the feedback loop (#83), voice input (#85), store management (#87), design drops (#91) and the judges' demo account (#97) |

## Setup from a clean clone

You need Node.js (the version in `.nvmrc`), pnpm and Docker.

```bash
git clone https://github.com/sami-m-g/wovain.git && cd wovain
pnpm run db:start          # PostgreSQL in Docker: user postgres, password "password", database wovain
```

Varlock validates every variable in `apps/web/.env.schema` at start-up, and the per-environment settings have no defaults. Write `apps/web/.env.local` with local values. CI uses the same ones (`.github/workflows/ci.yml`):

```bash
fixture() { node --input-type=module -e "const m = await import('$1'); console.log(JSON.stringify(m['$2']))"; }
{
  echo "BETTER_AUTH_SECRET=$(openssl rand -hex 32)"
  echo "BETTER_AUTH_URL=http://localhost:3001"
  echo "DATABASE_URL=postgresql://postgres:password@localhost:5432/wovain"
  echo "TOKEN_ENCRYPTION_KEY=$(openssl rand -base64 32)"
  echo "BILLING_CATALOG=$(fixture ./packages/billing/src/catalog-fixture.ts TEST_CATALOG)"
  echo "PRICING_RULES=$(fixture ./packages/core/src/config-fixture.ts TEST_PRICING_RULES)"
  echo "DOCS_URL=http://localhost:4000"
  echo "MCP_URL=http://localhost:3001/api/mcp"
  echo "EMAIL_FROM=wovain <dev@example.com>"
  echo "SUPPORT_EMAIL=support@example.com"
  echo "PRIVACY_EMAIL=privacy@example.com"
  echo "FAL_MCP_URL=https://mcp.fal.ai/mcp-relay"
  echo "FOURTHWALL_MCP_URL=https://mcp.fourthwall.com/app"
  echo "FOURTHWALL_DEFAULT_PRODUCT_ID=pro_8be1acca2fe7403f89"
  echo "META_MCP_URL=https://mcp.facebook.com/ads"
  echo "META_MCP_SCOPE=ads_read"
  echo "MCP_WIDGET_RESOURCE_DOMAINS=https://fal.media"
  echo "GUARDRAIL_INJECTION_THRESHOLD=0.8"
  echo "GUARDRAIL_MODERATION_THRESHOLD=0.7"
  echo "GUARDRAIL_PII_THRESHOLD=0.7"
  echo "NEMOTRON_INPUT_PRICE=0.3"
  echo "NEMOTRON_OUTPUT_PRICE=0.9"
  echo "INNGEST_DEV=1"
  echo "NEBIUS_API_KEY="   # runs need all three provider keys
  echo "QLOO_API_KEY="
  echo "TAVILY_API_KEY="
} > apps/web/.env.local
```

Then install, migrate and start:

```bash
pnpm install               # also generates the typed env from the schema
pnpm run db:migrate
pnpm run dev:web           # http://localhost:3001
npx inngest-cli@latest dev -u http://localhost:3001/api/inngest   # second terminal; runs need it
```

- The model IDs, the fal image model and the Tavily Research model have local defaults in `.env.schema`.
- Without `RESEND_API_KEY`, the verification email goes to the dev server's log. Open its link to finish signing up.
- Fourthwall, fal and Meta connect through OAuth on the Connections page. Meta needs `META_APP_ID` and `META_APP_SECRET`, and Google sign-in needs `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
- Feature flags fall back to the registry in [`packages/core/src/flag-registry.ts`](packages/core/src/flag-registry.ts), where every workstream flag is on in development.
- The docs site (`pnpm run dev`, port 4000) needs only `NEBIUS_API_KEY`, for its chat.

Tests and checks: `pnpm run test`, `pnpm run check`, `pnpm run check-types`, `pnpm run knip` and `pnpm run spec:validate`.

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

## Hackathons

See the [Hackathons page](apps/fumadocs/content/docs/%28developers%29/hackathons.mdx) for where each requirement is met.

## License

[MIT](LICENSE)

## Deployment

Infrastructure is code in `infra/` and runs on Google Cloud, with Workload Identity Federation and no stored key:

1. `pulumi up` applies `infra/` after a guarded, policy-checked preview (see [infra/README.md](infra/README.md#how-infra-changes-ship)): Cloud Run services `wovain-web` and `wovain-docs`, Cloud SQL Postgres `wovain`, Artifact Registry, Secret Manager, the wovain.com zone's records and domain mappings, Search Console verification, Resend's sending domain.
2. Both images are pushed to Artifact Registry.
3. `drizzle-kit migrate` runs against Cloud SQL through `cloud-sql-proxy`.
4. `gcloud run deploy` rolls the images out.

| Host | Serves |
| --- | --- |
| `https://wovain.com` | apps/web (`www` redirects here) |
| `https://mcp.wovain.com/api/mcp` | the MCP endpoint ChatGPT connects to |
| `https://docs.wovain.com` | apps/fumadocs |
| `https://next.wovain.com` | apps/web from main (`infra/next`), the hackathon demo |

Secrets live in Secret Manager under kebab-case ids (`better-auth-secret` is `BETTER_AUTH_SECRET`). A secret gets a value from the stack config, `pulumi config set --secret <id>` in `infra/`, and Cloud Run mounts only the secrets that have one. Pulumi generates `database-url`, `better-auth-secret` and `token-encryption-key` itself. A local `pulumi up` needs the Site Verification scope: `gcloud auth application-default login --scopes=https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/userinfo.email,https://www.googleapis.com/auth/siteverification`. Logs are JSON lines on stdout (`apps/web/src/lib/cloud-logging.ts`): Cloud Logging parses them, and Error Reporting groups server errors under `wovain-web`.
