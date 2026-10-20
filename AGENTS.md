# AGENTS.md

wovain: a ChatGPT plugin for print-on-demand sellers (trend → Fourthwall product → Meta Advantage+ campaign). Devpost "Build With AI: Basics" project. The stack is in `devpost/spec.md`: MCP server library in `apps/server`, hosted by Next.js in `apps/web` on Vercel, cards in `apps/cards`.

## Workflow

- Planning runs through the course skills in order: `1-start` → `2-scope` → `3-prd` → `4-spec` → `5-build` → `6-ship`. Each reads `status:` in the previous `devpost/*.md`.
- Every planning doc has a `.md` (read by the skills) and an `.html` review page. **The HTML is the source of truth**; keep both in sync with the `sync-plan` skill.
- Review pages link the shared `devpost/plan.css` (tokens, tables, tags, tabs, diagrams); only page-specific CSS stays inline.
- A Stop hook blocks ending a turn while a pair has drifted. Check manually:

  ```bash
  bun scripts/plan-sync.ts devpost
  ```

## Commits

- Use [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): summary`, lowercase, imperative, no trailing period.
- Types: `feat`, `fix`, `docs` (planning docs), `chore` (config, skills, hooks), `refactor`, `test`.
- Create commits with the `commit-commands:commit` skill (`/commit`).
- The primary repo is GitLab (gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase, Developer role). `origin` pushes to GitLab and to the GitHub mirror (github.com/sami-m-g/wovain) in one `git push`, since GitLab push mirrors need Maintainer. CI/CD is `.gitlab-ci.yml`; there are no GitHub Actions or Dependabot (Renovate replaces it).
- Commit types drive releases: semantic-release turns `feat` into a minor and `fix` into a patch release after production passes its smoke test. Don't edit `CHANGELOG.md` or the versions in `package.json` and `plugin/plugin.json` by hand. Pull before pushing, because the release commit lands on GitLab first.

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
| Visual direction for a new surface (planning-doc HTML, ChatGPT cards) | `/impeccable shape`, then build |
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
- See a card without ChatGPT: `bun run storybook` (one story per card state, light and dark).
- Run the server: `bun run dev` (Next.js in `apps/web` serves `/mcp` on localhost:3000; keys live in `apps/web/.env`; `/mcp` needs a Better Auth access token, and sign-in needs `BETTER_AUTH_SECRET` plus the Google keys). `DATABASE_URL` points at the Neon `dev` branch and `BLOB_READ_WRITE_TOKEN` at the private Blob store; there is no SQLite or offline mode. After a schema change in `packages/db`, run `bun run db:generate`, then `bun run db:migrate` (after changing Better Auth plugins, regenerate `packages/db/src/auth-schema.ts` with `bunx auth@1.7.7 generate` first). Tests run on PGlite and need no database. Infrastructure is code: `neon.ts` (Neon branches and services, `bunx neon@8.8.0 config plan`/`apply`) and `apps/web/vercel.json` (Vercel project config; keep it JSON, since `vercel.ts` makes Vercel install on Bun 1.3, which ignores `bun.lock`). Run `bun run cards:watch` beside it; a card edit shows on the next redraw ("redraw design d1").
- Try it in ChatGPT: `bun run plugin:install` installs `plugin/` pointed at the hosted `/mcp`; `--url https://<tunnel>/mcp` points it at your local server instead. Skill edits need `plugin:install` again (skills are copied at install), then an app restart.
- Next.js 16 differs from older versions: read `apps/web/node_modules/next/dist/docs/` before writing Next code. `apps/web/oxlint.config.ts` extends the root Ultracite config with the Next presets.
