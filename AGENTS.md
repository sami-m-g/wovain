# AGENTS.md

wovain: an MCP server for print-on-demand sellers, used by any agent (product idea → Fourthwall product → Meta Advantage+ campaign). Devpost "Build With AI: Basics" project. The stack is in `docs/spec.md`: one Hono server in `apps/server` (MCP, OAuth checks, Firestore and Cloud Storage) on Firebase App Hosting, widgets in `apps/widgets`, shared schemas in `packages/shared`.

## Workflow

- Planning runs through the course skills in order: `1-start` → `2-scope` → `3-prd` → `4-spec` → `5-build` → `6-ship`. Each reads `status:` in the previous `docs/*.md`.
- The planning docs are the Markdown files in `docs/` (`PRODUCT.md`, `scope.md`, `prd.md`, `spec.md`, `checklist.md`). When a fact changes, update every doc that states it. `docs/app-map.html` (CSS inline) maps the code.
- Work runs through GitLab issues (template `Agent task`) on the Workflow board: `status::intent` (proposed) → `todo` (a human accepted it) → `spec` → `plan` → `doing` → `review` (MR open) → `test` (a human tries it) → closed by the merge. Each change keeps `intent.md`, `spec.md`, `plan.md` and `verify.md` in `docs/changes/<issue>-<slug>/` and a summary with links on the issue (see `docs/changes/README.md`). Claude Code works an issue with `/issue <n>` in its own worktree; Duo's Developer flow works one when assigned or mentioned. The agent that wrote an MR never approves or merges it.
- Don't hand-roll: before writing a helper, check installed dependencies, well-known libraries, the connected MCP servers and this repo's helpers, and name what you checked in the MR. A bug fix starts with a test that fails.
- Project skills (`/issue`, `/capture`) live once in `.agents/skills/<name>/SKILL.md`, which GitLab Duo reads; `.claude/skills/<name>` is a committed symlink to it for Claude Code. A new skill needs both, plus `metadata: slash-command: enabled` so Duo offers it as a slash command. Plugin skills stay Claude Code only.
- `docs/` replaces the course's `devpost/` folder. When a course skill (`1-start` to `6-ship`) or any other skill or plugin names a file in `devpost/`, read and write the file with the same name in `docs/`. For example, `devpost/prd.md` means `docs/prd.md` and `devpost/learner-profile.md` means `docs/learner-profile.md`. Never create `devpost/`.

## Commits

- Use [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): summary`, lowercase, imperative, no trailing period.
- Types: `feat`, `fix`, `docs` (planning docs), `chore` (config, skills, hooks), `refactor`, `test`.
- Create commits with the `commit-commands:commit` skill (`/commit`).
- The primary repo is GitLab (gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase, Developer role). The GitHub mirror (github.com/sami-m-g/wovain) follows GitLab's `main`: `mirror:github` pushes `main` and tags after each pipeline, since GitLab push mirrors need Maintainer. Deploys don't use GitHub: `deploy:production` uploads the source from GitLab CI to App Hosting. Never push to GitHub by hand: only CI writes there, and a stray commit would block its pushes, which don't force. CI/CD is `.gitlab-ci.yml` with jobs in `.gitlab/ci/`; there are no GitHub Actions or Dependabot (Renovate replaces it).
- Commit types drive releases: semantic-release turns `feat` into a minor and `fix` into a patch release after production passes its smoke test. Don't edit `CHANGELOG.md` or the version in `package.json` by hand. Pull before pushing, because the release commit lands on GitLab first.

## Writing

- Follow the learner's preferences in `docs/learner-profile.md` (Collaboration and Communication Preferences): format, question pacing, wireframes.
- Run the `humanizer` skill on prose for docs and UI copy.

## Connected services

- Fourthwall MCP: call `get-instructions` → `ecommerce_get-current-shop` → `load-skills` before any other Fourthwall tool.
- Meta Ads MCP: every call needs `advertiser_job` and `client_conversation_id`. It has no automated-rules tool; rules need the Marketing API (`adrules_library`).
- Research: prefer first-party sources (Meta help via `ads_get_help_article`, Fourthwall `omni_knowledge`); label blog or vendor figures as unverified.
- Tavily MCP (OAuth, https://mcp.tavily.com/mcp/) for research; not yet in Duo until its OAuth is confirmed.

## Design and ads skills

| Need | Use |
| --- | --- |
| Visual direction for a new surface (planning-doc HTML, ChatGPT widgets) | `/impeccable shape`, then build |
| Review or refine existing UI | `/impeccable critique`, `audit`, `polish`, `bolder`, `quieter` |
| Concrete palettes, font pairings, chart types, stack-specific UI rules | `ui-ux-pro-max` (lookup only; Impeccable keeps the direction) |
| Ad creatives and banners | `ui-ux-pro-max:banner-design` |
| Pre-launch ad account audit, ad plans | `/claude-ads:ads` (returns `unknown` on accounts with no history) |

- Impeccable's hooks check UI files after each edit and at Stop; act on their findings.

## Gotchas

- Agents never create new labels; only labels declared in `infra/gitlab.ts` may be used.
- `docs/learner-profile.md` is gitignored on purpose; never commit it.
- Never commit `.env*` (only `.env.example`) or MCP URLs that embed tokens (e.g. the Modal video connector).
- Before installing a third-party plugin, check it for `hooks.json` and `.mcp.json`; install with `claude plugin install <plugin>@<marketplace> --scope project -y`.
- Shell is zsh: unquoted `$var` doesn't word-split. Build multi-word arguments with arrays.

## Code standards

- TypeScript only, strictest settings in `tsconfig.base.json`; no `.js` or `.mjs` files. pnpm 12.3.4 (`packageManager`) on Node 24, which runs `.ts` files directly by type stripping, so there is no bundle step. New packages that need install scripts go in `allowBuilds` in `pnpm-workspace.yaml`.
- Ultracite (oxlint + oxfmt) enforces style: `pnpm check`, `pnpm fix`. A Claude hook runs `ultracite fix` after each edit; the `ultracite` skill (synced from `node_modules` by `pnpm prepare`) holds the full rules.
- Two AI-free gates keep the architecture clean: `pnpm arch` (dependency-cruiser rules in `.config/dependency-cruiser.json`) and `pnpm dupes` (jscpd, any clone fails). `oxlint.config.ts` caps complexity, depth, parameters, function length and file length at today's worst source file: lower a limit when you refactor, never raise it.
- Lefthook runs fix and typecheck on commit, commitlint on the message, and tests, knip, arch, dupes and story tests on push.
- Course skills aren't committed: `pnpm install` copies them into `.claude/skills/` (the `prepare` script, from `challengepost/learn-ai-basics`).
- See a widget without ChatGPT: `pnpm storybook` (one story per widget state, light and dark).
- GitLab Duo setup is config: custom flows are YAML in `.gitlab/duo/catalog/flows/` (validated on change, synced to the AI Catalog on main by GitLab's `ai-catalog` component), and the flow triggers on GitLab's built-in flows, each custom flow's trigger and the custom agents to enable are `wovain:duoTriggers`, `wovain:duoCustomFlows` and `wovain:duoCustomAgents` in `infra/Pulumi.prod.yaml`, which `infra/duo.ts` applies with the rest of `infra/` (with the `gitlab:token` stack secret). No GitLab provider covers flow triggers, so it uses the `sullivtr/graphql` Terraform provider through a local SDK that `pulumi install` generates into `infra/sdks` (gitignored). Code Review reads `.gitlab/duo/mr-review-instructions.yaml` and `.gitlab/duo/mr-review-automated-rules.yaml`. Automatic Duo review and the two SAST flows are project settings only a Maintainer can turn on; they're still off.
- `infra/` declares the Google Cloud project, GitLab's CI variables, environments and Renovate schedule (`infra/gitlab.ts`), the GitHub mirror's settings, deploy key and ruleset (`infra/github.ts`), and the WorkOS AuthKit redirect URIs and MCP resource indicators (`infra/workos.ts`, from `wovain:workosRedirectUris` through the community `osodevops/workos` Terraform provider and `wovain:workosResourceIndicators` through the generic `magodo/restful` one, both generated into `infra/sdks`). Change those there, never in a UI: the next `pulumi up` on `main` reverts hand edits. README (Infrastructure as code) lists what stays manual.
- `infra/` is its own pnpm project, outside the root workspace, so app installs never pull Pulumi packages: run `pnpm infra:install` (`pulumi install`) once after cloning, since typecheck and lint cover it.
- Run the server: `pnpm dev` (Hono on Node in `apps/server` serves `/mcp` on localhost:3000 against the Firestore and Storage emulators, so it needs Java 21; keys live in `apps/server/.env`; `/mcp` needs a WorkOS AuthKit access token for its URL, which needs `WORKOS_AUTHKIT_DOMAIN` and `WORKOS_API_KEY`; AuthKit hosts sign-in and consent; its redirect URIs and resource indicators are in `infra/`, while CIMD and DCR have no API and are set in the WorkOS dashboard under Connect → Configuration). Records live in Firestore under `users/{userId}/{kind}/{id}` and artwork in a private Cloud Storage bucket, both through `firebase-admin`; the rules in `apps/server/firestore.rules` and `storage.rules` deny every client. There are no migrations: each record is checked against its zod schema on read. `pnpm test` runs Vitest on the same emulators (`firebase emulators:exec`). Production is Firebase App Hosting: `apphosting.yaml` runs `pnpm build` (widgets) and `pnpm start` (`node apps/server/src/index.ts`); its secret values are KMS-encrypted Pulumi config (`pulumi config set --secret <name>` in `infra/`). Run `pnpm widgets:watch` beside `pnpm dev`; a widget edit shows on the next redraw ("redraw design d1").
- Model calls: wovain's own go through Genkit (`apps/server/src/lib/ai.ts`) to Nemotron on Nebius Token Factory; the first is `judge_design`, which needs `NEBIUS_API_KEY` and is skipped without it. Genkit is on zod 3, so pass wovain's zod 4 schemas as `output.jsonSchema` and parse replies with zod 4. Tests use `mockModel` from `genkit/testing`; `pnpm test:live` makes the real calls.
- Trend research: `research_trends` and `screen_trademark` call Tavily at runtime through `@tavily/core` (`apps/server/src/lib/tavily.ts`) and need `TAVILY_API_KEY`. Every search is paid (1 credit), so inputs are bounded and nothing about queries or results is logged. Tests pass a fake client (`Pick<TavilyClient, "search">`). To run the live test locally, pipe the key from `pulumi config get tavily-api-key --cwd infra -s prod` into the environment without printing it.
- Merchant connections: wovain is an MCP client of each merchant's Fourthwall, fal and Meta (`lib/upstream.ts`, `lib/oauth-client.ts`, `routes/connect.ts`), with the SDK's `auth()` doing the OAuth and grants KMS-encrypted at `users/{uid}/connections/{provider}` (`WOVAIN_KMS_KEY`; an in-memory key on the emulators). A connect link makes the merchant sign in to wovain in the browser first and binds the flow to that browser with a cookie. Fourthwall and fal fetch `/oauth/client.json` (CIMD), so a local server needs an https tunnel to connect. Meta has no CIMD or DCR: wovain's own Meta app is its client (`META_APP_ID`, README Meta app), and until App Review only people with a role on that app can connect. Tests use `test/fake-upstream.ts`.
- Try it in an agent: add the hosted `/mcp` (or `https://<tunnel>/mcp` for your local server) as a remote MCP server. The step playbooks agents follow live in `apps/server/src/playbooks/` and ship with each deploy (MCP `instructions`, `get_playbook`, prompts).
