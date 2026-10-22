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
| `META_SYSTEM_USER_TOKEN` | Creating the five automated rules (the Meta Ads connector has no rules tool) | A system user token, or a long-lived user token from Graph API Explorer with `ads_management` |
| `NEBIUS_API_KEY` | Optional: the design check (`judge_design`, Nemotron on Nebius Token Factory); without it the check is skipped | Nebius Token Factory → API keys |
| `QLOO_API_KEY` | Optional: Qloo's Taste API | Qloo developer portal |
| `TAVILY_API_KEY` | Optional: trend research and the trademark screen (`research_trends`, `screen_trademark`); without it both say they aren't set up | Tavily dashboard → API keys |
| `WORKOS_AUTHKIT_DOMAIN` | Sign-in: the AuthKit domain that issues `/mcp`'s tokens | WorkOS dashboard (e.g. `https://<name>.authkit.app`) |
| `WORKOS_API_KEY` | Reads each caller's email for the allowlist | WorkOS dashboard → API keys |
| `WOVAIN_ALLOWED_EMAILS` | Who may use `/mcp` (comma-separated verified emails; empty lets nobody in) | The email you sign in to AuthKit with |
| `WOVAIN_SITE_URL` | Optional: overrides the site URL, e.g. a tunnel to your local server | Your tunnel's URL |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Optional: send traces to GitLab Observability (unset sends nothing) | GitLab group → Observe → Observability configuration |
| `OTEL_EXPORTER_OTLP_HEADERS` | Optional: the auth header for that endpoint, as `key=value` | Same page |

Storage needs no keys: locally `pnpm dev` starts the Firestore and Storage emulators, and on App Hosting the server finds its Firebase project and bucket on its own.

## Connect an agent

Add `<App Hosting URL>/mcp` (`https://app--wovain.us-central1.hosted.app/mcp`) as a remote MCP server (streamable HTTP) in your agent, or `https://<tunnel>/mcp` for a local server. It carries no credentials: the first time you use wovain, the agent sends you to sign in with Google and approve access. Then try "show my wovain settings".

The server tells the agent the flow in its MCP `instructions`, and serves a playbook per step (`design`, `ads`, `campaign`) through the `get_playbook` tool and as MCP prompts.

## Nebius and Nemotron

wovain makes its own model calls through [Genkit](https://genkit.dev), with the OpenAI-compatible plugin (`@genkit-ai/compat-oai`) pointed at Nebius Token Factory (`https://api.tokenfactory.nebius.com/v1/`). The model is NVIDIA Nemotron 3 Super (`nvidia/nemotron-3-super-120b-a12b`), set once in `apps/server/src/lib/ai.ts`.

| Call | When | What it does |
| --- | --- | --- |
| `judge_design` | The design playbook calls it before every design widget | Scores the design brief (idea, blank, placement, colors, artwork size and transparency, listing, coach line) against wovain's print and listing rules. Returns a verdict, one check per rule, up to 5 fixes and a coach line, checked by a zod schema. Code decides print size, transparency, title length and color count itself, and those results override the model. |
| `research_trends` | When the merchant has no idea yet, after the Tavily searches | Turns this week's news into 3 to 5 tee ideas. It cites results by number, and code turns the numbers into Tavily's links, so every link is real. Without the key, the ideas are Tavily's most relevant results, one link each. |

To run it:

1. Put a Token Factory key in `apps/server/.env` as `NEBIUS_API_KEY` and run `pnpm dev`. Without the key, `judge_design` answers `configured: false` and the agent skips the check.
2. `pnpm test:live` makes one real call with the demo brief and checks the reply against the schema (a fraction of a cent). It's skipped without the key. `pnpm test` and `pnpm test:integration` use Genkit's mock model and never call Nebius.
3. In production, set the secret (`pulumi config set --secret nebius-api-key` in `infra/`) and list `NEBIUS_API_KEY` in `apphosting.yaml`.

## Tavily

`research_trends` searches Tavily twice (news from the past week) for a niche, audience or seed idea and returns 3 to 5 ranked tee ideas, each with its source links. `screen_trademark` searches once for a phrase plus "trademark" before publishing. Both use the official `@tavily/core` SDK at basic depth: 1 credit per search, so $0.016 per research and $0.008 per screen at pay-as-you-go prices, with 1,000 free credits a month. Neither logs the query or the results.

Put a key in `apps/server/.env` as `TAVILY_API_KEY` to try them locally. `pnpm test:live` runs one real research (2 credits) and is skipped without the key. In production the key is the `tavily-api-key` stack secret, listed in `apphosting.yaml`.

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
| `pnpm test:live` | Opt-in: one real Nemotron call on Nebius and one real Tavily research; each is skipped without its key (`NEBIUS_API_KEY`, `TAVILY_API_KEY`) |
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
| monitor | A smoke test of the live OAuth chain |
| release | semantic-release, after the smoke test passes; then `main` and its tags are pushed to GitHub, even if an earlier job failed |

### How work moves

Each idea or bug is a GitLab issue (template `Intent`, `Agent task` or `Bug`) on the **Workflow** board:

1. `status::intent`: proposed (template `Intent`). You accept it by moving it to todo.
2. `status::todo`: accepted, ready to pick up. The agent turns it into `intent.md`, `spec.md` and `plan.md` in `docs/changes/<issue>-<slug>/`, moving the issue through `status::spec` and `status::plan`, and comments a summary with links. For a risky change (auth, infra, CI config, money-spending paths, stored record shapes, a `priority::1` feature) it waits at `status::plan` until you approve the plan in a comment.
3. `status::doing`: an agent took it. In Claude Code, `/issue <n>` works it in its own worktree on your Claude subscription; run two or three at once. Assigning or mentioning Duo's Developer flow works it on GitLab instead.
4. `status::review`: the MR is open. Duo's Code Review flow reviews it when requested as reviewer.
5. `status::test`: your turn. Try it, then comment what to change or merge. `verify.md` in the change folder says how it was proven.

The scout flow's daily comment on the `digest` issue lists what shipped and what waits for you. Duo triggers and the scout schedule are paused while Duo credits are paused (`infra/Pulumi.prod.yaml`).

### Agent skills

The project's own skills (`/issue`, `/capture`) are written once, in `.agents/skills/<name>/SKILL.md`. Each agent finds them there:

| Agent | How it reads them |
| --- | --- |
| GitLab Duo | Reads `.agents/skills/` directly: Duo Chat in VS Code or the Duo CLI, and every flow except Code Review ([docs](https://docs.gitlab.com/user/duo_agent_platform/customize/agent_skills/)). Chat in the GitLab UI doesn't load skills, and a custom flow needs the `workspace_agent_skills` input |
| Claude Code | Through `.claude/skills/<name>`, a committed symlink to the same folder |

`.agents/skills/` also holds ten [claude-ads](https://github.com/AgriciDaniel/claude-ads) skills (`ads` and `ads-*`, MIT, credited in `NOTICE`) for the optimizer. They're vendored unchanged with `pnpm skills add AgriciDaniel/claude-ads --skill <names> -a universal -y --copy` and pinned by hash in `skills-lock.json`; `pnpm check` runs `pnpm skills:check`, which fails if any vendored file changes. Update them only by running `skills add` again. wovain's print-on-demand rules live in its own overlay, `.agents/skills/wovain-pod-ads/`, which says to read the matching claude-ads skill first.

The course skills and `ultracite` are copied into `.claude/skills/` by `pnpm install` and stay out of git, so only Claude Code sees them. Plugins from `.claude/settings.json` are Claude Code only too: a headless `claude` run in CI loads them only after `claude plugin install <plugin>@<marketplace> --scope project`.

## Infrastructure as code

`infra/` (Pulumi, `pnpm infra:preview` then `pnpm infra:up`, which CI runs on `main`) declares:

- **Google Cloud and Firebase**: APIs, Firestore and its rules (plus TTL on pending connect links and OAuth flows), the media bucket and its Storage rules, the `wovain/connections` KMS key that encrypts merchants' Fourthwall and fal grants, Secret Manager, App Hosting, service accounts and IAM, Workload Identity Federation for CI (no Google key is stored), and the budget (`infra/index.ts`).
- **GitLab** (`infra/gitlab.ts`, `infra/duo.ts`): every CI/CD variable, the `production` and `infrastructure` environments, the Renovate schedule, the issue labels and the Workflow board, and the Duo flow triggers and custom flows.
- **The GitHub mirror** (`infra/github.ts`): repository settings, the deploy key CI pushes with (a generated key pair, which also becomes `GITHUB_MIRROR_KEY`), and a ruleset that lets only that key change `main`.
- **WorkOS AuthKit** (`infra/workos.ts`): the redirect URIs in `wovain:workosRedirectUris` (`Pulumi.prod.yaml`). It uses the community `osodevops/workos` Terraform provider, which `pulumi install` generates into `infra/sdks/workos`. It signs in with the `workos-api-key` stack secret. Entries made by hand are adopted by their WorkOS id (`import`). The MCP resource indicators in `wovain:workosResourceIndicators` go through WorkOS's `authkit_oauth_resources` API with the generic `magodo/restful` Terraform provider (generated into `infra/sdks/restful`), since `osodevops/workos` has no resource for them. That API has no update, so a changed URI or `default` replaces the entry, and the default one is created first.

The tokens are stack secrets, encrypted with the KMS key (`pulumi config set --secret <name>` in `infra/`): `gitlab:token` (Pulumi's GitLab access, `api`), `github:token` (a fine-grained token for the mirror repository: Administration read/write), `gitlab-ci-token` (`GITLAB_TOKEN` for semantic-release and the AI Catalog sync) and `renovate-token` (`RENOVATE_TOKEN`). Each is a separate personal access token, since the Developer+ role can't create project access tokens.

Still set by hand, since no API or provider covers them (or the role can't reach them):

| Where | What |
| --- | --- |
| WorkOS dashboard | CIMD and dynamic client registration (Connect → Configuration), and sign-in methods. WorkOS documents no API for these, so no provider covers them. `smoke:production` fails if CIMD or registration is off |
| GitLab, Maintainer only | Protected branches, tags and environments, merge request settings (such as merging only after the pipeline passes), Duo's automatic review and SAST flows |
| Google Cloud, once | The Pulumi state bucket `wovain-pulumi-state` and the `pulumi/stack-secrets` KMS key, which this stack needs before it can run |
| Meta, Fourthwall, fal, Nebius, Qloo, Tavily | The accounts, Page, pixel, payment method and API keys (keys go in as stack secrets) |

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
| `.agents/skills/` | Project skills for Claude Code and GitLab Duo (see [Agent skills](#agent-skills)) |

## License

[MIT](LICENSE)
