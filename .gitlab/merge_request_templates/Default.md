<!-- Stand on its own: a reviewer who opens no files should know why this MR exists and what it changes. Keep it as short as the change. -->

## Problem

<!-- Who is affected and what is wrong or missing for them today. -->

Closes #

## Changes

<!-- What a merchant, tester or maintainer will now see or do differently. Mark purely mechanical changes as such. -->

-

## How it was tested

<!-- What you ran or clicked, and what you did not check. Agents: list only what you actually ran; don't claim manual testing. -->

-

## Checklist

- [ ] Title is a Conventional Commit (`type(scope): summary`, lowercase, imperative)
- [ ] Pipeline is green (build, verify, stories)
- [ ] Planning docs (`docs/*.md`) updated if a fact changed
- [ ] Migrations generated with `bun run db:generate` if the schema changed
- [ ] No secrets, tokens or `.env` files in the diff

<!-- Duo code review (0.25 GitLab Credits per review) is off until approved; to request one, add: /assign_reviewer @GitLabDuo -->
