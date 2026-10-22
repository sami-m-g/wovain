---
name: issue
description: Work one GitLab issue end to end in its own worktree and open a merge request for it. Use when the user says "/issue 42", "work issue 42" or "pick up the next todo issue". Run several sessions at once for parallel work.
argument-hint: "[issue number, or empty for the top status::todo issue]"
metadata:
  slash-command: enabled
---

# Work a GitLab issue

The project is `gitlab-ai-hackathon/transcend-october-2026/43085639/showcase`. Pass it to every `glab` command as `-R`.

## 1. Pick and claim the issue

- If the user gave a number, use it.
- If not, take the open `status::todo` issue with the highest `priority::` (1 is highest) that has no `agent::` label and no assignee: `glab issue list -R <project> -l status::todo`.
- Read it in full, comments included: `glab issue view <n> -R <project> --comments`.
- If the goal or the acceptance criteria are unclear, ask the user and stop. Don't guess.
- Only work an accepted issue: a human moved it from `status::intent` to `status::todo`. If it is still `status::intent`, stop.
- Claim it and start the spec: `glab issue update <n> -R <project> --label status::spec,agent::claude --unlabel status::todo`.

## 2. Work in a worktree

Use the `EnterWorktree` tool, on a branch named `<type>/<n>-<slug>` cut from `origin/main`. Other sessions may be working in the main checkout at the same time.

## 3. Intent, spec and plan, then build

The change keeps its artifacts in `docs/changes/<n>-<slug>/` (see `docs/changes/README.md`, templates in `_template/`).

- Write `intent.md` from the issue: problem, desired outcome, constraints, open questions. For a bug, the reproduction plus the expected behavior. If an open question blocks the work, ask the user and stop.
- Write `spec.md` from the intent. Run the `feature-dev:code-architect` agent (`feature-dev:code-explorer` for a small change) to design the change against the existing patterns. It lists the libraries and helpers to reuse. Also check for an installed dependency, a well-known library or an MCP tool that already does the job. Say in the MR which ones you checked.
- Move the labels: `--label status::plan --unlabel status::spec`. In plan mode, write `plan.md`: files that change, order of work, risks, tests that prove it. Then decide whether to stop for approval. Stop only when the change is risky: it touches `apps/server/src/auth/`, `infra/`, `.gitlab/`, a path that spends money (Meta spend, Fourthwall publish, paid fal generation) or the stored Firestore record shapes, or the issue is `priority::1` and `type::feature`. Stopping means: commit the three files, leave the issue at `status::plan`, comment "plan ready for approval" with a link to `plan.md`, and end. Otherwise continue to build. When resumed on a `status::plan` issue that has a human approval comment, continue from `plan.md`.
- Commit the three files as the first commit of the MR (`docs(<scope>): add intent, spec and plan for #<n>`). Comment on the issue with a 3-line summary (intent, design, plan) and links to the files on the branch.
- Move to `--label status::doing --unlabel status::plan`, then build. Update `plan.md` in the same commit as any code that departs from it.
- Follow `AGENTS.md`.
- For a bug, first write a test that fails, then fix it.
- Run every check the issue lists. The default set is `pnpm check`, `pnpm typecheck`, `pnpm knip`, `pnpm arch`, `pnpm dupes`, `pnpm test` and `pnpm build`.
- Before opening the MR, run the `/simplify` skill, then the `pr-review-toolkit:code-simplifier` and `pr-review-toolkit:silent-failure-hunter` agents. Fix what they find and rerun the checks. List what each one flagged in the MR description.
- Write `verify.md` before opening the MR: tests added (for a bug, the one that failed first), checks run, review findings and how each was resolved, how to try it, and any departure from the plan. Commit it.

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

Give the user the MR link and the test steps. The human moves intent → todo before you start, and test → merge at the end. When they've tried the review app, they move the issue to `status::test` or comment on what to change. Never merge your own MR.

- Agents never create new labels; only labels declared in `infra/gitlab.ts` may be used.
