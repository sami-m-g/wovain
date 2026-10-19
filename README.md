# wovain

A ChatGPT desktop plugin for print-on-demand sellers. In one chat it designs a product, publishes it to a Fourthwall shop, makes two short video ads for it, and builds one Meta Advantage+ sales campaign with five automated rules.

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

- macOS with the [ChatGPT desktop app](https://openai.com/chatgpt/desktop/) (the plugin runs a local stdio server)
- [Bun](https://bun.sh) 1.4.2 or newer
- In the ChatGPT app, these connectors signed in: **Fourthwall**, **Meta Ads** and **fal**
- A Fourthwall shop, a Meta ad account with a Facebook Page and a pixel, and fal credit (about $1.20 per 15-second clip at fal's actual billing)

## Setup

```bash
git clone https://github.com/sami-m-g/wovain-foss.git
cd wovain-foss
bun install
cp .env.example .env
```

Fill in `.env` (empty values count as unset):

| Key | Needed for | Where to get it |
| --- | --- | --- |
| `FAL_KEY` | Hosting finished videos, live video prices | fal dashboard → API keys |
| `FAL_BILLING_KEY` | Optional: what fal actually charged (`video_spend`) | fal API key with the Billing preset |
| `META_SYSTEM_USER_TOKEN` | Creating the five automated rules (the Meta Ads connector has no rules tool) | A system user token, or a long-lived user token from Graph API Explorer with `ads_management` |

The other keys in `.env.example` aren't used yet.

## Install in ChatGPT

```bash
bun run plugin:install
```

This builds the cards and a compiled server into `plugin/`, adds wovain to your personal plugin marketplace, and points it at your `.env`. Quit and reopen the ChatGPT app, then try "@wovain show my settings".

## Develop

| Command | What it does |
| --- | --- |
| `bun run plugin:dev` | Installs a launcher that runs the server from this repo. Server edits need an app restart; skill edits need `plugin:dev` again and a new chat |
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
| `apps/server/` | The MCP server: tools, Fourthwall and fal helpers, ffmpeg overlays, Meta rules client, JSON store |
| `apps/cards/` | The React cards (MCP Apps) and their Storybook stories |
| `packages/shared/` | Schemas, economics and rule thresholds shared by server and cards |
| `devpost/` | Planning documents and the app map |

## License

[MIT](LICENSE)
