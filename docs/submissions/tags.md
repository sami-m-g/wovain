# Submission tags

Main keeps moving after a hackathon deadline, so judges can be pointed at a fixed commit. At each deadline the `submission:tag` job (`.gitlab/ci/ops.yml`, `apps/ops/src/submission-tag.ts`) creates an annotated tag `submission/<name>` at the newest main commit whose pipeline was green by then. Pipelines that only ran the ops schedule or a manual ops run don't count.

| Tag                    | Deadline (UTC)                        |
| ---------------------- | ------------------------------------- |
| `submission/basics`    | 2026-10-26 21:00                      |
| `submission/transcend` | 2026-10-27 13:00                      |
| `submission/nebius`    | 2026-10-30 17:00 (10:00 PDT)          |
| `submission/qloo`      | 2026-10-31 03:45 (23:45 EDT on 10-30) |

The list lives in `apps/ops/src/submissions.ts`; add a hackathon's `devpost` URL there once known, and it goes into the tag message and the release.

How it runs: the job rides the "wovain ops" schedule (every 10 minutes). It does nothing before a deadline or when the tag exists, so it is idempotent. It creates the tag with `GITLAB_TOKEN` (the CI job token can't create tags), a GitLab release named "Submission: <name>" that links Devpost, and pushes the tag to GitHub. The tag message holds the deadline, commit, pipeline URL and the production deployment (ref and SHA) live at the deadline. To retry after a failure, rerun the ops schedule. To redo a tag, delete it (and its release) in GitLab and on GitHub first.

## Link them in Devpost

- GitHub: `https://github.com/sami-m-g/wovain/tree/submission/<name>`, for example `https://github.com/sami-m-g/wovain/tree/submission/basics`
- GitLab: `https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/tags/submission/<name>`
- Release page: `https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/releases/submission%2F<name>`

Use the GitHub tree link as the "Try it out" or repository link, since judges can browse it without a GitLab login.
