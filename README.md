# wovain

An MCP server for print-on-demand sellers, hosted on Firebase App Hosting, that any agent (ChatGPT, Claude, …) can connect to. In one chat it designs a product, publishes it to a Fourthwall shop, makes two short video ads for it, and builds one Meta Advantage+ sales campaign with five automated rules.

Built for Devpost's [Build With AI: Basics](https://learn-ai-basics.devpost.com/) with the Devpost Learn skill pack. The planning documents are in [`docs/`](docs/): [scope](docs/scope.md), [PRD](docs/prd.md), [spec](docs/spec.md), [build checklist](docs/checklist.md) and an [app map](docs/app-map.html) of the code.

## What works

| Step | What you see in the chat | Status |
| --- | --- | --- |
| Settings | Settings widget: budget, rule multiples, video model and audio | Working |
| Design | "design a tee for: …" → design widget with mockups, price, profit and margin; Approve publishes it on Fourthwall | Working |
| Ads | Ad widget with two 9:16 UGC-style videos (fal), copy and the breakeven line; Add to campaign or Skip | Working |
| Campaign | Campaign widget: one Advantage+ sales campaign built as a Meta draft, the five rules created in Meta, Launch to publish | Working (Launch needs a payment method on the ad account) |
| Optimization check-in, mock mode | — | Planned, not built (see the checklist's Revisions) |

## Requirements

- An agent that speaks MCP over streamable HTTP with OAuth, such as ChatGPT (developer mode) or Claude
- [Node.js](https://nodejs.org) 24 and [pnpm](https://pnpm.io) 12.3.4 (`corepack enable` picks it up from `packageManager`)
- Java 21, for the Firestore and Storage emulators that `pnpm dev` and `pnpm test:integration` run on
- In the same agent, these MCP servers connected and signed in: **Fourthwall**, **Meta Ads** and **fal**
- A Fourthwall shop, a Meta ad account with a Facebook Page and a pixel, and fal credit (about $1.20 per 15-second clip at fal's actual billing)

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
| `FAL_BILLING_KEY` | Optional: what fal actually charged (`video_spend`) | fal API key with the Billing preset |
| `META_SYSTEM_USER_TOKEN` | Creating the five automated rules (the Meta Ads connector has no rules tool) | A system user token, or a long-lived user token from Graph API Explorer with `ads_management` |
| `WORKOS_AUTHKIT_DOMAIN` | Sign-in: the AuthKit domain that issues `/mcp`'s tokens | WorkOS dashboard (e.g. `https://<name>.authkit.app`) |
| `WORKOS_API_KEY` | Reads each caller's email for the allowlist | WorkOS dashboard → API keys |
| `WOVAIN_ALLOWED_EMAILS` | Who may use `/mcp` (comma-separated verified emails; empty lets nobody in) | The email you sign in to AuthKit with |
| `WOVAIN_SITE_URL` | Optional: overrides the site URL, e.g. a tunnel to your local server | Your tunnel's URL |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Optional: send traces to GitLab Observability (unset sends nothing) | GitLab group → Observe → Observability configuration |
| `OTEL_EXPORTER_OTLP_HEADERS` | Optional: the auth header for that endpoint, as `key=value` | Same page |

The other keys in `.env.example` aren't used yet. Storage needs no keys: locally `pnpm dev` starts the Firestore and Storage emulators, and on App Hosting the server finds its Firebase project and bucket on its own.

## Connect an agent

Add `<App Hosting URL>/mcp` (`https://app--wovain.us-central1.hosted.app/mcp`) as a remote MCP server (streamable HTTP) in your agent, or `https://<tunnel>/mcp` for a local server. It carries no credentials: the first time you use wovain, the agent sends you to sign in with Google and approve access. Then try "show my wovain settings".

The server tells the agent the flow in its MCP `instructions`, and serves a playbook per step (`design`, `ads`, `campaign`) through the `get_playbook` tool and as MCP prompts.

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
| `pnpm test:stories` | Widget stories as tests (Playwright) |
| `pnpm knip` | Unused files, exports and dependencies |

Git hooks (Lefthook) run fix and typecheck on commit, commitlint on the message, and tests, knip and story tests on push.

The code lives on [GitLab](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase), with [GitHub](https://github.com/sami-m-g/wovain) as a mirror that CI keeps on `main`; App Hosting builds from the mirror. GitLab CI/CD (`.gitlab-ci.yml`) runs, in order:

| Stage | What runs |
| --- | --- |
| verify | Build, lint, typecheck, knip, tests, card stories (in parallel) |
| test | GitLab SAST, Secret Detection and Dependency Scanning |
| deploy | `main` only: push to GitHub, then an App Hosting rollout of that commit |
| monitor | A smoke test of the live OAuth chain |
| release | semantic-release, after the smoke test passes, then push the release commit and tags to GitHub |

It needs the CI variables `GITLAB_TOKEN`, `RENOVATE_TOKEN`, `GITHUB_MIRROR_KEY` (all masked; a GitHub deploy key), `FIREBASE_PROJECT_ID`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_INFRA_SERVICE_ACCOUNT`, `GCP_DEPLOY_SERVICE_ACCOUNT` (Workload Identity Federation, so no Google key is stored) and `SITE_URL` (the App Hosting URL); `pulumi stack output` in `infra/` prints their values. `GITLAB_TOKEN` also lets `infra:production` manage the Duo flow triggers and `catalog-sync` sync the custom flows.

## Releases

Releases come from conventional commits. semantic-release (`.config/releaserc.json`) picks the version, writes `CHANGELOG.md`, sets the version in `package.json`, commits that as `chore(release): x [skip ci]`, tags it, and publishes a GitLab release. The tag `v0.1.0` on the first commit is its baseline. Renovate opens dependency update merge requests every Monday from a pipeline schedule (`.gitlab/renovate.json`: updates wait 7 days, minor and patch are grouped).

## Layout

| Path | What's there |
| --- | --- |
| `apps/server/` | The Hono server on Node: `/mcp` (tools, the step playbooks agents follow, Fourthwall and fal helpers, Meta rules client), the AuthKit token check, and the Firestore and Cloud Storage store (`src/store.ts`, `src/firebase.ts`); `firebase.json` and the deny-all `firestore.rules` and `storage.rules` |
| `apphosting.yaml` | How App Hosting builds and runs the server, and which secrets it reads |
| `apps/widgets/` | The React widgets (MCP Apps) and their Storybook stories |
| `packages/shared/` | Schemas, economics and rule thresholds shared by server and widgets |
| `docs/` | Planning documents and the app map |

## License

[MIT](LICENSE)
