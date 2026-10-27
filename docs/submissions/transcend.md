---
doc: submission
hackathon: GitLab Transcend "Life After Code"
devpost: https://gitlab-transcend.devpost.com/
deadline: 2026-10-27 13:00 UTC
status: draft
---

# GitLab Transcend: submission pack for wovain

Evidence pack and draft answers for the Devpost form. Every claim below was checked against the GitLab API (`glab api`) on 2026-10-27 between 09:00 and 10:00 UTC. If something is not in this file, check it before you claim it.

Like [basics.md](basics.md), section 5 holds prompts, not finished answers. Write each answer in your own words. Credentials and the judges' promo code go only into Devpost's private testing box ([testing.md](testing.md)), never into this repo.

## 0. Requirements and links

| Requirement | Proof | Status |
| --- | --- | --- |
| Path B (the project predates 2026-10-05): live deployed URL | <https://wovain.com> is live. The first commit in this repo is 2026-10-06 (`55d9e69`), after Oct 5: confirm on the form that Path B (pre-existing project) is the right path and describe what existed before | Verify |
| Uses GitLab Duo Agent Platform to automate post-code DevSecOps | Sections 1 and 2 | Met |
| MIT license, public repo | `LICENSE` (MIT, Mina Sami); GitHub mirror | Met |
| Video under 3 minutes | Section 6 | To do |
| Bonus: Google Cloud | Section 4 | Met |
| Bonus: SCI (green) measurement | Section 4, `sci` job on every main pipeline | Met |

| What | URL |
| --- | --- |
| Live app | <https://wovain.com> |
| Repository (frozen at the deadline) | <https://github.com/sami-m-g/wovain/tree/submission/transcend> (the `submission:tag` job creates it after 13:00 UTC, see [tags.md](tags.md)) |
| GitLab project | <https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase> |
| Status page (health, incidents, DORA, SCI) | <https://status.wovain.com> |
| Flow design | `docs/flows.md`, `docs/adr/0001-progressive-delivery.md` |

## 1. What Duo automates after code

Nothing here writes product code from a prompt. Every piece starts after a merge request exists, after a merge, or after production does something.

### Duo flows (`.gitlab/duo`, synced to the AI Catalog by `.gitlab/ci/duo.yml`)

| Flow | Trigger | What it does | Limits |
| --- | --- | --- | --- |
| Duo Code Review (foundational) | Every new MR (`fix/duo-triggers`, !113) | Reviews the diff against `.gitlab/duo/mr-review-instructions.yaml` ("blocking findings only": wrong behaviour, security, rules, docs the diff makes false). With "Duo can approve and request changes" on, each thread blocks the merge | Threads only for real problems |
| Rereview (ops job, !133) | MR where Duo requested changes, every thread resolved, pipeline green | The ops job re-requests Duo's review (`apps/ops/src/rereview.ts`); Duo approves when it finds nothing new, which clears its change request | `MAX_REREVIEWS` cap |
| Developer (foundational) | Issue labelled `agent::task` or a SAST finding handed over by ops | Implements the issue and opens a draft MR | Goes through Duo Code Review and CI like any MR |
| `wovain heal` (`catalog/flows/heal.yml`) | Ops files a `heal` issue per new production error signature (PostHog Error Tracking is the one error sink, !150) and assigns it to the flow | Reproduces the error with a failing test, fixes it, opens an MR. `heal:verify` checks the test fails on main and passes with the fix | Ops auto-merges only inside its guardrails |
| `wovain scout` (`catalog/flows/scout.yml`) | Daily "wovain scout" schedule, after `scout:collect` writes the KPI snapshot | Files up to three ranked issues against `.gitlab/duo/kpis.yml` | No tools that change code; a person accepts with `agent::task` |
| `wovain deps-review` (`catalog/flows/deps-review.yml`) | Renovate sets the flow as reviewer | One verdict note per bump (breaking, worth adopting, noise) and deduplicated `adopt:` issues | Read-only on the MR |
| `wovain release-guard` (`catalog/flows/release-guard.yml`) | A `release-guard` issue from the canary job or the ops job's release guard | Diagnoses the rollback or kill switch; opens a fix or revert MR when the cause is clear | Never touches production; the mitigation is already done |

### CI ops jobs (`.gitlab/ci/*.yml`, `apps/ops`)

- `ops` (every 10 minutes): files heal issues and incidents, verifies merged heal fixes in production, hands `agent::task` issues and High/Critical SAST findings to the Developer flow, rereviews, runs the release guard, renders the status page. No model calls of its own.
- `canary:production`, `rollback:production`, `smoke:production` (`deploy.yml`).
- `heal:verify`, `scout:collect`, `scout:duo`, `posthog:apply`, `sci`, `submission:tag`.
- Secure: `semgrep-sast`, `kics-iac-sast`, `secret_detection`, `container_scanning`, dependency scanning.

### Progressive delivery (`docs/adr/0001-progressive-delivery.md`, !121)

- **Flags as code.** `packages/core/src/flag-registry.ts` holds every flag (owner, expiry, rollout per environment: `off`, `internal`, `percent`, `all`). Pulumi applies them as GitLab feature flags; the app reads them with the official Unleash SDK and fails closed. The Status toggle is the kill switch. Expired flags get a `flag-cleanup` issue (for example #47).
- **Canary.** Every web deploy goes to Cloud Run as a new revision tagged `canary` at 10% traffic. `canary:production` probes it and compares 5xx per revision for 10 minutes, then promotes or rolls back. Its verdict is the job's `canary.md` artifact.
- **Rollback.** On a bad canary, traffic goes back to stable, the job fails (so it counts in DORA's change failure rate), and a `release-guard` issue with the evidence is filed and assigned to the release-guard flow. A manual rollback is a `ROLLBACK=1` pipeline; nobody moves traffic from a laptop.
- **Release guard (ops job).** Watches PostHog exceptions and KPI alerts after a deploy or a flag change; one action an hour, three a day, nothing switched back on automatically.

### SCI job

`sci` runs on every main pipeline (`.gitlab/ci/ops.yml`, `apps/ops/src/sci.ts`). It measures the last 7 days of Cloud Run instance time and requests, main-pipeline CI minutes and Duo sessions, and computes SCI = ((E x I) + M) per R (Green Software Foundation). Latest numbers in section 4.

## 2. Timeline of real autonomous catches (2026-10-26 and 27, UTC)

### Duo Code Review findings that were valid and fixed

| When | MR | Duo's finding | Fix |
| --- | --- | --- | --- |
| 10-26 18:40 | [!164](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/merge_requests/164) ci: newest deploy first | `.skip-if-superseded` on `canary:production` could exit 0 without `canary verify`, leaving a revision at 10% with no probes, no promote or rollback and no release-guard issue. Also `deploy:development` lacked the guard its migrate job had | `67bb494`: canary always verifies; dev deploy guarded; `posthog:apply` made non-interruptible. Duo re-reviewed 10-27 08:54: "Both earlier findings look fixed", approved |
| 10-26 19:50 | [!171](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/merge_requests/171) approving a design no longer hangs | Regression: the run-engine check ran before the waiting-run lookup, so decisions on non-waiting runs would fail. And the compensation path reset the run unconditionally (unguarded undo) | `ec5dbc36` "need a run engine only for a waiting run; undo only what the decision set", 9 minutes after the review |
| 10-26 20:41 | [!175](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/merge_requests/175) a design for each top idea | The change raised a manual run from 5 to 9 credits, so the pricing FAQ and landing copy in en, fr and es now stated a false cost | `b5629de`: one `DESIGNS_PER_RUN` constant feeds the run and the plan cards; copy updated in three languages. Rereviewed and approved 10-27 08:49 |
| 10-26 20:50 | [!177](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/merge_requests/177) refresh expired fal grants | `REFUSED_TOKEN` matched bare "401"/"unauthorized", so a Meta permission error could mark a healthy connection `needs_reconnect` and retry write tools. Plus a refresh-token rotation race between sessions | `976b7dc`: narrowed match, retry no longer expires the grant, re-read before `needs_reconnect`. Follow-up [!180](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/merge_requests/180) fixed the race baseline; Duo found nothing more |

Also worth showing: on [!151](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/merge_requests/151) Duo flagged a missing lockfile and a possible OTLP endpoint mismatch. The author answered both with evidence (the lockfile was collapsed in the diff view; `@mastra/otel-exporter` 1.4.9 appends the signal path). On rereview Duo accepted the explanations, did not raise them again, and approved. Disputes are settled in the thread, not by overriding the bot.

### Rereview re-approvals (ops job, !133)

The ops job posted "Every GitLab Duo thread is resolved and the pipeline passed ... so wovain ops re-requested its review" and Duo answered "found nothing to comment on" on:

- !151: 10-26 18:56 and 19:10, Duo approved 19:13 (merged 19:13).
- !175 and !177: 10-27 08:47, Duo's clean reviews 08:49.
- !164: Duo's clean review 10-27 08:54, approved.

### Duo Developer flow: SAST finding to merged fix

- [#48](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/work_items/48) (10-26 15:28): ops handed a High SSRF finding (CWE-918, `apps/ops/src/submission-tag.ts:30`) to the Developer flow. Duo Developer opened [!143](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/merge_requests/143) at 15:42 (commit authored by the Duo Developer service account): an `apiUrl()` that rejects any path leaving the API base, with a test. Merged 16:20.
- [!136](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/merge_requests/136) (10-26): Duo Developer fixed production sign-in failing with 500s (varlock leak detection on `WOVAIN_ALLOWED_EMAILS`) from issue [#46](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/work_items/46). Merged 15:07.

### Canary rollbacks and the release guard

The canary rolled production back on its own eight times on 10-26 and filed a `release-guard` issue each time, with the commit, pipeline, job, per-revision 5xx counts and failed probes: #52, #54, #55, #56, #58, [#59](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/work_items/59), [#60](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/work_items/60), [#61](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/work_items/61).

- [#59](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/work_items/59) (18:06): canary `wovain-web-00068-zer` rolled back to `00030-drf`. 2 of 59 probes got no answer, with 0/122 5xx on the canary. The evidence showed the probes were landing on cold instances, not on a broken build. Fixes: [!161](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/merge_requests/161) (30 s probe timeout, past a cold instance's ~17 s first answer) and [!162](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/merge_requests/162) (roll back on two 5xx probes or more than 10% unanswered). Both reference #59, merged 18:13 and 18:14; #59 closed 18:13. Earlier, [!157](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/merge_requests/157) added a warm-up.
- #60 (18:32) and #61 (20:04) were again unanswered probes with 0 canary 5xx. Say this plainly: the canary is conservative and rolled back healthy revisions; it never let a bad one through.
- Gap to know before the video: on #59 and #61 the release-guard flow started (sessions 10077496, 10084996) and stopped without changes, saying the description had no `wovain:release-guard` marker, although the issue description has it. The heal flow stopped the same way on #49 (missing `wovain:signature`). The flows' prompt-injection check does not see the hidden HTML comment. Do not show a release-guard diagnosis MR unless this is fixed and you have one.

### Incident, trace and PostHog linking (!151)

- [!151](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/merge_requests/151) (merged 10-26 19:13): server `$exception`s carry `trace_id`; evlog wide events carry `traceId`/`spanId`. When ops files a heal incident, `linkIncident` adds a "Trace in GitLab Observability" timeline event linking `https://144066465.gitlab-o11y.com/trace/<id>`, and sets the PostHog issue's description to the incident and trace URLs with severity high.
- Honest status: the only incident so far, [#50](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/work_items/50) (10-26 16:11, `EvlogError` on `/api/connections/meta/start`), predates !151. Its timeline has "Detected" and the severity change, not a trace link. Show the linking only from a new incident.

## 3. Observability

- **GitLab Observability** (group Observe > Traces, instance `https://144066465.gitlab-o11y.com`): Next.js request and outgoing `fetch` spans (`apps/web/src/lib/otel.ts`), Mastra agent spans and logs ([!170](https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/merge_requests/170), `packages/api/src/workflows/observability.ts`), evlog logs over the OTLP drain, Node runtime metrics, and CI/CD telemetry (`GITLAB_OBSERVABILITY_EXPORT`). No collector.
- **Cloud Trace**: Mastra's spans keep a Cloud Trace copy (!170).
- **PostHog Error Tracking**: the one error sink (!150, AGENTS.md "One error sink"). Heal, heal verification, the release guard and the status page read only from it.

## 4. Google Cloud and SCI

Google Cloud, all managed by Pulumi (`infra/`) and applied by CI on merge:

- Cloud Run: `wovain-web` (production, with the `canary` revision tag), `wovain-web-dev`, docs; domain mappings for wovain.com.
- Cloud SQL (PostgreSQL), Artifact Registry, Secret Manager, Cloud KMS (token encryption), Workload Identity Federation (keyless CI), Cloud DNS, Cloud Storage, a billing budget.
- Cloud Logging (evlog drain, heal evidence links), Cloud Trace, the official `@google-cloud/run` client for canary traffic moves.

SCI, from the latest `sci` job artifact (job 17496748279, main pipeline 2993467542, 2026-10-27 09:09 UTC):

**21.83 gCO2e per 1,000 requests** (22,351 requests, 488.0 gCO2e over 7 days).

| Component | gCO2e | Basis |
| --- | --- | --- |
| Web app (Cloud Run) | 3.11 | measured 2 instance-hours at 1 vCPU, 0.5 GB |
| CI (GitLab hosted runners) | 96.07 | measured 875 CI minutes on main |
| Duo flows | 388.80 | 100 sessions x 9 Wh (estimate) |

Grid intensity is location-based (Google 2025): 432 gCO2e/kWh for the service, 579 for runners. Energy coefficients from Cloud Carbon Footprint. The Duo session energy is an unverified estimate; say so if you quote it. The insight worth stating: the agents, not the app, are 80% of the footprint.

Before you submit: the newest main pipeline's `infra:production` failed (job 17496748268, "Image ... web:676dd80... not found"), so main's newest commit had not deployed at 09:16 UTC. Check that wovain.com serves a green deploy before recording.

## 5. Draft Devpost answers (prompts to finish in your own words)

Keep each part short and plain. Links to include somewhere: <https://wovain.com>, <https://github.com/sami-m-g/wovain/tree/submission/transcend>, <https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase>.

**Inspiration**

- One person ships wovain (print-on-demand drops for independent designers). After the code merges, nobody is left to review, watch deploys, triage errors or chase CVEs.
- The question you asked: can GitLab Duo be the team that runs the product after code?

**What it does**

- Every MR gets Duo Code Review with blocking-only rules; when the threads are fixed, ops asks Duo to look again and Duo approves.
- Every deploy is a 10% canary that promotes or rolls back on its own and files the evidence.
- Production errors become heal issues for a Duo flow that writes the failing test and the fix; SAST findings go to Duo Developer.
- Scout files KPI issues daily; deps-review reads Renovate bumps.
- Pick two or three real catches from section 2 (for example !164 and !177).

**How we built it**

- Custom flows in `.gitlab/duo`, synced to the AI Catalog from CI; triggers by assigning an issue or reviewer to each flow's service account.
- One ops job (TypeScript, no model calls) glues GitLab, PostHog and Cloud Run with guardrails.
- Flags as code in Pulumi, Unleash SDK, Cloud Run canary, GitLab Observability over OTLP, SCI on every pipeline.
- Claude Code wrote most of the code; Duo runs everything after it.

**Challenges**

- A canary that is too strict: eight rollbacks, mostly cold starts (#59, !161, !162).
- Duo's change request blocking merges until a re-review (!133).
- Keeping flows safe from prompt injection without blocking them (the marker gap in section 2).
- One error sink, so self-healing sees everything (!150).

**Accomplishments**

- Duo caught real bugs a solo author missed, each fixed and re-approved within hours.
- A SAST finding went to a merged fix with a Duo-authored commit (#48 to !143).
- Measured carbon per 1,000 requests, and found the agents are the main cost.

**What we learned**

- Pick only what you believe: for example, that review rules saying "blocking findings only" made Duo's comments worth reading, or that the canary needed tuning more than the code did.

**What's next**

- Close the release-guard and heal marker gap so diagnosis MRs open on their own.
- Lower the Duo footprint (fewer sessions, smaller context).
- Pick one product item from `docs/scope.md > Later`.

### Built with (check each)

gitlab, gitlab-duo, gitlab-duo-agent-platform, gitlab-ci, gitlab-observability, google-cloud-run, cloud-sql, google-cloud, pulumi, opentelemetry, posthog, unleash, renovate, typescript, nextjs, mastra, claude-code.

## 6. Video shot list (target 2:40, rule: under 3:00)

Built on the live loop: canary fault, release guard rollback and issue, heal MR, Duo review, merge, canary promote. Pre-run it once and cut the waiting; show only steps that really happened in that run. If the heal or release-guard flow still stops on the marker (section 2), replace those shots with !164 or !177 from the timeline.

| Time | On screen | Beat |
| --- | --- | --- |
| 0:00 to 0:15 | <https://wovain.com>, then the GitLab project | Solo founder, live product. What happens after the code merges? |
| 0:15 to 0:35 | Run pipeline on `main` with `CANARY_DEMO_FAULT=1`, `CANARY_WINDOW_S=120`; `canary:production` log | Every deploy goes to 10% first. This one is broken on purpose. |
| 0:35 to 0:55 | Job fails; `canary.md` artifact: canary 5xx vs stable; Cloud Run traffic back at 100% stable | Rolled back on its own, with the evidence. |
| 0:55 to 1:15 | The new `release-guard` issue (evidence table), assigned to the flow; Automate > Sessions | The audit trail, and Duo picks it up. |
| 1:15 to 1:40 | Heal or fix MR opened by the flow: failing test, fix, `heal:verify` green | Duo writes the test that proves it, then the fix. |
| 1:40 to 2:00 | Duo Code Review thread on the MR, the fix, the ops rereview note, Duo's approval | Review is blocking-only; Duo re-reviews and approves. |
| 2:00 to 2:20 | Merge; next pipeline's `canary:production` promotes to 100% | Fixed code goes through the same canary and wins. |
| 2:20 to 2:35 | Observe > Traces (a request trace), status page with DORA and SCI (21.83 gCO2e per 1,000 requests) | Watched end to end; we measure the agents' carbon too. |
| 2:35 to 2:45 | Title card: wovain.com and the repo link | Where to try it. |

Check before recording: no tokens, emails or account IDs on screen; English captions; no music you don't have rights to; upload public to YouTube or Vimeo and open it in a private window.
