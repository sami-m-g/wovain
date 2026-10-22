# Per-change docs

Every change keeps its intent, spec, plan and proof next to the code, in `docs/changes/<issue-number>-<slug>/`. The GitLab issue holds a summary with links to these files. These are separate from the project-level planning docs in `docs/`.

| File | Stage | Written by | Accepted by |
| --- | --- | --- | --- |
| `intent.md` | Plan | The issue's author, or the agent from the issue | A human, by moving the issue to `status::todo` |
| `spec.md` | Design | The agent, from the intent | The reviewer, in the MR |
| `plan.md` | Build | The agent, in plan mode, before any code | The reviewer, in the MR |
| `verify.md` | Test and Deploy | The agent, before it opens the MR | The reviewer, in the MR |

The first three are the first commit of the MR. If the work departs from `plan.md`, update it in the same commit as the code. Copy `_template/` to start a change. A bug's intent is the reproduction plus the expected behavior.

The agent stops for a human to approve `plan.md` only when the change is risky (auth, infra, CI config, money-spending paths, stored record shapes, or a `priority::1` feature); otherwise it goes on to build.
