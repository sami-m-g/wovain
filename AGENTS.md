# AGENTS.md

wovain: an MCP server for print-on-demand sellers, used by any agent (product idea → Fourthwall product → Meta Advantage+ campaign). Devpost "Build With AI: Basics" project. The stack is in `devpost/spec.md`: one Hono server in `apps/server` (MCP, OAuth, database) on Vercel, widgets in `apps/widgets`, shared schemas in `packages/shared`.

## Workflow

- Planning runs through the course skills in order: `1-start` → `2-scope` → `3-prd` → `4-spec` → `5-build` → `6-ship`. Each reads `status:` in the previous `devpost/*.md`.
- The planning docs are the Markdown files in `devpost/` (`scope.md`, `prd.md`, `spec.md`, `checklist.md`). When a fact changes, update every doc that states it. `devpost/app-map.html` (CSS inline) maps the code.

## Commits

- Use [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): summary`, lowercase, imperative, no trailing period.
- Types: `feat`, `fix`, `docs` (planning docs), `chore` (config, skills, hooks), `refactor`, `test`.
- Create commits with the `commit-commands:commit` skill (`/commit`).
- The primary repo is GitLab (gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase, Developer role). The GitHub mirror (github.com/sami-m-g/wovain) follows GitLab's `main` through the `mirror:github` CI job after every `main` pipeline, since GitLab push mirrors need Maintainer; `origin` also pushes to both in one `git push`. CI/CD is `.gitlab-ci.yml`; there are no GitHub Actions or Dependabot (Renovate replaces it).
- Commit types drive releases: semantic-release turns `feat` into a minor and `fix` into a patch release after production passes its smoke test. Don't edit `CHANGELOG.md` or the version in `package.json` by hand. Pull before pushing, because the release commit lands on GitLab first.

## Writing

- Follow the learner's preferences in `devpost/learner-profile.md` (Collaboration and Communication Preferences): format, question pacing, wireframes.
- Run the `humanizer` skill on prose for docs and UI copy.

## Connected services

- Fourthwall MCP: call `get-instructions` → `ecommerce_get-current-shop` → `load-skills` before any other Fourthwall tool.
- Meta Ads MCP: every call needs `advertiser_job` and `client_conversation_id`. It has no automated-rules tool; rules need the Marketing API (`adrules_library`).
- Research: prefer first-party sources (Meta help via `ads_get_help_article`, Fourthwall `omni_knowledge`); label blog or vendor figures as unverified.

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

- `devpost/learner-profile.md` is gitignored on purpose; never commit it.
- Never commit `.env*` (only `.env.example`) or MCP URLs that embed tokens (e.g. the Modal video connector).
- Before installing a third-party plugin, check it for `hooks.json` and `.mcp.json`; install with `claude plugin install <plugin>@<marketplace> --scope project -y`.
- Shell is zsh: unquoted `$var` doesn't word-split. Build multi-word arguments with arrays.

## Code standards

- TypeScript only, strictest settings in `tsconfig.base.json`; no `.js` or `.mjs` files.
- Ultracite (oxlint + oxfmt) enforces style: `bun run check`, `bun run fix`. A Claude hook runs `ultracite fix` after each edit; the `ultracite` skill (synced from `node_modules` by `bun run prepare`) holds the full rules.
- Lefthook runs fix and typecheck on commit, commitlint on the message, and tests, knip and story tests on push.
- Course skills aren't committed: run `bun run skills:restore` after cloning (it fetches them from `skills-lock.json`).
- See a widget without ChatGPT: `bun run storybook` (one story per widget state, light and dark).
- Run the server: `bun run dev` (Hono in `apps/server` serves `/mcp` on localhost:3000; keys live in `apps/server/.env`; `/mcp` needs a WorkOS AuthKit access token for its URL, which needs `WORKOS_AUTHKIT_DOMAIN` and `WORKOS_API_KEY`; AuthKit hosts sign-in and consent, and its CIMD, DCR and resource indicators are set in the WorkOS dashboard under Connect → Configuration). `DATABASE_URL` points at the Neon `dev` branch and `BLOB_READ_WRITE_TOKEN` at the private Blob store; there is no SQLite or offline mode. After a schema change in `apps/server/src/db`, run `bun run db:generate`, then `bun run db:migrate`. Tests run on PGlite and need no database. Vercel's build config is `apps/server/vercel.json` ( keep it JSON, since `vercel.ts` makes Vercel install on Bun 1.3, which ignores `bun.lock`). Vercel runs `bun run build`, which builds the widgets and bundles `src/index.ts` into `dist/` with `bun build`, because Vercel doesn't resolve source-only workspace packages like `@wovain/shared`; the bundle skips type-checking, so CI and Lefthook do it. Run `bun run widgets:watch` beside it; a widget edit shows on the next redraw ("redraw design d1").
- Try it in an agent: add the hosted `/mcp` (or `https://<tunnel>/mcp` for your local server) as a remote MCP server. The step playbooks agents follow live in `apps/server/src/playbooks/` and ship with each deploy (MCP `instructions`, `get_playbook`, prompts).
