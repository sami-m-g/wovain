---
name: issue
description: Work one GitLab issue end to end in its own worktree and open a merge request for it. Use when the user says "/issue 42", "work issue 42" or "pick up the next todo issue". Run several sessions at once for parallel work.
argument-hint: "[issue number, or empty for the top status::todo issue]"
---

# Work a GitLab issue

The project is `gitlab-ai-hackathon/transcend-october-2026/43085639/showcase`. Pass it to every `glab` command as `-R`.

## 1. Pick and claim the issue

- If the user gave a number, use it.
- If not, take the open `status::todo` issue with the highest `priority::` (1 is highest) that has no `agent::` label and no assignee: `glab issue list -R <project> -l status::todo`.
- Read it in full, comments included: `glab issue view <n> -R <project> --comments`.
- If the goal or the acceptance criteria are unclear, ask the user and stop. Don't guess.
- Claim it: `glab issue update <n> -R <project> --label status::doing,agent::claude --unlabel status::todo`.

## 2. Work in a worktree

Use the `EnterWorktree` tool, on a branch named `<type>/<n>-<slug>` cut from `origin/main`. Other sessions may be working in the main checkout at the same time.

## 3. Build it

- Follow `AGENTS.md`.
- Before writing a helper, check for an installed dependency, a well-known library, an MCP tool or an existing helper that already does it. Say in the MR which ones you checked.
- For a bug, first write a test that fails, then fix it.
- Run every check the issue lists before opening the MR. The default set is `pnpm check`, `pnpm typecheck`, `pnpm knip`, `pnpm test` and `pnpm build`.

## 4. Open the merge request

- Commit with Conventional Commits.
- Push to `origin`, which is GitLab: `git push -u origin <branch>`. Never push to the `github` remote; only CI writes there.
- Open the MR. `--fill` doesn't work together with `-R`, so pass every input explicitly:

  ```
  glab mr create -R <project> --source-branch <branch> --target-branch main --related-issue <n> --title "<conventional title>" --description "<body>" --remove-source-branch --yes
  ```

  Add `--reviewer duo-code-review-gitlab-ai-hackathon` only when the `duo-code-review` trigger in `infra/Pulumi.prod.yaml` is active. Requesting that reviewer starts a Code Review run, which spends Duo credits.

  The description says:
  - what changed
  - how to test it in the review app
  - what wasn't done
  - `Closes #<n>`
- Move the issue: `--label status::review --unlabel status::doing`.

## 5. Report back

Give the user the MR link and the test steps. When they've tried the review app, they move the issue to `status::test` or comment on what to change. Never merge your own MR.
