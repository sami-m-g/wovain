# wovain

A ChatGPT plugin for print-on-demand sellers, with its MCP server hosted on Vercel. In one chat it designs a product, publishes it to a Fourthwall shop, makes two short video ads for it, and builds one Meta Advantage+ sales campaign with five automated rules.

Built for Devpost's [Build With AI: Basics](https://learn-ai-basics.devpost.com/) with the Devpost Learn skill pack. The planning documents are in [`devpost/`](devpost/): [scope](devpost/scope.md), [PRD](devpost/prd.md), [spec](devpost/spec.md), [build checklist](devpost/checklist.md) and an [app map](devpost/app-map.html) of the code.

## What works

| Step | What you see in ChatGPT | Status |
| --- | --- | --- |
| Settings | Settings card: budget, rule multiples, video model, overlays | Working |
| Design | "@wovain design a tee for: …" → design card with mockups, price, profit and margin; Approve publishes it on Fourthwall | Working |
| Ads | Ad card with two 9:16 UGC-style videos (fal), captions, copy and the breakeven line; Add to campaign or Skip | Working |
| Campaign | Campaign card: one Advantage+ sales campaign built as a Meta draft, the five rules created in Meta, Launch to publish | Working (Launch needs a payment method on the ad account) |
| Trend research, optimization check-in, mock mode | — | Planned, not built (see the checklist's Revisions) |

## Requirements

- ChatGPT on the web or the [desktop app](https://openai.com/chatgpt/desktop/); the plugin with its skills installs in the desktop app
- [Bun](https://bun.sh) 1.4.2 or newer
- In the ChatGPT app, these connectors signed in: **Fourthwall**, **Meta Ads** and **fal**
- A Fourthwall shop, a Meta ad account with a Facebook Page and a pixel, and fal credit (about $1.20 per 15-second clip at fal's actual billing)

## Setup

```bash
git clone https://github.com/sami-m-g/wovain-foss.git
cd wovain-foss
bun install
cp apps/web/.env.example apps/web/.env
```

Fill in `apps/web/.env` (empty values count as unset; on Vercel, set them in the project's settings):

| Key | Needed for | Where to get it |
| --- | --- | --- |
| `FAL_KEY` | Hosting finished videos, live video prices | fal dashboard → API keys |
| `FAL_BILLING_KEY` | Optional: what fal actually charged (`video_spend`) | fal API key with the Billing preset |
| `META_SYSTEM_USER_TOKEN` | Creating the five automated rules (the Meta Ads connector has no rules tool) | A system user token, or a long-lived user token from Graph API Explorer with `ads_management` |
| `WOVAIN_HTTP_TOKEN` | Guards `/mcp` until OAuth; without it every request gets a 401 | `openssl rand -hex 32` |

The other keys in `.env.example` aren't used yet.

## Install in ChatGPT

```bash
bun run plugin:install
```

This copies `plugin/` into your personal plugin marketplace, pointed at the hosted `/mcp` (pass `--url https://<tunnel>/mcp` for a local server), and adds your `WOVAIN_HTTP_TOKEN` to the installed copy. Quit and reopen the ChatGPT app, then try "@wovain show my settings".

## Develop

| Command | What it does |
| --- | --- |
| `bun run dev` | Next.js serves `/mcp` on localhost:3000 (expose it with a tunnel to try it in ChatGPT) |
| `bun run build` | Builds the cards, then the Next.js app |
| `bun run cards:watch` | Rebuilds cards on save; redraw a card in chat to see the change |
| `bun run storybook` | Every card state, light and dark, at ChatGPT widths, without ChatGPT |
| `bun run check` / `bun run fix` | Lint and format (Ultracite: oxlint + oxfmt) |
| `bun run typecheck` | TypeScript, strictest settings |
| `bun test` | Server and shared tests |
| `bun run test:stories` | Card stories as tests (Playwright) |
| `bun run knip` | Unused files, exports and dependencies |
| `bun run skills:restore` | Restores the course skills listed in `skills-lock.json` |

Git hooks (Lefthook) run fix, typecheck and gitleaks on commit, commitlint on the message, and tests, knip and story tests on push.

## Layout

| Path | What's there |
| --- | --- |
| `plugin/` | The plugin manifest, `mcp.json` and the skills ChatGPT follows (`wovain-design`, `wovain-ads`, `wovain-campaign`) |
| `apps/server/` | The MCP server library: tools, Fourthwall and fal helpers, ffmpeg overlays, Meta rules client, store (Neon Postgres, or SQLite locally) |
| `apps/web/` | Next.js app on Vercel that serves the MCP server at `/mcp` |
| `apps/cards/` | The React cards (MCP Apps) and their Storybook stories |
| `packages/shared/` | Schemas, economics and rule thresholds shared by server and cards |
| `devpost/` | Planning documents and the app map |

## License

[MIT](LICENSE)
