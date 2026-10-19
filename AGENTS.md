# AGENTS.md

wovain: a ChatGPT plugin for print-on-demand sellers (trend → Fourthwall product → Meta Advantage+ campaign). Devpost "Build With AI: Basics" project. No app code yet; the stack is decided in `devpost/spec.md`.

## Workflow

- Planning runs through the course skills in order: `1-start` → `2-scope` → `3-prd` → `4-spec` → `5-build` → `6-ship`. Each reads `status:` in the previous `devpost/*.md`.
- Every planning doc has a `.md` (read by the skills) and an `.html` review page. **The HTML is the source of truth**; keep both in sync with the `sync-plan` skill.
- A Stop hook blocks ending a turn while a pair has drifted. Check manually:
  ```bash
  uv run -q --script .claude/skills/sync-plan/scripts/plan_sync.py devpost
  ```

## Commits

- Use [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): summary`, lowercase, imperative, no trailing period.
- Types: `feat`, `fix`, `docs` (planning docs), `chore` (config, skills, hooks), `refactor`, `test`.
- Create commits with the `commit-commands:commit` skill (`/commit`).

## Writing

- Prefer tables and diagrams; keep paragraphs short. Run the `humanizer` skill on prose for docs and UI copy.

## Gotchas

- `devpost/learner-profile.md` is gitignored on purpose; never commit it.
- Never commit `.env*` (only `.env.example`) or MCP URLs that embed tokens (e.g. the Modal video connector).
