---
doc: spec
status: approved
---

# wovain technical spec

A ChatGPT plugin that is mostly wiring: skills tell ChatGPT what to do, three existing MCP servers (Fourthwall, Meta Ads, fal) do the heavy lifting, and one small wovain server draws the cards and fills the gaps no MCP covers.

Implements `prd.md` (all of **Features and Behavior**). Scope source: `scope.md > The POC boundary`.

## How This Works, In Plain Language

wovain is a plugin you install in ChatGPT (Plus works). A plugin is a folder with a manifest, a few skills and a list of MCP servers.

| Piece | What it is | What it does in wovain |
|---|---|---|
| Skills | Instruction files ChatGPT reads | The playbook for each step: research, design, ads, campaign, optimization |
| Fourthwall MCP | Fourthwall's official server | Blanks, mockups, prices, publishing |
| Meta Ads MCP | Meta's official server | Campaign, ad set, video upload, ads, go live |
| fal MCP | fal's official server | Ad videos (MiniMax H3 Max Reference or Kling), background audio, upscaling, background removal |
| wovain server | Our small Next.js server, hosted on Vercel and reached over HTTPS | Draws the cards, does the margin math, trend lookups, video captions, Meta rules, settings |
| Cards | Small web pages ChatGPT shows inline | Trend, design, ad, campaign, optimization and settings cards |

Why a wovain server at all: ChatGPT can only show a card that an MCP server serves, a card's buttons can only call its own server, and three jobs have no MCP (Meta automated rules, trend APIs, caption burn-in). Everything else goes through the official servers.

How a click works: you press Approve on a card. The card posts a short message ("Approve design d2") into the chat. ChatGPT follows the skill and calls Fourthwall's tools, which you set to auto-approve. Then it calls wovain to redraw the card as live. One click, one extra model turn.

Where things are kept: Neon Postgres keeps settings and the state of each run, one set of rows per user, so a new chat picks up where you left off. Staged artwork waits in a private Vercel Blob store until it is uploaded to Fourthwall.

Where you use it: on chatgpt.com and in the ChatGPT desktop app, because the server is hosted instead of started on your Mac.

## The Core Journey Through the System

PRD ref: `prd.md > The Core Journey`.

```mermaid
flowchart LR
  U[Merchant in ChatGPT] --> S[wovain skills]
  S --> W[wovain server]
  S --> FW[Fourthwall MCP]
  S --> MA[Meta Ads MCP]
  S --> FAL[fal MCP]
  W --> SA[SerpApi, Etsy, Marker]
  W --> G[Meta Graph API: rules]
  W --> J[(Neon Postgres + Blob)]
  W --> C[Cards in chat]
```

| # | You do | What happens | You see |
|---|---|---|---|
| 1 | Ask for trending designs | `wovain-trends` skill: web search for candidates, `trends_evidence` (SerpApi, Etsy, Marker), Meta ad library search for ad counts | Trend card |
| 2 | Tick 2 or 3, click "Design the ones I picked" | The card posts the picks; skipped if you bring your own idea | Next step starts |
| 3 | Wait | `wovain-design` skill: ChatGPT generates the art; `stage_artwork` measures it; wovain uploads it to Fourthwall; fal removes the background and upscales from that public URL when needed; Fourthwall picks the blank and renders mockups; `price_product` sets the price | Design card per idea |
| 4 | Approve, Skip or give feedback | Approve posts "Approve design dN"; Fourthwall creates the product, sets prices, makes it public; `record_design` saves it | Design card shows Live with a link |
| 5 | Wait | `wovain-ads` skill: `video_plan` gives the fal request; fal renders two clips (MiniMax H3 Max Reference by default), then MMAudio; `finish_video` burns in captions (and the brand, when turned on); copy and margins are computed | Ad card per product |
| 6 | Add to campaign, Skip or give feedback | `record_ad` saves the choice; after the last card, the campaign step starts | Next ad card, or the campaign card |
| 7 | Wait | `wovain-campaign` skill: checks payment method and pixel; Meta MCP creates campaign, ad set, uploads, ads; `create_rules` adds the five rules; Meta MCP activates | Campaign card: Live, or Ready, blocked |
| 8 | Later: "How's my campaign?" | `wovain-optimize` skill: `campaign_check` reads rule history and results; Fourthwall reports and sales by UTM add evidence | Optimization card per fired rule |
| 9 | Apply the fix or Dismiss | The fix runs through the same tools (new video, new hook, price test) | Updated ad, campaign keeps running |

## Stack

| Layer | Choice | Version | Docs |
|---|---|---|---|
| Runtime and package manager | Bun | 1.4.3 | https://bun.sh/docs |
| MCP server | `@modelcontextprotocol/server` v2 over Streamable HTTP at `/mcp`, mounted in Next.js 16 on Vercel's Bun runtime | 2.3.1 | https://github.com/modelcontextprotocol/typescript-sdk |
| Card protocol | MCP Apps (`@modelcontextprotocol/ext-apps`) | 2.0.3 | https://github.com/modelcontextprotocol/ext-apps |
| Card UI | React 19 + `@openai/apps-sdk-ui` + Tailwind CSS 4 (its peer) | 19.3 / 0.2.2 / 4.x | https://developers.openai.com/plugins/build/chatgpt-ui |
| Card build | Vite 8 + `vite-plugin-singlefile`, one HTML file per card | 8.x | https://vite.dev |
| Schemas | zod 4 (required by `ext-apps`), shared by tools and cards | 4.2 | https://zod.dev |
| Lint and format | Ultracite with oxlint (type-aware via oxlint-tsgolint) and oxfmt (sorts imports and Tailwind classes) | 8.0.1 / 1.88 / 0.73 / tsgolint 7.0 | https://www.ultracite.ai |
| TypeScript | Official dual setup: `typescript` aliased to `@typescript/typescript6` (6.0 API for tools), `@typescript/native` aliased to `typescript@7` (`tsc` 7.0 for type checking) | 6.0.2 / 7.0.2 | https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/ |
| Git hooks | Lefthook | 2.2.2 | https://lefthook.dev |
| Tests | `bun test` for the server; Vitest 5 with `@vitest/coverage-v8` for cards; MSW 3 mocks shared by tests, mock mode and Storybook | 1.4 / 5.0 / 3.x | https://vitest.dev |
| Card states | Storybook 10 (`@storybook/react-vite` with the a11y, docs, themes and vitest addons, plus `msw-storybook-addon`) | 10.6 | https://storybook.js.org |
| Commits and dead code | commitlint (conventional commits) and knip | 21.x / 6.x | https://commitlint.js.org |
| Video post-processing | ffmpeg bundled with the server (`ffmpeg-static`), so it runs wherever the server runs | 7.x | https://ffmpeg.org |
| Database | Neon Postgres through Drizzle ORM (`drizzle-orm/bun-sql` on `Bun.SQL`), migrations by drizzle-kit; PGlite (Postgres in WASM, in-process) for tests | 0.45.4 / 0.31.11 / 0.5.8 | https://orm.drizzle.team |
| Infrastructure as code | `neon.ts` (`@neon/config`) for the Neon project's branches and services; a static `apps/web/vercel.json` for the Vercel project (`vercel.ts` was tried and dropped: Vercel installs dependencies on Bun 1.3 to compile it, which ignores our lockfile) | 1.8.7 | https://neon.com/docs |

- TypeScript everywhere: the learner chose it because OpenAI's examples and the ChatGPT UI kit are TypeScript.
- Bun: the learner chose it over Node with Express. The tradeoff is that official examples assume Node, so `bunfig.toml` sets `[run] bun = true` and even Storybook, Vitest and other tools with a node shebang run on Bun; no Node install is needed.
- Hosting: the learner moved wovain from a desktop-only stdio plugin to a hosted server, so it works on chatgpt.com and server or card changes ship on deploy. Next.js (`apps/web`) mounts the MCP handler from `apps/server` at `/mcp`; it was picked over a bare `Bun.serve()` because full OAuth needs real pages (sign-in, consent, Meta linking, privacy policy), and it matches the learner's other project. `apps/web` turns off `exactOptionalPropertyTypes`, which Better Auth's types don't satisfy; the other packages keep it. Sign-in is self-hosted Better Auth 1.7.7 (pinned) in `apps/web` with its `mcp`, `cimd` and `jwt` plugins, on its Drizzle adapter, so its tables sit in the same Neon database and the same migrations as wovain's. Neon Auth was ruled out: its package only proxies to Neon's hosted auth server and has no OAuth-provider or MCP plugin (checked in the `@neondatabase/auth` 0.6.0-beta code).
- Ultracite with oxlint and oxfmt: the learner's choice (`ultracite init --linter oxlint`).
- React 19: both `@openai/apps-sdk-ui` and `ext-apps` support it; OpenAI's docs still show 18.

## Where It Runs and How Someone Tries It

wovain is a hosted MCP server: a Next.js app (`apps/web`) on Vercel serves Streamable HTTP at `/mcp`, so it works in ChatGPT on the web and in the desktop app. The plugin (skills, plus `mcp.json` pointing at that URL) installs in the desktop app; on chatgpt.com you can add the server URL alone, which brings the tools and cards but not the skills, since ChatGPT never fetches skills from the server. Source: https://developers.openai.com/plugins/build/plugins. Hosting is built in steps: 1 hosted HTTP server (done), 2 Neon Postgres store and private Blob media (done), 3 OAuth 2.1 sign-in so anyone can install (done; the Google keys are still to add), 4 each user's own Meta account, 5 install from this repo as a plugin marketplace. ChatGPT finds the sign-in on its own: `/mcp` without a token answers 401 with `resource_metadata` pointing at `/.well-known/oauth-protected-resource/mcp`, which names `/api/auth` as the authorization server (metadata at `/.well-known/oauth-authorization-server/api/auth`: PKCE S256, CIMD, and dynamic registration at `/api/auth/oauth2/register`). The merchant signs in at `/sign-in` (Google for now), approves at `/consent`, and `/mcp` checks each token with `requireMcpAuth`. The site URL comes from Vercel (the production domain, or a preview's `VERCEL_URL`) or is localhost; `BETTER_AUTH_URL` overrides it. Google sign-in waits on a Google OAuth web client with redirect URIs `https://wovain-foss.vercel.app/api/auth/callback/google` and `http://localhost:3000/api/auth/callback/google`. Until each merchant links their own Meta account, everyone signed in acts through the operator's Meta and fal keys, so sign-in is limited to the verified emails in `WOVAIN_ALLOWED_EMAILS`. The list is checked when an account or session is created and on every `/mcp` call, so taking an email off it cuts off tokens already issued; an empty list lets nobody in. The consent page trusts an app's own name only when its redirect is exactly `https://chatgpt.com/connector_platform_oauth_redirect` (or the same path on `chat.openai.com`, with no port or user info); any other app is labeled unverified, with the host it returns to.

| Need | Value |
|---|---|
| Plan | ChatGPT Plus; chatgpt.com, or the desktop app for the plugin with its skills |
| Host | Vercel (Bun runtime); Bun 1.4 locally for development |
| Keys in `apps/web/.env` (project settings on Vercel) | `META_SYSTEM_USER_TOKEN`, `META_AD_ACCOUNT_ID`, `META_PAGE_ID`, `META_PIXEL_ID`, `SERPAPI_KEY`, `ETSY_API_KEY`, `MARKER_API_TOKEN`, `FAL_KEY` (fal storage uploads), `BETTER_AUTH_SECRET` (signs sessions and OAuth state), `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (Google sign-in), `WOVAIN_ALLOWED_EMAILS` (who may sign in), `DATABASE_URL` (Neon: the `dev` branch locally) and `BLOB_READ_WRITE_TOKEN` (the private Blob store); on Vercel the Neon and Blob integrations set the last two |
| Rehearsal | `WOVAIN_MOCK=1`: wovain's outside calls are answered by MSW, and the skills skip publish and launch steps |
| Sign-ins in ChatGPT | Fourthwall, Meta Ads and fal (OAuth, once), with auto-approve on for their tools |

Start it:

```bash
bun install
bun run skills:restore          # course skills from skills-lock.json
cp apps/web/.env.example apps/web/.env   # fill in keys (optional until a tool needs one)
bun run db:migrate              # applies packages/db/migrations to DATABASE_URL
bun run build                   # builds the cards, then the Next.js app
bun run dev                     # serves /mcp on localhost:3000
bun run plugin:install          # installs plugin/ pointed at the hosted /mcp (--url for a tunnel)
```

Connect it: `bun run plugin:install` copies `plugin/` to `~/.codex/plugins/wovain`, points its `mcp.json` at the hosted `/mcp` (or `--url`, such as a tunnel to `bun run dev`), and lists it in the personal marketplace `~/.agents/plugins/marketplace.json`. Restart the ChatGPT desktop app, open Plugins, then Personal, click + on wovain, and start a new chat. Fourthwall, Meta Ads and fal are added directly in the app: declared inside the plugin, they timed out at startup and held up every turn (verified in build step 1).

Demo recording: in ChatGPT (the desktop app or chatgpt.com), follow `scope.md > What "working" looks like` in one chat, then open Ads Manager and the Fourthwall shop. Submission needs the video and a public GitHub repo; the hosted server on Vercel is the deployment.

## Look and Feel

Carried from `prd.md > Look and Feel`.

- Cards use `@openai/apps-sdk-ui` components and ChatGPT's system fonts, text, background and divider colors. Light and dark follow the host theme.
- One token, `--wovain-accent: #3B4CCA`, used only on primary buttons, badges and icons.
- Status colors stay semantic: green Live, amber Ready-blocked, red Paused.
- Each card opens with one coach line, then the numbers. Money cards lead with breakeven cost per sale; return on ad spend comes second. At most 2 buttons; the ⚙ quick-settings menu is an icon, not a button. No tabs or inner scrolling.
- Images use fixed aspect ratios and alt text. Videos are muted with burned-in captions, tap to play, and the ⛶ control calls ChatGPT's full-screen view (`requestDisplayMode`), since the card can't go full screen itself.
- No shadcn: ChatGPT requires its own design system, and `@openai/apps-sdk-ui` is the official kit.

## Components

### Plugin package

What it does: tells ChatGPT what wovain is and where its server is. `plugin.json` holds name, version, description and display info, per the Agent Plugins 1.0.0 schema. `mcp.json` lists one Streamable HTTP server, wovain, at the hosted `/mcp` URL; the cards come from the server, not the package. Fourthwall (`https://mcp.fourthwall.com/app`), Meta Ads (`https://mcp.facebook.com/ads`) and fal (`https://mcp.fal.ai/mcp-relay`) are connected in the app instead. It holds no secret, so it is committed as is: ChatGPT signs in through wovain's OAuth instead of carrying a key.

PRD ref: `prd.md > Screens and Layout`.

### Skills

Five skills (ChatGPT's limit). Each one names the tools to call in order and the card to finish with.

| Skill | Steps | PRD ref |
|---|---|---|
| `wovain-trends` | Web search for candidates, `trends_evidence`, Meta ad library counts, `show_trend_card` | `prd.md > Trend research` |
| `wovain-design` | Generate art, `stage_artwork`, Fourthwall upload (`put_artwork`), fal background removal and upscale, blank and mockups, `price_product`, `show_design_card`; on approve, publish and `record_design` | `prd.md > Design cards`, `prd.md > Pricing and economics` |
| `wovain-ads` | `video_plan`, fal video ×2, fal MMAudio, `finish_video`, copy, `show_ad_card`, `record_ad` | `prd.md > Ad cards` |
| `wovain-campaign` | Payment and pixel checks, Meta campaign build with `utm_content` = ad ID on every ad link, `create_rules`, activate, `show_campaign_card` | `prd.md > Campaign launch`, `prd.md > Campaign rules` |
| `wovain-optimize` | `campaign_check`, Fourthwall reports and sales by UTM, `show_optimization_card`, apply the fix or turn an ad back on | `prd.md > Optimization` |

Each skill starts Fourthwall calls with `get-instructions`, `ecommerce_get-current-shop` and `load-skills`, as Fourthwall requires.

### wovain server

What it does: the MCP server as a library (`apps/server`), mounted by the Next.js route `apps/web/app/mcp/route.ts`: Streamable HTTP with a fresh server per request, and the card files as `ui://` resources. Finished media goes to fal storage, which gives each file a public `fal.media` URL. Each tool is one file with a zod input and output schema from `packages/shared`. Tools return user-safe errors and never pass raw upstream errors through.

| Tool | Does | Talks to |
|---|---|---|
| `trends_evidence` | Growth, seasonality, Etsy count and trademark screen per idea | SerpApi, Etsy API, Marker API |
| `stage_artwork` | Receives the artwork (image generation's `data:` URL, a public https URL, or an `openai/fileParams` file for attachments, since a hosted server can't read files on your Mac), checks pixels and transparency, keeps the bytes for upload | records, Blob media |
| `put_artwork` | PUTs the artwork bytes to Fourthwall's signed upload URL with the signed `Content-Type` and `x-goog-content-length-range` headers | Fourthwall upload URL |
| `price_product` | Applies the pricing rule and returns the breakeven math (priciest size or size-weighted) | Settings |
| `record_design` | Saves design status (publishing, live, rejected, skipped), product ID and link; `get_design` lets the card follow it while publishing | records |
| `video_plan` | Returns the fal endpoint and parameters from Settings (model, resolution, length, elements, audio) | Settings |
| `finish_video` | Downloads the clip, burns in the caption at 60% height inside Meta's 9:16 safe zone (and a logo or the shop name for the first seconds when the brand overlay is on) with ffmpeg-static, uploads the result to fal storage and returns the public URL for the ad card and Meta's upload by URL | ffmpeg, fal storage |
| `record_ad` | Saves ad choices and copy | records |
| `create_rules` | Creates the five rules per the PRD | Meta Graph API |
| `campaign_check` | Reads rule history and campaign results | Meta Graph API |
| `get_settings`, `update_settings` | Read and change any setting | records |
| `show_*_card` (6) | Return card data and attach the card | Cards |

PRD ref: `prd.md > Features and Behavior`.

### Cards

One React component per card, each built into a single HTML file. Buttons use `callTool` for wovain tools and `sendFollowUpMessage` for steps that need Fourthwall or Meta. Each card keeps its in-progress state (ticked ideas, typed feedback) with `setWidgetState`.

| Card | Buttons | Feedback | PRD ref |
|---|---|---|---|
| Trend | Design the ones I picked (enabled at 2 or 3) | Chat | `prd.md > Trend research` |
| Design | Approve, Skip | Field and chat; regenerates the card | `prd.md > Design cards` |
| Ad | Add to campaign, Skip | Field and chat; regenerates the card | `prd.md > Ad cards` |
| Campaign | Open in Ads Manager | Chat | `prd.md > Campaign launch` |
| Optimization | Apply the fix, Dismiss | Chat | `prd.md > Optimization` |
| Settings | Save | Fields | `prd.md > Screens and Layout` |

Approve and Add to campaign disable themselves while their action runs, so nothing is published or added twice (`prd.md > States and Boundaries`).

Each card state from `prd.md > States and Boundaries` has a Storybook story with a mocked `window.openai` bridge; accessibility and interaction tests run through Vitest.

### Settings

Every value in the PRD is a setting, edited in the Settings card or a card's ⚙ menu, saved in the merchant's records, and used by the next card without a redeploy.

| Group | Settings (defaults) |
|---|---|
| Trends | ideas 5, pick 2 to 3 |
| Pricing | min profit $10, min margin 30%, round up to a clean price |
| Economics | card fee 2.9% + $0.30, shipping $5, sales tax 7%, refund reserve 2%; breakeven basis: priciest size (default) or size-weighted mix |
| Campaign | $15 per product per day (at most $500; the scale cap at most 5× the start) |
| Rules | kill at 3× breakeven with no sales, checked every 30 min; kill above 1.5× breakeven with 5+ sales in 7 days; scale +20% under 0.8× breakeven with 10+ sales, every 48 h, cap 2× start; kill a design at 4× breakeven with no sales across its ads; alert above breakeven; ad links tagged utm_content = ad ID |
| Video | model MiniMax H3 Max Reference (or with the print kept: Kling O1 Standard Reference up to 10 s, Kling v3 Standard or Pro; test runs without: MiniMax H3 Max Turbo, H3 Max), 720p, 15 s, 2 clips per product, elements on |
| Audio | source MMAudio (or Kling native, or off), prompt "upbeat background music, no vocals" |
| Overlay | captions on at 60% height; brand overlay off (0 s), with an optional logo image or the shop name |
| Meta | AI disclosure on, Graph API v26.0 |

## Development Tooling

Claude Code setup for building wovain, added in the first build step. Nothing here ships in the plugin.

| Tool | Type | What it does |
|---|---|---|
| fal MCP (`https://mcp.fal.ai/mcp-relay`) in `.mcp.json` | MCP | Lets Claude try Kling prompts, elements and MMAudio during the build, not only inside ChatGPT |
| `/new-tool` | Project skill | Scaffolds one wovain tool: zod schema in `packages/shared`, tool file, card stub, fixture and test |
| `/demo-check` | Project skill, user-only | Preflight before recording: plugin loaded and `/mcp` reachable, cards build, shop live, Meta payment method and pixel, fal credit, Etsy and Marker keys, and a claude-ads Meta audit of the ad account |
| claude-ads plugin (installed) | Plugin | `ads-math` and `ads-budget` check the economics, `ads-test` checks the rules, and its optimization guidance seeds the `wovain-optimize` skill; claude-ads is MIT-licensed, and `wovain-optimize` credits it in a NOTICE file |
| `ultracite fix` after each edit | Hook (from `ultracite init --hooks claude`) | Lint and format every edit |
| `gitleaks git --staged` in Lefthook pre-commit | Hook | Blocks secrets and tokens before they reach GitHub |
| Lefthook | Git hooks | Ultracite fix, type check and gitleaks before commits; commitlint on commit messages; knip, tests and story tests before pushes |
| commitlint | Commit check | Enforces conventional commits locally and on pull requests |
| knip | Dead-code check | Finds unused files, exports and dependencies before pushes and in CI |
| Storybook | Card workshop | One story per card state with a mocked `window.openai`; a11y and interaction tests |
| MSW mock mode | Rehearsal | `bun run mock` answers wovain's outside calls from `packages/mocks`, so the demo can be rehearsed without spending |
| GitHub Actions CI | CI | Actions pinned to commit SHAs: commitlint, check, typecheck, knip, test and story tests |
| Dependabot | Updates | Weekly bun and Actions updates, grouped minor and patch, 7-day cooldown |
| release-please | Releases | Changelog and version bumps from conventional commits |
| `skills` CLI | Skills sync | `prepare` copies package-shipped skills (ultracite) into `.claude/skills` |
| VS Code settings | Editor | oxc formatter on save and fix-all; recommends `oxc.oxc-vscode` and `TypeScriptTeam.native-preview` |
| Claude Code plugins (project scope) | Plugins | modern-web-guidance (web best practices for the cards), security-guidance (warnings on edits and a background review on commit, push and stop), hookify (custom hook rules in `.local.md` files); also claude-ads, impeccable, ui-ux-pro-max, humanizer, context7 and commit-commands |

### Ultracite, TypeScript and Lefthook setup

Setup command (run once at the repo root):

```bash
bunx ultracite init --pm bun --linter oxlint --frameworks react vitest \
  --workspace-framework apps/cards=react --editors vscode --agents claude codex \
  --hooks claude --integrations lefthook --type-aware --js-plugins oxlint-plugin-react-doctor --install-skill
```

| Piece | What it does |
|---|---|
| `--type-aware` | Type-aware lint rules through tsgolint (needs TS 7) |
| `--hooks claude` | Claude Code PostToolUse hook runs `ultracite fix` after every edit; merged with the existing sync-plan and Impeccable hooks |
| `--agents claude codex` | Writes lint rules for agents; point them at AGENTS.md, not a new CLAUDE.md |
| `--install-skill` | Installs the `ultracite` Claude skill |
| `--js-plugins oxlint-plugin-react-doctor` | React health rules, as in the sister wovain repo |
| oxlint plugins | eslint, typescript, unicorn, oxc, import, promise, node, react (rules of hooks), react-perf, jsx-a11y, vitest |
| VS Code `TypeScriptTeam.native-preview` | Switches the editor's language server between TS 7 and 6 |

`lefthook.yml`:

```yaml
pre-commit:
  parallel: true
  jobs:
    - run: bunx ultracite fix {staged_files}
      glob: ["*.js","*.jsx","*.mjs","*.ts","*.tsx","*.mts","*.json","*.jsonc","*.css","*.md","*.yml"]
      exclude: ["devpost/**", ".claude/skills/**"]
      stage_fixed: true
    - name: typecheck
      run: bun run typecheck
    - name: gitleaks
      run: gitleaks git --staged --redact --no-banner
commit-msg:
  jobs:
    - name: commitlint
      run: bunx commitlint --edit {1}
pre-push:
  parallel: true
  jobs:
    - name: knip
      run: bun run knip
    - name: test
      run: bun run test
    - name: stories
      run: bun run test:stories
```

Scripts in the root `package.json`:

```json
"check": "ultracite check",
"fix": "ultracite fix",
"typecheck": "tsc -b --noEmit",
"typecheck:6": "tsc6 -b --noEmit",
"knip": "knip",
"test": "bun test",
"test:cards": "vitest run",
"test:coverage": "vitest run --coverage",
"storybook": "storybook dev -p 6006",
"test:stories": "vitest run --project storybook",
"dev": "bun run --filter @wovain-foss/web dev",
"mock": "WOVAIN_MOCK=1 bun run dev",
"prepare": "lefthook install && skills experimental_sync -y -a claude-code --copy && msw init apps/cards/.storybook/public"
```

## Data Model

One `records` table in Neon Postgres, keyed by user, kind and id, read and written by the server only; the user is the `sub` of the merchant's access token (their Better Auth user id). Each record is one JSON row, checked against its zod schema on every read, and a `counters` table hands out ids, so two saves at once never share one. The schema is Drizzle (`packages/db`): `records` keeps each record in a `jsonb` column, and Better Auth's tables come from `bunx auth@1.7.7 generate`. drizzle-kit writes SQL migrations to `packages/db/migrations` (`bun run db:generate`), and `bun run db:migrate` applies them to the Neon branch in `DATABASE_URL`. Local development uses the Neon `dev` branch, and tests run the same migrations on PGlite, so nothing needs a network in CI and there is no SQLite path. Staged artwork bytes go to the private Blob store `wovain-foss-media`; local development uses it too, so there is no offline fallback.

| Data | Lives in | Updated by | When you come back |
|---|---|---|---|
| Settings | `settings` | `update_settings` | Same values |
| Ideas | `runs[runId].ideas` | `show_trend_card` | Trend card can be redrawn |
| Designs | `designs` and `artworks` (art URL, customization ID, product ID, price, status; staged artwork size and file) | `stage_artwork`, `record_design` | Approved products stay live; pending ones can be redrawn |
| Ads | `runs[runId].ads` (video URLs, static URL, copy, status) | `record_ad` | Choices kept |
| Campaign | `runs[runId].campaign` (campaign, ad set, ad and rule IDs, status) | `create_rules`, campaign step | Optimization reads it |
| Media | Staged artwork in the private Blob store; public copies in Fourthwall's media library and on fal storage | `stage_artwork`, `finish_video` | Files stay until deleted |

Card state inside a chat (ticks, typed feedback) lives in the card's widget state; ChatGPT keeps it with the message.

## File Structure

```
wovain/
├── plugin/                      # what ChatGPT installs
│   ├── plugin.json              # manifest: name, version, display info
│   ├── mcp.json                 # wovain (Streamable HTTP, the hosted /mcp URL)
│   ├── skills/
│   │   ├── wovain-trends/SKILL.md
│   │   ├── wovain-design/SKILL.md
│   │   ├── wovain-ads/SKILL.md
│   │   ├── wovain-campaign/SKILL.md
│   │   └── wovain-optimize/SKILL.md
│   └── assets/logo.svg
├── apps/
│   ├── server/                  # MCP server library: tools, cards, store
│   │   ├── src/
│   │   │   ├── index.ts         # exports createMcpFetch, loadEnv, blobMedia
│   │   │   ├── http.ts          # Streamable HTTP handler for a verified caller
│   │   │   ├── env.ts           # zod-checked environment
│   │   │   ├── store.ts         # records through Drizzle, artwork on Blob
│   │   │   ├── tools/           # one file per tool
│   │   │   ├── cards.ts         # registers the ui:// card resources
│   │   │   └── lib/             # serpapi, etsy, marker, meta-graph, ffmpeg, economics, rules
│   │   ├── test/                # economics, rules, tool schemas, fixtures/
│   │   └── assets/fonts/        # DejaVu Sans Bold for captions
│   ├── web/                     # Next.js on Vercel (Bun runtime)
│   │   ├── app/mcp/route.ts     # mounts the MCP server at /mcp behind requireMcpAuth
│   │   ├── app/api/auth/[...all]/route.ts   # Better Auth: sign-in, OAuth endpoints
│   │   ├── app/.well-known/[...path]/route.ts   # OAuth metadata at the site root
│   │   ├── app/sign-in/, app/consent/   # the pages ChatGPT sends merchants to
│   │   ├── lib/                 # auth.ts, auth-client.ts, env.ts, server.ts
│   │   ├── test/auth.test.ts    # the OAuth discovery chain
│   │   ├── next.config.ts       # traces cards, font and ffmpeg into the function
│   │   ├── vercel.json          # Vercel project config: Bun 1.4 runtime, Next.js
│   │   └── .env.example         # server keys (apps/web/.env, gitignored)
│   └── cards/                   # React cards, Vite single-file builds
│       ├── src/
│       │   ├── trend/ design/ ad/ campaign/ optimization/ settings/   # each with *.stories.tsx
│       │   └── lib/             # bridge.ts (window.openai feature checks), QuickSettings.tsx
│       ├── .storybook/          # config, mocked window.openai bridge
│       ├── test/
│       └── vite.config.ts
├── packages/shared/             # zod schemas and types for tools and cards
├── packages/db/                 # Drizzle schema, client and migrations
│   ├── src/app-schema.ts        # records (jsonb) and counters
│   ├── src/auth-schema.ts       # Better Auth's tables (generated)
│   ├── src/schema.ts, client.ts # one schema object; Bun.SQL client for Neon
│   ├── src/testing.ts           # PGlite database with every migration applied
│   ├── src/migrate.ts           # bun run db:migrate
│   ├── migrations/              # SQL from drizzle-kit (bun run db:generate)
│   └── drizzle.config.ts
├── packages/mocks/              # MSW handlers: tests, mock mode, Storybook
├── .github/                     # workflows/ci.yml, workflows/release-please.yml, dependabot.yml
├── .vscode/                     # settings.json, extensions.json
├── .claude/skills/              # course skills (bun run skills:restore), plus new-tool/ and demo-check/
├── scripts/                     # plugin-install.ts
├── .mcp.json                    # dev MCPs: Fourthwall, Meta Ads, fal
├── oxlint.config.ts, oxfmt.config.ts   # from Ultracite
├── lefthook.yml                 # pre-commit, commit-msg, pre-push
├── commitlint.config.ts         # conventional commits
├── knip.json                    # dead-code check
├── bunfig.toml                  # [run] bun = true: tools run on Bun, not Node
├── neon.ts                      # Neon policy: Neon Auth off, dev kept, other branches expire in 7 days
├── package.json                 # bun workspaces and scripts
├── tsconfig.base.json           # strict, moduleResolution bundler, types ["bun"], no baseUrl (TS 7)
└── devpost/                     # planning docs
```

## External Services and Dependencies

| Service | Calls | Auth | Cost | Docs |
|---|---|---|---|---|
| Fourthwall MCP | `get-catalog-products`, `get-catalog-product-details`, `request-media-upload-link`, `save-media-library-image`, `generate-product-design-previews`, `get-customization-pricing`, `create-offers-from-designs`, `bulk-update-offer-variant-prices`, `update-offer-status`, `get-conversion-rates-report`, `get-visitors-report` | OAuth in ChatGPT | $0 | https://docs.fourthwall.com/ai/mcp.md |
| Meta Ads MCP | `ads_get_ad_accounts`, `ads_get_datasets`, `ads_library_search`, `ads_create_campaign` (OUTCOME_SALES, campaign budget), `ads_create_ad_set` (pixel, PURCHASE), `ads_creative_upload_media` (VIDEO by URL), `ads_create_creative`, `ads_create_ad`, `ads_activate_entity`, `ads_get_ad_entities` | OAuth in ChatGPT | Ad spend only | https://developers.facebook.com/docs/marketing-api |
| Meta Graph API | `POST /v26.0/act_{id}/adrules_library` (5 rules); `GET` rule history and insights | System user token, `ads_management` | $0 | https://developers.facebook.com/docs/marketing-api/ad-rules |
| fal MCP | `submit_jobs` / `wait_for_jobs` for `minimax/h3-max/reference-to-video` (references = mockup and artwork; Kling endpoints when chosen), `fal-ai/mmaudio-v2`, background removal, upscaler; fal storage uploads (`FAL_KEY`) | OAuth in ChatGPT; `FAL_KEY` on the server | Kling v3 Standard $0.14/s ($2.10 per 15 s), H3 Max Turbo $0.01625/s ($0.24), MMAudio $0.001/s (list prices, Oct 19, 2026; the server reads live prices with FAL_KEY) | https://fal.ai/docs/model-apis/mcp |
| SerpApi | `engine=google_trends` (timeseries, related queries) | API key | Free 250 searches a month | https://serpapi.com/google-trends-api |
| Etsy Open API v3 | `GET /v3/application/listings/active?keywords=` (`count`, prices, links) | `x-api-key` | Free; app approval takes days to weeks | https://developers.etsy.com/documentation |
| Marker API | Trademark word search, filtered to class 025 | Token | Free tier (unverified) | https://markerapi.com |

POC running cost on top of ad spend: about $4.60 for 6 H3 Max Reference videos with audio ($12.70 with Kling v3, $1.55 with H3 Max Turbo for test runs), plus a few cents for upscaling; trend data free.

## Important Failure Modes

- **Google sign-in isn't configured, or ChatGPT stalls at consent** → the sign-in page says so; add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` on Vercel, and check the redirect URIs on the Google client.
- **Preview deployments share the production database** → turn on Neon's branch per preview in the Vercel integration before testers use previews.
- **ChatGPT's image is too small or not transparent** → fal removes the background and upscales; if still under the print size, the card shows print quality red and Approve disabled (`prd.md > States and Boundaries` #4).
- **Fourthwall rejects the publish** → card keeps edits and shows the reason; after 2 failures it links to Fourthwall's designer (#6).
- **A video or its audio fails** → the ad card shows the failed slot with Retry, or image only (#7).
- **Meta blocks launch (no payment method or no purchase events)** → campaign card shows Ready, blocked with the fix (#8, #9).
- **Etsy key not approved yet** → the Etsy field shows a search link instead of a count, labeled.

## What Was Simplified and Why

- **Official MCPs for Fourthwall, Meta and video** instead of our own API clients: least code. The fuller version would proxy every call through the wovain server for true one-step clicks.
- **Card buttons post a chat message** for Fourthwall and Meta steps instead of calling them directly: ChatGPT only lets a card call its own server. Costs one model turn per click.
- **Optimization card on check-in** instead of a pushed alert: ChatGPT can't start a conversation. Meta's own rule notifications cover the gap. The fuller version would need a notification channel.
- **Print fidelity checked by eye** in the full-screen view instead of an automatic check: no provider offers one. The fuller version would compare video frames to the mockup with a vision model.
- **Trademark screening via Marker** instead of an official USPTO search API: none exists. Labeled screening, not legal advice.
- **One table of JSON records** instead of a table per entity: each record is checked by its zod schema on read, and Drizzle runs the same schema and migrations on Neon and, for tests, on PGlite.
- **Google-only sign-in** for now: email codes need a sending domain, then Resend from the Vercel Marketplace.

## Decisions and Open Issues

| Decision | Chosen by | Why | Tradeoff accepted |
|---|---|---|---|
| Plugin with child MCPs plus a thin wovain server | Learner | Reuse Fourthwall, Meta and fal; code only what's missing | One extra model turn per click |
| Auto-approve for Fourthwall, Meta and fal tools | Learner | One click per card | Fewer safety prompts; cards stay the approval point |
| Video: MiniMax H3 Max Reference on fal by default (mockup and artwork as references) | Learner | Kept the print on-model in the first real test at $0.75 a clip, cheaper than Kling v3 ($2.10) after fal's price change | Newer model with less track record; Kling one setting away |
| Audio: fal MMAudio, configurable | Learner | Meta's music skips video ads; 42× cheaper than Kling audio | Generic background music |
| Every value in Settings and per-card ⚙ | Learner | Tune without redeploys | A bigger settings schema |
| Trend data: free bundle | Learner | $0 a month | Etsy approval wait; Marker unverified |
| Bun, Vite, React 19, Ultracite with oxlint, TypeScript | Learner | Fast tooling and their preference | Official examples assume Node |
| Hosted Next.js server on Vercel (Bun runtime), Streamable HTTP | Learner | Works on chatgpt.com, ships on deploy, real pages for OAuth | A host and an OAuth server to run |
| Fidelity by eye | Learner | Smallest POC | Relies on attention |
| Superpowers plugin skipped | Learner | It would override the course skills | Revisit for `5-build` |
| Kill at 3× breakeven every 30 min; shop sales by UTM cross-check | Learner | Fewer false kills; the shop is the source of truth for sales | One ad can spend up to about $31 before it's paused |
| Design-level kill at 4×; breakeven on priciest size, size-weighted optional | Learner | Matches print-on-demand: the design is the test, sizes cost differently | Slightly stricter kills |
| TypeScript 6 + 7 dual setup, Ultracite with oxlint, oxfmt, Lefthook, Ultracite skill and hooks | Learner | Official setup; fast type checks and lint on every edit and commit | Two TypeScript versions to keep in step |
| DX set from the sister wovain repo: commitlint, knip, Lefthook with type check on commit, MSW with mock mode, Storybook, CI, Dependabot, release-please, plus modern-web-guidance, security-guidance and hookify; no shadcn | Learner | Same habits as their main project; rehearse without spending; check card states outside ChatGPT | About an hour more setup |
| JSON-record store on Neon, optimization on check-in, ffmpeg captions | Derived | Follow from the choices above | See What Was Simplified |

Learning moment: the learner asked "why even a server, not a plain plugin with child MCP servers?" It was clarified by three platform facts: cards must be served by our own MCP server, card buttons can only call that server, and Meta rules, trend APIs and caption burn-in have no MCP. The learner then picked the thinnest server. A second question, "what is elements, and can't we support it ourselves?", was clarified: it is reference-image conditioning inside the model, so only a provider that exposes it can offer it; our side can only add checks.

Verify early in the build, in this order:

| # | Check | If it fails |
|---|---|---|
| 1 | Desktop-only plugin installs from the local folder on Plus; the app starts the stdio server; a card renders; a card button's message triggers a Fourthwall tool with auto-approve | HTTP mode + ngrok on chatgpt.com |
| 2 | `openai/fileParams` delivers a ChatGPT image with a fetchable URL in the desktop app (build step 2: it doesn't; image generation returns a `data:` URL, which `stage_artwork` accepts) | Ask the merchant to upload the image |
| 3 | A fal video model keeps the print readable on-model; MMAudio adds audio (build step 3: MiniMax H3 Max Reference passed with the mockup and artwork as references) | Switch models in Settings |
| 4 | Meta accepts a fal.media video URL; one NOTIFICATION rule created with the system user token; rule filters match per-product ads by name | Upload from file; adjust filters |
| 5 | Meta MCP campaign gets `ADVANTAGE_PLUS_SALES` state | Set fields through the Graph API |
| 6 | Marker API is alive; Etsy app approved | Show labeled search links |
| 7 | Bun resolves the TS 6/7 npm aliases; `bunx tsc` runs 7.0 | Pin TS 6 only and skip type-aware lint |
| 8 | Ultracite's Claude hook merges cleanly with sync-plan and Impeccable hooks in `.claude/settings.json` | Merge the hooks by hand |
| 9 | Storybook renders the cards with the mocked `window.openai` bridge | Use a plain Vite gallery page |
| 10 | ChatGPT completes the OAuth flow (discovery, registration, Google sign-in, consent) against the hosted `/mcp`; a card renders on chatgpt.com | Check the 401 challenge and metadata URLs, then the Google redirect URIs |

Carried from `prd.md > Open Questions` (still open, before the demo): Meta payment method, shop set live, Meta pixel and Conversions API connected in Fourthwall. Voice: tools work in Live voice since 2026-09-23; whether cards render in voice is unverified, so voice stays a bonus.

Not decided by the learner and flagged for review: the `self_ai_disclosure` value on Meta creatives (default on) and the Meta API version pin (v26.0, given Meta's removals on 2026-10-27).
