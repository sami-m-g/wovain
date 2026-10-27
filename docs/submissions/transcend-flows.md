# Duo flows running live (GitLab Transcend)

Evidence that each of wovain's GitLab Duo flows runs on the project (docs/flows.md). This is for the demo video and the submission. All times are UTC on 2026-10-27 unless stated otherwise. Links point to `gitlab-ai-hackathon/transcend-october-2026/43085639/showcase`.

## wovain scout (custom flow, flow 2)

|  |  |
| --- | --- |
| Trigger | Build > Pipeline schedules > "wovain scout" > Run (schedule 4511047), with no variables. `scout:collect` refreshed the snapshot, and the `scout:duo` child pipeline's success started the flow through its `pipeline_hooks` trigger |
| Time | Played 09:23:47. Pipeline [2993526994](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/pipelines/2993526994), child pipeline [2993540098](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/pipelines/2993540098), session [10114260](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/automate/agent-sessions/10114260) from 09:27 |
| Snapshot | [#37 KPI snapshot](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/work_items/37) |
| Output | The live run filed no issues: open `kpi-scout` issues already cover the three worst KPIs (p95-latency #39 and #42, client-errors #68, frustrated-clicks #40 and #41). It also flagged the 922877 ms p95 as a likely measurement problem. The scheduled run at 06:46 filed [#67](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/work_items/67) (run-to-campaign) and [#68](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/work_items/68) (client-errors), authored by `ai-wovain-scout-gitlab-ai-hackathon` |

Summary: the scout read the fresh snapshot, ranked five missed KPIs, and filed only the issues that weren't already open. Today that was none.

## wovain deps-review (custom flow)

|  |  |
| --- | --- |
| Trigger | On Renovate's [!102](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/merge_requests/102) (`@pulumi/gcp` 9.37.1 to 10.1.1), review requested from `ai-wovain-deps-review-gitlab-ai-hackathon` (the `assign_reviewer` trigger, the same thing Renovate's `reviewers` does) |
| Time | 09:22:42. Session [10113979](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/automate/agent-sessions/10113979) ran from 09:22:44 to 09:24:30 |
| Output | [Verdict note](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/merge_requests/102#note_4097259864): **hold** |

Summary: it found no release notes (Renovate has no `GITHUB_COM_TOKEN`), and Renovate's lockfile update had failed on this major bump. It flagged that `infra/pnpm-lock.yaml` wasn't updated and that the pipeline is red, listed every `@pulumi/gcp` call site to check, and gave the upgrade procedure. It filed no adopt issues because there were no notes to find features in.

## Duo Developer flow, then Duo Code Review (flow 3)

|  |  |
| --- | --- |
| Trigger | New issue [#69](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/work_items/69), "notifyRun and compensation failures are only wide-event fields: log them at error level", labelled `agent::task` and assigned to `duo-developer-gitlab-ai-hackathon`. This is the `assign` trigger, the same way #46 started !136 |
| Time | Assigned 09:23:38. Session [10114041](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/automate/agent-sessions/10114041) ran from 09:23:39 to 09:28:29 |
| Output | Draft [!185](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/merge_requests/185) "fix(api): log failed run email and compensation at error level", opened 09:28:17. Duo Code Review started 09:28:21, and at 09:30:39 it found nothing to comment on and approved |

Summary: the agent turned a gap in the error sink (two swallowed failures in `packages/api/src/flow/runs.ts`) into an MR that logs both at error level, with a test. Duo Code Review approved it.

Earlier runs of the same flow:

- [#46](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/work_items/46) led to [!136](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/merge_requests/136), then [!138](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/merge_requests/138) on a mention follow-up (2026-10-26).
- Vulnerability fixes (flow 4's fallback): the ops job filed `vuln-fix` + `agent::task` issues for SAST findings and assigned them to the Developer flow. [#48](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/work_items/48) led to [!143](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/merge_requests/143), merged after Duo Code Review approved it. [#57](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/work_items/57) led to [!160](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/merge_requests/160), approved by Duo Code Review.

## wovain explain (custom agent)

|  |  |
| --- | --- |
| Trigger | None. It's a chat agent, and GitLab custom agents take no triggers (`infra/duo.ts`), so it can't be started by a mention, an assignment or the API. It runs only in GitLab Duo Chat |
| How to show it | On a pipeline or MR page, open GitLab Duo Chat (the Duo icon at the top right), choose the **wovain explain** agent in the agent picker, and ask, for example, "Why did pipeline 2988280946 fail?" (the red pipeline on !102) |

Summary: it's read-only (it has no write tools). It explains a failed pipeline or MR and names the jobs, files and lines involved.
