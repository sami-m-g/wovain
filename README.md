# wovain

An MCP server for print-on-demand sellers, hosted on Vercel, that any agent (ChatGPT, Claude, …) can connect to. In one chat it designs a product, publishes it to a Fourthwall shop, makes two short video ads for it, and builds one Meta Advantage+ sales campaign with five automated rules.

Built for Devpost's [Build With AI: Basics](https://learn-ai-basics.devpost.com/) with the Devpost Learn skill pack. The planning documents are in [`devpost/`](devpost/): [scope](devpost/scope.md), [PRD](devpost/prd.md), [spec](devpost/spec.md), [build checklist](devpost/checklist.md) and an [app map](devpost/app-map.html) of the code.

## What works

| Step | What you see in the chat | Status |
| --- | --- | --- |
| Settings | Settings widget: budget, rule multiples, video model and audio | Working |
| Design | "design a tee for: …" → design widget with mockups, price, profit and margin; Approve publishes it on Fourthwall | Working |
| Ads | Ad widget with two 9:16 UGC-style videos (fal), copy and the breakeven line; Add to campaign or Skip | Working |
| Campaign | Campaign widget: one Advantage+ sales campaign built as a Meta draft, the five rules created in Meta, Launch to publish | Working (Launch needs a payment method on the ad account) |
| Trend research, optimization check-in, mock mode | — | Planned, not built (see the checklist's Revisions) |

## Requirements

- An agent that speaks MCP over streamable HTTP with OAuth, such as ChatGPT (developer mode) or Claude
- [Bun](https://bun.sh) 1.4.2 or newer
- In the same agent, these MCP servers connected and signed in: **Fourthwall**, **Meta Ads** and **fal**
- A Fourthwall shop, a Meta ad account with a Facebook Page and a pixel, and fal credit (about $1.20 per 15-second clip at fal's actual billing)

## Setup

```bash
git clone https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase.git wovain
cd wovain
bun install
cp apps/web/.env.example apps/web/.env
```

Fill in `apps/web/.env` (empty values count as unset; on Vercel, set them in the project's settings):

| Key | Needed for | Where to get it |
| --- | --- | --- |
| `FAL_KEY` | Hosting finished videos, live video prices | fal dashboard → API keys |
| `FAL_BILLING_KEY` | Optional: what fal actually charged (`video_spend`) | fal API key with the Billing preset |
| `META_SYSTEM_USER_TOKEN` | Creating the five automated rules (the Meta Ads connector has no rules tool) | A system user token, or a long-lived user token from Graph API Explorer with `ads_management` |
| `BETTER_AUTH_SECRET` | Signs sessions and OAuth state for sign-in | `openssl rand -hex 32` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google sign-in, the page ChatGPT sends merchants to | Google Cloud OAuth web client; redirect URI `<site>/api/auth/callback/google` |
| `WOVAIN_ALLOWED_EMAILS` | Who may sign in (comma-separated verified emails; empty lets nobody in) | Your Google account email |
| `DATABASE_URL` | Required: records and sign-in data in Neon Postgres | Neon `dev` branch's pooled URL (production uses `main`) |
| `BLOB_READ_WRITE_TOKEN` | Required: staged artwork in the private Blob store | `vercel env pull` (the Blob integration sets it) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Optional: send traces to GitLab Observability (unset sends nothing) | GitLab group → Observe → Observability configuration |
| `OTEL_EXPORTER_OTLP_HEADERS` | Optional: the auth header for that endpoint, as `key=value` | Same page |

The other keys in `.env.example` aren't used yet.

## Connect an agent

Add `https://wovain.vercel.app/mcp` as a remote MCP server (streamable HTTP) in your agent, or `https://<tunnel>/mcp` for a local server. It carries no credentials: the first time you use wovain, the agent sends you to sign in with Google and approve access. Then try "show my wovain settings". Run `bun run db:migrate` once before the first local sign-in.

The server tells the agent the flow in its MCP `instructions`, and serves a playbook per step (`design`, `ads`, `campaign`) through the `get_playbook` tool and as MCP prompts.

## Develop

| Command | What it does |
| --- | --- |
| `bun run dev` | Next.js serves `/mcp` on localhost:3000 (expose it with a tunnel to try it in an agent) |
| `bun run build` | Builds the widgets, then the Next.js app |
| `bun run widgets:watch` | Rebuilds widgets on save; redraw a widget in chat to see the change |
| `bun run db:generate` | Writes a SQL migration in `packages/db/migrations` after a schema change |
| `bun run db:migrate` | Applies the migrations to the Neon branch in `DATABASE_URL` |
| `bun run storybook` | Every widget state, light and dark, at ChatGPT widths, without ChatGPT |
| `bun run check` / `bun run fix` | Lint and format (Ultracite: oxlint + oxfmt) |
| `bun run typecheck` | TypeScript, strictest settings |
| `bun test` | Server, web and shared tests (on PGlite, no database needed) |
| `bun run test:stories` | Widget stories as tests (Playwright) |
| `bun run knip` | Unused files, exports and dependencies |
| `bun run skills:restore` | Restores the course skills listed in `skills-lock.json` |

Git hooks (Lefthook) run fix and typecheck on commit, commitlint on the message, and tests, knip and story tests on push.

The code lives on [GitLab](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase), with [GitHub](https://github.com/sami-m-g/wovain) as a mirror. GitLab CI/CD (`.gitlab-ci.yml`) runs, in order:

| Stage | What runs |
| --- | --- |
| verify | Build, lint, typecheck, knip, tests, widget stories |
| test | GitLab SAST, Secret Detection and Dependency Scanning |
| deploy | Merge requests: a Vercel preview on its own Neon branch `mr-<iid>`, removed when the review environment stops. `main`: https://wovain.vercel.app |
| monitor | A smoke test of the live OAuth chain |
| release | semantic-release, after the smoke test passes |

It needs the CI variables `VERCEL_TOKEN`, `NEON_API_KEY`, `GITLAB_TOKEN`, `RENOVATE_TOKEN` (all masked), `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` and `NEON_PROJECT_ID`. Google sign-in only works on production, because Google needs exact redirect URIs.

## Releases

Releases come from conventional commits. semantic-release (`.releaserc.json`) picks the version, writes `CHANGELOG.md`, sets the version in `package.json`, commits that as `chore(release): x [skip ci]`, tags it, and publishes a GitLab release. The tag `v0.1.0` on the first commit is its baseline. Renovate opens dependency update merge requests every Monday from a pipeline schedule (`renovate.json`: updates wait 7 days, minor and patch are grouped).

## Layout

| Path | What's there |
| --- | --- |
| `apps/server/` | The MCP server library: tools, the step playbooks agents follow, Fourthwall and fal helpers, Meta rules client, store (Neon Postgres through Drizzle) |
| `apps/web/` | Next.js app on Vercel that serves the MCP server at `/mcp` |
| `apps/widgets/` | The React widgets (MCP Apps) and their Storybook stories |
| `packages/db/` | Drizzle schema (wovain's records and Better Auth's tables), client and migrations |
| `packages/shared/` | Schemas, economics and rule thresholds shared by server and widgets |
| `devpost/` | Planning documents and the app map |

## License

[MIT](LICENSE)
