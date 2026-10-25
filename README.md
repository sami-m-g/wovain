# wovain

An MCP server for print-on-demand sellers, hosted on Firebase App Hosting, that any agent (ChatGPT, Claude, …) can connect to. In one chat it designs a product, publishes it to a Fourthwall shop, makes two short video ads for it, and builds one Meta Advantage+ sales campaign with five automated rules.

Built for Devpost's [Build With AI: Basics](https://learn-ai-basics.devpost.com/) with the Devpost Learn skill pack. The planning documents are in [`docs/`](docs/): [scope](docs/scope.md), [PRD](docs/prd.md), [spec](docs/spec.md), [build checklist](docs/checklist.md) and an [app map](docs/app-map.html) of the code.

## What works

| Step | What you see in the chat | Status |
| --- | --- | --- |
| Settings | Settings widget: budget, rule multiples, video model and audio | Working |
| Design | "design a tee for: …" → design widget with mockups, price, profit and margin; Approve publishes it on Fourthwall | Working |
| Ads | Ad widget with 2 to 4 ad concepts per product (hook, audience, why now), Feed and Stories visuals (fal images, mockup, optional video), text variants for Advantage+, a carousel across the set and the breakeven line; Approve, Skip or feedback per concept | Working |
| Campaign | Campaign widget: one Advantage+ sales campaign built as a Meta draft, the five rules created in Meta, Launch to publish | Working (Launch needs a payment method on the ad account) |
| Optimization check-in, mock mode | — | Planned, not built (see the checklist's Revisions) |

## Requirements

- An agent that speaks MCP over streamable HTTP with OAuth, such as ChatGPT (developer mode) or Claude
- [Node.js](https://nodejs.org) 24 and [pnpm](https://pnpm.io) 12.3.4 (`corepack enable` picks it up from `packageManager`)
- Java 21, for the Firestore and Storage emulators that `pnpm dev` and `pnpm test:integration` run on
- In the same agent, these MCP servers connected and signed in: **Fourthwall**, **Meta Ads** and **fal**
- A Fourthwall shop, a Meta ad account with a Facebook Page and a pixel, and fal credit (about $0.18 per ad video at fal's list prices: one 5-second H3 Max Turbo clip, its audio and three crops)

## Setup

```bash
git clone https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase.git wovain
cd wovain
pnpm install
cp apps/server/.env.example apps/server/.env
```

Fill in `apps/server/.env` (empty values count as unset; in production they come from `apphosting.yaml`, with secrets set by `pulumi config set --secret <name>` in `infra/` (encrypted with a KMS key, applied by `pnpm infra:up`)):

| Key | Needed for | Where to get it |
| --- | --- | --- |
| `FAL_KEY` | Hosting finished videos, live video prices | fal dashboard → API keys |
| `META_APP_ID`, `META_APP_SECRET` | Optional: merchants connecting Meta to wovain (Meta's Ads MCP has no dynamic registration, so wovain's own Meta app is the OAuth client). Without them, merchants use their host's Meta Ads connector and rules aren't created | Your Business-type Meta app (Ads MCP use case) → App settings → Basic. See [Meta app](#meta-app) |
| `NEBIUS_API_KEY` | Optional: the design check (`judge_design`, Nemotron on Nebius Token Factory); without it the check is skipped | Nebius Token Factory → API keys |
| `QLOO_API_KEY` | Optional: Qloo's Taste API, for the taste graph under `research_trends` and for `suggest_audience`; without it research uses the seed as its one theme | The hackathon's event key (it works only on `hackathon.api.qloo.com`) |
| `TAVILY_API_KEY` | Optional: trend research, the niche brief, the competitor scan and the trademark screen (`research_trends`, `get_niche_brief`, `scan_competitor_site`, `screen_trademark`); without it each says it isn't set up | Tavily dashboard → API keys |
| `WORKOS_AUTHKIT_DOMAIN` | Sign-in: the AuthKit domain that issues `/mcp`'s tokens | WorkOS dashboard (e.g. `https://<name>.authkit.app`) |
| `WORKOS_API_KEY` | Reads each caller's email for the allowlist | WorkOS dashboard → API keys |
| `WOVAIN_ALLOWED_EMAILS` | Who may use `/mcp` (comma-separated verified emails; empty lets nobody in) | The email you sign in to AuthKit with |
| `WOVAIN_SITE_URL` | Optional: overrides the site URL, e.g. a tunnel to your local server | Your tunnel's URL |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Optional: send traces to GitLab Observability (unset sends nothing; production sends to the group's endpoint, set in `apphosting.yaml`) | GitLab group → Observe → Setup |
| `OTEL_EXPORTER_OTLP_HEADERS` | Optional: the auth header for that endpoint, as `key=value`, once the endpoint enforces a token | Group → Observe → API Keys |

Storage needs no keys: locally `pnpm dev` starts the Firestore and Storage emulators, and on App Hosting the server finds its Firebase project and bucket on its own.

## Connect an agent

Add `<App Hosting URL>/mcp` (`https://app--wovain.us-central1.hosted.app/mcp`) as a remote MCP server (streamable HTTP) in your agent, or `https://<tunnel>/mcp` for a local server. It carries no credentials: the first time you use wovain, the agent sends you to sign in with Google and approve access. Then try "show my wovain settings".

ChatGPT's connector icon must be under 10 KB; use `apps/server/public/icon-200.png` (also served at `<site>/icon-200.png`).

The server tells the agent the flow in its MCP `instructions`, and serves a playbook per step (`design`, `ads`, `campaign`) through the `get_playbook` tool and as MCP prompts.

## Nebius and Nemotron

wovain makes its own model calls through [Genkit](https://genkit.dev), with the OpenAI-compatible plugin (`@genkit-ai/compat-oai`) pointed at Nebius Token Factory (`https://api.tokenfactory.nebius.com/v1/`). The model is NVIDIA Nemotron 3 Super (`nvidia/nemotron-3-super-120b-a12b`), set once in `apps/server/src/lib/ai.ts`.

| Call | When | What it does |
| --- | --- | --- |
| `judge_design` | The design playbook calls it before every design widget | Scores the design brief (idea, blank, placement, colors, artwork size and transparency, listing, coach line) against wovain's print and listing rules. Returns a verdict, one check per rule, up to 5 fixes and a coach line, checked by a zod schema. Code decides print size, transparency, title length and color count itself, and those results override the model. |

To run it:

1. Put a Token Factory key in `apps/server/.env` as `NEBIUS_API_KEY` and run `pnpm dev`. Without the key, `judge_design` answers `configured: false` and the agent skips the check.
2. `pnpm test:live` makes one real call with the demo brief and checks the reply against the schema (a fraction of a cent). It's skipped without the key. `pnpm test` and `pnpm test:integration` use Genkit's mock model and never call Nebius.
3. In production, set the secret (`pulumi config set --secret nebius-api-key` in `infra/`) and list `NEBIUS_API_KEY` in `apphosting.yaml`.

## Tavily

How wovain uses Tavily, through the official `@tavily/core` SDK at runtime (no hand-rolled HTTP). Every call asks for `include_usage`, and `research_trends` returns what the run cost as `credits`.

| Endpoint | Where | What it does |
| --- | --- | --- |
| `search` (news) | `research_trends`, per theme | This week's news (`topic: news`, `time_range: week`) for timing hooks, with Tavily's `answer` (`include_answer: advanced`) and reference images with descriptions (`include_images`, `include_image_descriptions`) for the mood board. Per-result `score` and dates feed the ranking. |
| `search` (listings) | `research_trends`, per theme | Etsy, Redbubble and Fourthwall listings (`include_domains`, `time_range: year`, `country` from the merchant's market) for saturation and competitor prices |
| `extract` | `research_trends` | One call with a `query` over the top 3 listings per theme: price, review count and best-seller badge, which feed saturation and the margin signal |
| `map` | `research_trends` | The merchant's own Fourthwall shop (`research.shopUrl` in settings, `/products/` pages), so a theme the shop already sells is marked and loses half its score |
| `research` | `research_trends` starts it, `get_niche_brief` polls it | A cited niche brief (model `mini`, `output_schema`: audience, price band, angles, risks, sources), so the MCP call never waits for it |
| `crawl` | `scan_competitor_site` | Up to 5 pages of a competitor's site for the ads flow's angles and offers |
| `search` (exact) | `screen_trademark` | The phrase plus "trademark" before publishing |

No model ranks ideas. Code scores each theme with fixed weights (`SCORE_WEIGHTS` in `apps/server/src/lib/score.ts`): demand (Qloo affinity, plus active Meta ads when the agent passes `adCounts`), momentum (news, discounted when Qloo's velocity doesn't confirm it), Tavily relevance, recency, openness (few listings and best sellers), margin (competitor prices against the merchant's own price floor) and IP safety (no Qloo brand, artist or title names). The host agent (ChatGPT, through the design playbook) phrases the ideas and why from that evidence.

A full run with Qloo costs about 35 to 50 credits: 6 searches, 2 for the extract, up to 4 for the map, and the niche brief, which Tavily prices at 4 to 110 credits (wovain reserves 25 and asks for a short report). `research.maxCredits` (default 50) caps it: the searches always run, then the brief, the extract and the map run in that order of priority while their worst case still fits. The brief's real cost is known only when it finishes, so `get_niche_brief` reports it. Without Qloo the seed is the one theme. A re-run with the same seed within 15 minutes only re-scores and costs nothing. Nothing about queries or results is logged, every URL is http or https, and every result says its text is untrusted.

The weekly market scout (`apps/ops/src/weekly.ts`) uses the same key from CI for 3 news searches about competing print-on-demand AI tools, and files one `status::intent` issue with what it found and the funnel's biggest drop-off.

Put a key in `apps/server/.env` as `TAVILY_API_KEY` to try them locally. `pnpm test:live` runs one real research capped at 10 credits (about 3) and is skipped without the key. In production the key is the `tavily-api-key` stack secret, listed in `apphosting.yaml`.

## Qloo

Taste × moment: Qloo says who loves the seed and what else they love; Tavily says why now. With `QLOO_API_KEY`, `research_trends` looks the seed up on Qloo (`/search`), takes the cross-domain taste tags its fans share (`/v2/insights`) and the seed's velocity (`/v2/trending`), then researches each of the top 3 tags on Tavily (above). Their affinity and the seed's velocity go into the score; the same seed again within 15 minutes (say, with `adCounts` from the agent's Ad Library search) is only re-scored. `suggest_audience` turns a picked idea's tags into age bands, gender and top places (`urn:demographics`, `urn:heatmap`) for the campaign.

wovain calls Qloo's REST API itself: the hackathon kit's `@qloo/qloo-harness` is a CLI and stdio MCP server that doesn't export its client. Hackathon keys work only on `https://hackathon.api.qloo.com`, with the `X-Api-Key` header. Put the key in `apps/server/.env` as `QLOO_API_KEY`; `pnpm test:live` then makes 5 real Qloo calls. In production, set the `qloo-api-key` stack secret and add `QLOO_API_KEY` to `apphosting.yaml` once it has a value.

## Develop

| Command | What it does |
| --- | --- |
| `pnpm dev` | Starts the Firestore and Storage emulators and serves `/mcp` on localhost:3000 (expose it with a tunnel to try it in an agent) |
| `pnpm build` | Builds the widgets; Node runs the server's TypeScript as is |
| `pnpm start` | Runs the server the way App Hosting does (`node apps/server/src/index.ts`) |
| `pnpm widgets:watch` | Rebuilds widgets on save; redraw a widget in chat to see the change |
| `pnpm storybook` | Every widget state, light and dark, at ChatGPT widths, without ChatGPT |
| `pnpm check` / `pnpm fix` | Lint and format (Ultracite: oxlint + oxfmt) |
| `pnpm typecheck` | TypeScript, strictest settings |
| `pnpm test` | Server unit tests (Vitest): pure logic, no services |
| `pnpm test:integration` | Store and MCP tool tests on the Firestore and Storage emulators (needs Java 21) |
| `pnpm test:e2e` | The whole journey as an agent drives it, on the emulators with recorded Fourthwall, fal, Meta, Tavily, Qloo and Nebius replies; writes a proof report with each step's redacted input and output, timing and widget screenshot to `e2e-report/index.html` (needs Java 21). `E2E_LIVE=1` swaps in real Tavily and Nebius calls when their keys are set |
| `pnpm demo` | After `pnpm test:e2e`: a narrated video of the run, `e2e-report/demo.mp4`, under 3 minutes (`/demo`) |
| `pnpm test:live` | Opt-in: one real Nemotron design check on Nebius, one real Tavily research (about 3 credits) and one Qloo taste and audience lookup; each is skipped without its key (`NEBIUS_API_KEY`, `TAVILY_API_KEY`, `QLOO_API_KEY`) |
| `pnpm test:stories` | Widget stories as tests (Playwright) |
| `pnpm knip` | Unused files, exports and dependencies |
| `pnpm arch` | Architecture rules (dependency-cruiser): layers, cycles, orphans |
| `pnpm dupes` | Copy-paste detection (jscpd); any clone fails |

Git hooks (Lefthook) run fix and typecheck on commit, commitlint on the message, and tests, knip, arch, dupes and story tests on push.

The code lives on [GitLab](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase), with [GitHub](https://github.com/sami-m-g/wovain) as a read-only mirror that CI keeps on `main`; nothing builds from it. GitLab CI/CD (`.gitlab-ci.yml`) runs, in order:

| Stage | What runs |
| --- | --- |
| verify | Build, lint, typecheck, knip, arch, dupes, tests, card stories (in parallel) |
| test | GitLab SAST, Secret Detection and Dependency Scanning |
| deploy | `main` only: `pulumi up` (`infra/`), then upload the source to App Hosting and roll it out |
| monitor | A smoke test of the live OAuth chain; hourly on the `wovain loop` schedule, the self-healing loop ([docs/loop.md](docs/loop.md)) |
| release | semantic-release, after the smoke test passes; then `main` and its tags are pushed to GitHub, even if an earlier job failed |

### How work moves

Each idea or bug is a GitLab issue (template `Intent`, `Agent task` or `Bug`) on the **Workflow** board:

1. `status::intent`: proposed (template `Intent`). You accept it by moving it to todo.
2. `status::todo`: accepted, ready to pick up. The agent turns it into `intent.md`, `spec.md` and `plan.md` in `docs/changes/<issue>-<slug>/`, moving the issue through `status::spec` and `status::plan`, and comments a summary with links. For a risky change (auth, infra, CI config, money-spending paths, stored record shapes, a `priority::1` feature) it waits at `status::plan` until you approve the plan in a comment.
3. `status::doing`: an agent took it. In Claude Code, `/issue <n>` works it in its own worktree on your Claude subscription; run two or three at once. Assigning or mentioning Duo's Developer flow works it on GitLab instead.
4. `status::review`: the MR is open. Duo's Code Review flow reviews it when requested as reviewer.
5. `status::test`: your turn. Try it, then comment what to change or merge. `verify.md` in the change folder says how it was proven.

Production errors skip the first two steps. The hourly **self-healing loop** ([docs/loop.md](docs/loop.md), `apps/ops`) reads Cloud Logging, Cloud Monitoring and GitLab Observability, files each new error as a `scout` issue built only from server-controlled fields (route template, allowlisted error class, status) and assigns the known ones to Duo's Developer flow, takes Duo's merge request through Duo Code Review to GitLab's auto-merge when it passes the guardrails, and after the deploy checks that the error rate dropped: it closes the issue with the numbers, or reopens it. Its daily comment on the `digest` issue says what it found, fixed and handed back. On Mondays the `wovain weekly` schedule adds the data analysis there, and starts the Duo scout flow through a child pipeline so it posts its own check: how many merchants reached each funnel step (connect, idea, set approved, ad approved, campaign created, autopilot run), requests, instance time, Duo credits and estimated fal, Tavily and Nebius costs. The server also counts each step as the OpenTelemetry metric `wovain.funnel.events` in GitLab Observability. The Duo triggers it relies on are in `infra/Pulumi.prod.yaml`.

### Agent skills

The project's own skills (`/issue`, `/capture`, `/demo`) are written once, in `.agents/skills/<name>/SKILL.md`. Each agent finds them there:

| Agent | How it reads them |
| --- | --- |
| GitLab Duo | Reads `.agents/skills/` directly: Duo Chat in VS Code or the Duo CLI, and every flow except Code Review ([docs](https://docs.gitlab.com/user/duo_agent_platform/customize/agent_skills/)). Chat in the GitLab UI doesn't load skills, and a custom flow needs the `workspace_agent_skills` input |
| Claude Code | Through `.claude/skills/<name>`, a committed symlink to the same folder |

The course skills and `ultracite` are copied into `.claude/skills/` by `pnpm install` and stay out of git, so only Claude Code sees them. Plugins from `.claude/settings.json` are Claude Code only too: a headless `claude` run in CI loads them only after `claude plugin install <plugin>@<marketplace> --scope project`.

## Architecture and data

- [docs/architecture.md](docs/architecture.md): C4-style context and container views, and how a change moves from an idea to production.
- [docs/data-model.md](docs/data-model.md): every Firestore collection and the media bucket, who writes and reads each, and how long it lives.
- [docs/loop.md](docs/loop.md): the self-healing loop. [docs/transcend.md](docs/transcend.md): how wovain answers the GitLab Transcend prizes.

## DevSecOps stages

Every stage runs on its own after a merge, with GitLab features, Duo flows or the project's own CI jobs. Built-in flows and deterministic CI code come first. The only custom agent, **wovain explain**, is read-only: it has no write tools.

| Stage | Automated by | Where |
| --- | --- | --- |
| Plan | Issues on the Workflow board (`status::intent` → `test`), intent templates, `/capture`, the weekly market scout's intents, and the hourly scout's issues (code, not a model: it files allowlisted, server-controlled fields as intents, never log text) | `infra/gitlab.ts`, `.gitlab/issue_templates/`, `.agents/skills/capture`, `apps/ops/src/scout.ts`, `apps/ops/src/weekly.ts` |
| Create | **Duo Developer** flow (assign or mention, and the loop's assignments), Claude Code `/issue`, project agent skills | `infra/Pulumi.prod.yaml`, `.agents/skills/` |
| Verify | CI verify stage (lint, types, knip, arch, dupes, unit, integration and story tests), **Duo Code Review** with project rules, **Duo Fix CI/CD** on a red `main` when the loop's fix gate passes (a new, confirmed code failure; at most 3 a day), and the read-only **wovain explain** chat agent for failures | `.gitlab/ci/verify.yml`, `.gitlab/duo/mr-review-*.yaml`, `.gitlab/duo/catalog/agents/explain.yml` |
| Package | App Hosting builds the container from the source CI uploads; semantic-release versions it | `.gitlab/ci/deploy.yml`, `apphosting.yaml`, `.config/releaserc.json` |
| Secure | GitLab SAST, Secret Detection and Dependency Scanning on every MR and `main`; Renovate; CODEOWNERS; Duo Code Review's secrets rule | `.gitlab-ci.yml`, `.gitlab/ci/secure.yml`, `.gitlab/renovate.json`, `.gitlab/CODEOWNERS`, `.gitlab/duo/mr-review-instructions.yaml` |
| Release | semantic-release (version, changelog, GitLab release) after the smoke test; **auto-merge** for the loop's own fixes | `.gitlab/ci/release.yml`, `apps/ops/src/shepherd.ts` |
| Configure | Pulumi applies Google Cloud, GitLab (variables, environments, schedules, labels, board, Duo triggers), the GitHub mirror and WorkOS on every `main` | `infra/`, `.gitlab/ci/deploy.yml` |
| Monitor | Smoke test; GitLab Observability (traces, the funnel metric, CI pipeline telemetry); the hourly scout and verify; the weekly data analysis; SCI on every `main` | `.gitlab/ci/monitor.yml`, `.gitlab/ci/loop.yml`, `apps/ops` |
| Govern | Auto-merge guardrails (allowlist, provenance, review of the head commit), CODEOWNERS, Duo review rules, Workload Identity Federation with one account per environment, a $5 budget alert | `apps/ops/src/guardrails.ts`, `infra/index.ts` |

Blocked for our role (see [docs/transcend.md](docs/transcend.md)): automatic Duo review, SAST false-positive detection and Resolve SAST flows, code owner approval, error tracking, a Duo schedule for the scout flow, and enabling flows in the top-level group. "Pipelines must succeed" and "All threads must be resolved" can be ticked in the UI but not set by API.

## Sustainability (SCI)

wovain emits about **8.73 gCO2e per run** (one idea-to-paused-campaign run, down from 14.27 with two 15-second clips), measured with the Green Software Foundation's SCI method: ((E × I) + M) per R, with us-central1's location-based grid intensity (432 gCO2e/kWh), measured server and CI time, estimated model energy, and video energy from the GPU seconds fal reports per clip (an estimate until merchants' clips are recorded). The `sci` job recomputes it on every `main` pipeline and publishes [the latest report](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/jobs/artifacts/main/raw/sci-report.md?job=sci). Method, sources and caveats: [docs/sustainability.md](docs/sustainability.md).

| Choice | Gain |
| --- | --- |
| One short clip, cropped to every ratio | One 5-second H3 Max Turbo clip per ad instead of two 15-second H3 Max Reference clips: about $0.18 instead of $1.53 at list price, and 5.5 instead of 11.1 gCO2e per run at the fallback estimate |
| Scale to zero on App Hosting | About 334 gCO2e a week avoided against one always-on instance (measured instance time; estimate coefficients), more than a whole run emits |
| Scanners off on scheduled pipelines | About 262 CI minutes and 29 gCO2e a week avoided (measured scanner durations) |
| Filtered Duo triggers | Flows only on a person's action or a red `main`; about 3 credits a flow run measured before the filters |
| Deterministic code before models | The loop, verification and market scout make no model calls; the design check decides print rules in code |
| Checks before credits | The shepherd hands an MR to a person before it spends a Duo review on it |

Estimates are labeled in the report. Video generation (fal) is most of the number and the least certain part.

## Infrastructure as code

`infra/` (Pulumi, `pnpm infra:preview` then `pnpm infra:up`, which CI runs on `main`) declares:

- **Google Cloud and Firebase**: APIs, Firestore and its rules (plus TTL on pending connect links and OAuth flows), the media bucket and its Storage rules, the `wovain/connections` KMS key that encrypts merchants' Fourthwall, fal and Meta grants, Secret Manager, App Hosting, service accounts and IAM, Workload Identity Federation for CI (no Google key is stored), and the budget (`infra/index.ts`).
- **GitLab** (`infra/gitlab.ts`, `infra/duo.ts`): every CI/CD variable, the `production` and `infrastructure` environments, the Renovate schedule, the issue labels and the Workflow board, the Duo flow triggers, the scout flow's trigger and the explain agent.
- **The GitHub mirror** (`infra/github.ts`): repository settings, the deploy key CI pushes with (a generated key pair, which also becomes `GITHUB_MIRROR_KEY`), and a ruleset that lets only that key change `main`.
- **WorkOS AuthKit** (`infra/workos.ts`): the redirect URIs in `wovain:workosRedirectUris` (`Pulumi.prod.yaml`). It uses the community `osodevops/workos` Terraform provider, which `pulumi install` generates into `infra/sdks/workos`. It signs in with the `workos-api-key` stack secret. Entries made by hand are adopted by their WorkOS id (`import`). The MCP resource indicators in `wovain:workosResourceIndicators` go through WorkOS's `authkit_oauth_resources` API with the generic `magodo/restful` Terraform provider (generated into `infra/sdks/restful`), since `osodevops/workos` has no resource for them. That API has no update, so a changed URI or `default` replaces the entry, and the default one is created first.

The tokens are stack secrets, encrypted with the KMS key (`pulumi config set --secret <name>` in `infra/`): `gitlab:token` (Pulumi's GitLab access, `api`), `github:token` (a fine-grained token for the mirror repository: Administration read/write), `gitlab-ci-token` (`GITLAB_TOKEN` for semantic-release and the AI Catalog sync) and `renovate-token` (`RENOVATE_TOKEN`). Each is a separate personal access token, since the Developer+ role can't create project access tokens.

Still set by hand, since no API or provider covers them (or the role can't reach them):

| Where | What |
| --- | --- |
| WorkOS dashboard | CIMD and dynamic client registration (Connect → Configuration), and sign-in methods. WorkOS documents no API for these, so no provider covers them. `smoke:production` fails if CIMD or registration is off |
| GitLab, Maintainer only | Enabling flows in the top-level group, a Duo schedule for a custom flow (its service account needs `create_service_account`), automatic Duo review and the SAST false-positive and Resolve SAST flows, code owner approval, protected branches, tags and environments, and error tracking |
| GitLab, UI only | "Pipelines must succeed" and "All threads must be resolved". Our role can tick them under Settings → Merge requests, but `PUT /projects/:id` (and Pulumi's `gitlab.Project`) needs `admin_project`, and GraphQL has no mutation for them |
| GitLab Observability (group) | The `o11y-api-key` the self-healing loop reads errors, traces and logs with. A group Owner opens the group, Observe → API Keys, and copies the key (the docs allow Developer and up, but Developer+ has no observability or access-token permission here); then `pulumi config set --secret o11y-api-key` in `infra/`. The docs describe no API or token scope for it and `@pulumi/gitlab` has no resource for it |
| Google Cloud, once | The Pulumi state bucket `wovain-pulumi-state` and the `pulumi/stack-secrets` KMS key, which this stack needs before it can run |
| Meta, Fourthwall, fal, Nebius, Qloo, Tavily | The accounts, Page, pixel, payment method and API keys (keys go in as stack secrets) |
| Meta app dashboard | wovain's Meta app: its use case, Facebook Login for Business redirect URI, roles, privacy and data-deletion URLs, Business Verification and App Review. Meta's Graph API can set a few app fields (such as `privacy_policy_url`) but not the redirect URIs, roles or review, so the app stays manual. See [Meta app](#meta-app) |

## Meta app

Merchants connect Meta through wovain's own Meta app, because Meta's Ads MCP (`https://mcp.facebook.com/ads`) refuses dynamic client registration. The app ID is the OAuth client ID.

1. At [developers.facebook.com/apps](https://developers.facebook.com/apps), create a Business-type app with the "Create & manage ads with ads MCP server" use case, in a business portfolio you control.
2. In Facebook Login for Business settings, add `https://app--wovain.us-central1.hosted.app/oauth/callback/meta` to the Valid OAuth Redirect URIs.
3. In App settings → Basic, set the Privacy Policy URL to `https://app--wovain.us-central1.hosted.app/privacy` and User data deletion to `https://app--wovain.us-central1.hosted.app/data-deletion`, plus an icon, category and contact email.
4. Put the app ID and secret into the stack: `pulumi config set --secret meta-app-id` and `pulumi config set --secret meta-app-secret` in `infra/`, then list `META_APP_ID` and `META_APP_SECRET` in `apphosting.yaml`.
5. Add testers under App roles. Until App Review grants Advanced Access, only people with a role on the app can connect.
6. For everyone else: Business Verification, then App Review for `ads_mcp_management`, `ads_management`, `ads_read`, `business_management`, `pages_show_list`, `pages_manage_ads` and `public_profile`, each with a screencast.

wovain asks Meta only for those scopes. `create_rules` uses the merchant's own token on Graph `adrules_library`, with `appsecret_proof`.

## Releases

Releases come from conventional commits. semantic-release (`.config/releaserc.json`) picks the version, writes `CHANGELOG.md`, sets the version in `package.json`, commits that as `chore(release): x [skip ci]`, tags it, and publishes a GitLab release. The tag `v0.1.0` on the first commit is its baseline. Renovate opens dependency update merge requests every Monday from a pipeline schedule (`.gitlab/renovate.json`: updates wait 7 days, minor and patch are grouped).

## Layout

| Path | What's there |
| --- | --- |
| `apps/server/` | The Hono server on Node: `/mcp` (tools, the step playbooks agents follow, Fourthwall and fal helpers, Meta rules client), the AuthKit token check, and the Firestore and Cloud Storage store (`src/store.ts`, `src/firebase.ts`); `firebase.json` and the deny-all `firestore.rules` and `storage.rules` |
| `apphosting.yaml` | How App Hosting builds and runs the server, and which secrets it reads |
| `apps/widgets/` | The React widgets (MCP Apps) and their Storybook stories |
| `apps/ops/` | The self-healing loop's CI job: scout, verify and the auto-merge shepherd ([docs/loop.md](docs/loop.md)) |
| `packages/shared/` | Schemas, economics and rule thresholds shared by server and widgets |
| `docs/` | Planning documents and the app map |
| `.agents/skills/` | Project skills for Claude Code and GitLab Duo (see [Agent skills](#agent-skills)) |

## License

[MIT](LICENSE)
