# The self-healing loop

wovain finds its own production errors, has GitLab Duo fix them, and checks that the fix worked. A person reads the digest and steps in only when the loop hands something back.

```mermaid
flowchart TD
  prod["Production: App Hosting (Cloud Run service app)"]
  subgraph signals["Signals"]
    cl["Cloud Logging: the server's structured error lines (route template, error class, status)"]
    o11y["GitLab Observability: mcp.request error spans (SigNoz API)"]
    mon["Cloud Monitoring: request_count"]
  end
  prod --> cl & o11y & mon
  sched(["Pipeline schedule 'wovain loop', hourly"]) --> loop["loop job: apps/ops/src/loop.ts"]
  cl & o11y --> scout["scout: allowlisted class, route and status only; group by fingerprint, at least 3 in 6 h"]
  loop --> scout
  scout -->|"known class on a known route, seen in Cloud Logging: issue labeled scout, assigned to Duo Developer (human token)"| dev["Duo Developer flow (assign trigger)"]
  scout -->|"anything else"| intent["status::intent issue for a human, no Duo"]
  dev -->|"MR: Closes #issue, on a branch named for it"| shep["shepherd (same job)"]
  shep -->|"app code only: marks ready and requests reviewer (human token)"| cr["Duo Code Review flow (assign_reviewer trigger)"]
  cr -->|"Duo's open threads: asks Developer once (mention)"| dev
  cr -->|"reviewed, no open Duo threads, no notes from anyone else"| guard{"Guardrails: provenance proven, low-risk app source only, at most 10 files and 100 lines, Duo reviewed the head commit, pipeline ok"}
  guard -->|pass| am["Auto-merge set (PUT merge_requests/:iid/merge auto_merge=true, sha pinned)"]
  guard -->|fail| human["Comment: needs a human"]
  am -->|"GitLab merges when the pipeline is green"| main["main pipeline: verify, scan, pulumi up, deploy, smoke, release"]
  main -->|"red main"| gate{"Fix gate (same job): code job, code failure, new fingerprint, failed twice, no open Duo fix, at most 1 an hour and 3 a day"}
  gate -->|pass| fix["Duo Fix CI/CD flow (started through the API)"]
  gate -->|"infra, auth, quota, network"| redintent["red-main status::intent issue for a human, no Duo"]
  main --> prod
  mon & cl & o11y --> verify["verify: errors per request, 24 h before the merge vs since"]
  loop --> verify
  verify -->|"down 80% or more"| closed["Comment evidence, label verified, close"]
  verify -->|"no drop after 24 h"| reopen["Reopen, reassign Developer (2 tries), then status::todo for a human"]
  reopen --> dev
  loop --> digest["Daily digest comment on the digest issue"]
```

## Who does what

| Step | Done by | How it starts |
| --- | --- | --- |
| Read errors, file an intent | `loop` CI job (`apps/ops/src/scout.ts`) | Hourly pipeline schedule `wovain loop` (`infra/gitlab.ts`) |
| Write the fix and open the MR | Duo Developer flow | The job assigns the issue to `duo-developer-gitlab-ai-hackathon` (the `assign` trigger) |
| Review | Duo Code Review flow | The job marks the draft ready and requests the reviewer (`assign_reviewer`), only for application code |
| Address review threads | Duo Developer flow | The job mentions it once on the MR (`mention`) |
| Merge | GitLab auto-merge | The job sets it after the guardrails pass; GitLab merges when the pipeline is green |
| Fix a red main | Duo Fix CI/CD flow | The job starts it through the API when the fix gate passes (`apps/ops/src/red-main.ts`) |
| Deploy and smoke test | `main` pipeline | The merge |
| Check the fix, close or reopen | `loop` CI job (`apps/ops/src/scout.ts`) | The next hourly run, two hours or more after the merge |

## Why a CI job chains the flows

GitLab starts a flow only for a person's action. `RunService` refuses non-human users (`ee/app/services/ai/flow_triggers/run_service.rb`, "cannot be triggered by non-human users"), and the event workers skip events a flow caused unless the `ai_flow_trigger_chaining` feature flag is on (`ee/app/workers/concerns/ai/cloud_events_flow_trigger_worker.rb`). So the Developer flow opening an MR never starts Code Review by itself. The loop job acts with `GITLAB_TOKEN`, a person's access token, so its assignment, ready and reviewer requests are human actions and each starts the next flow. The Developer flow supports only the `assign` and `mention` triggers (`ee/app/models/ai/catalog/foundational_flow/developer/definition.rb`), which is why the job assigns instead of relying on an issue-created trigger.

The custom scout flow (`.gitlab/duo/catalog/flows/scout.yml`) is enabled in the project with a pipeline trigger (`wovain:duoCustomFlows`, `infra/duo.ts`) that fires only on a successful child pipeline on `main`. Only the weekly schedule's `scout:duo` job creates one (`.gitlab/ci/scout-signal.yml`), so the Duo scout checks `main` and production once a week. Its prompt is fixed text, so no comment or pipeline field reaches it. A `mention` trigger would let anyone who comments steer it. It can't have its own schedule: a `scheduled` trigger runs as a service account GitLab creates in the project, and that needs `create_service_account`, which our role doesn't have.

## Untrusted input

Anyone who can send a request to production can put text into its logs: an error message, a URL, a header. The scout's issues go to the Duo Developer flow, and its MRs can be auto-merged, so that text must never reach an issue. The scout builds issues only from fields the server controls (`apps/ops/src/signals.ts`, tested in `apps/ops/test/signals.test.ts` and `scout.test.ts`):

- **What the server logs.** `apps/server/src/lib/request-errors.ts` writes one JSON line per failed request: the route pattern Hono matched with the method it was registered for (never the raw path), the error's class name (never its message) and the status. Cloud Run turns it into `jsonPayload.wovain`.
- **What the scout reads.** Cloud Logging entries from the service's own stdout and stderr logs, filtered by the labels Cloud Run sets (project, location `us-central1`, service and configuration `app`, revisions `app-*`), never the request log, which carries raw URLs. From GitLab Observability, only the `error.type` and status of the server's `mcp.request` spans. No log message, sample or log body is read.
- **Allowlists.** The error class must be on a list of known class names, or it becomes `UnknownError`; the route must be one the server registers, or it becomes `UnknownRoute`. The title is always `scout: <ErrorClass> on <ROUTE> (<status>)`, and the body lists the class, route, status, count, window, sources and fingerprint.
- **Who gets it.** Duo gets a problem only when its class and route are both known and Cloud Logging saw it. Anything else is filed as `status::intent` for a human and isn't assigned. GitLab Observability's OTLP endpoint accepts telemetry without a token until enforcement is on (docs.gitlab.com, operations/observability/ci_cd), so a problem only it saw is never handed to Duo. Turning enforcement on needs Observability's Editor role or an administrator, which our Developer role doesn't have (docs/transcend.md). A red `main` goes to the Fix CI/CD flow only through the fix gate below, and the flow gets the pipeline's URL as its goal, nothing from the log.

## Guardrails

Auto-merge is set only when all of these hold (`apps/ops/src/guardrails.ts`, tested in `apps/ops/test/guardrails.test.ts`):

- **Provenance.** The issue was filed by the loop's user, carries its marker and the `scout` label, and is assigned to the Developer service account, with the loop's "assigned" marker note. The MR's author is that service account. GitLab binds the MR to the issue: `closes_issues` lists it, or the source branch carries its number. Text in the MR is never trusted. A Duo session (GraphQL `duoWorkflowWorkflows`) with definition `developer/*`, source `FLOW_TRIGGER`, started by the loop's user on that issue after the assignment, and linked to this MR must exist; a session not linked to it yet means a person decides.
- **Allowlist.** Every changed path is low-risk application source or its tests: `apps/server/src/lib/**` and `apps/server/src/tools/**`; `apps/server/test/unit|integration/**`; `apps/widgets/src/**`; `packages/shared/src/**`. Anything that signs in, holds credentials, spends money or launches ads is denied inside those trees: `auth/`, `routes/`, `lib/{launch-approvals,connections,cipher,oauth-client,upstream,approval}.ts`, `lib/meta-*`, `lib/browser-*`, `lib/autopilot-*`, `lib/optimizer/`, `tools/{meta,connections,campaign,publish,autopilot}.ts` and `packages/shared/src/optimizer/`. So are what the scout reads (`lib/request-errors.ts`, `lib/tool-result.ts`) and the fetch guards (`lib/fetch-*`). The server's entry points and `playbooks/` aren't allowed at all. Dotfiles, `*.config.*`, `tsconfig*`, `package.json`, YAML, JSON, lockfiles and rules files are denied inside those trees too. Everything else (`apps/ops/**` itself, `infra/`, `.gitlab/`, CI files, `.agents/`, `.claude/`, `AGENTS.md`, docs) needs a human. `.gitlab/CODEOWNERS` lists the same paths, so a person is requested as reviewer.
- **Size.** At most 10 files and 100 changed lines.
- **Review freshness.** The commit Duo Code Review covered equals the MR's head `sha`: a diff note names it (`position.head_sha`); a general note is matched to the MR version current when it was written (`GET merge_requests/:iid/versions`). Commit dates aren't used. Duo's state in the reviewers API is reviewed, approved or requested_changes (`unreviewed` means it's still running). Duo didn't request changes, and none of Duo Code Review's threads is open, counted over every page of the MR's discussions (the project's `blocking_discussions_resolved` is always true while "All threads must be resolved" is off, so it isn't used). The loop asks for a review once per head commit and hands a review that hasn't landed in 2 hours to a person.
- **Who wrote on it.** Every note on the MR is from Duo Code Review, the Developer flow, the loop's user or GitLab itself. A note from anyone else hands the MR to a person, and the loop asks the Developer flow to act only on Duo Code Review's threads.
- **State.** Not a draft, no conflicts, and the head pipeline (from the single-MR endpoint) is on the head `sha` and created, pending, running or successful.

The path, size and provenance checks run before any review is requested, so an MR that can't be auto-merged spends no review credits.

GitLab still waits for the green pipeline: auto-merge (`auto_merge=true` on the merge API, with the reviewed `sha` pinned) merges only when it passes, and a new push cancels it. The project setting "Pipelines must succeed" needs a Maintainer and is off, so the loop never sets auto-merge on an MR whose pipeline failed.

## Red main: the fix gate

The `pipeline_hooks` trigger used to start Fix CI/CD on every failed push to `main`. On 2026-10-22 it ran about 7 times in 30 minutes on infra permission 403s and a Google Cloud auth 404, which no code change can fix, and spent about 18 credits. GitLab's trigger filters accept only status, source, ref, default branch and merge request title (`ALLOWED_FILTER_FIELDS` in `ee/app/models/ai/flow_trigger.rb`), so they can't dedupe or tell one job from another. The trigger is now off (`active: false` in `infra/Pulumi.prod.yaml`), and the hourly loop job decides instead (`apps/ops/src/red-main.ts`, rules in `apps/ops/src/gates.ts`, tested in `apps/ops/test/gates.test.ts` and `red-main.test.ts`).

It looks at the latest push pipeline on `main`, and waits while one is running. When it's green, it closes the open `red-main` issues. When it's red, it starts Duo only if all of these hold:

- **Code job, code failure.** Every failed job is one of `verify` (lint, types, knip, arch, dupes, unit tests), `build`, `integration`, `stories` or `e2e`; GitLab's `failure_reason` is `script_failure`; and the end of the job's log matches none of the fixed auth (401, 403, 404, `PERMISSION_DENIED`, `invalid_grant`), quota (`RESOURCE_EXHAUSTED`, 429, credits) or network (`ECONNRESET`, `EAI_AGAIN`, 502 to 504, pnpm fetch errors) patterns. The log is only matched; no text from it goes into an issue or to Duo. `infra:production`, `deploy:*`, `sci`, `mirror:github`, `release`, `renovate` and the rest never go to Duo.
- **New.** Each failure's fingerprint is a hash of the job name, its class and the failed tests from the pipeline's JUnit test report (`verify`, `integration`, `stories` and `e2e` publish `junit.xml` in CI). Each fingerprint gets one `red-main` issue, which records whether Duo already ran for it (`agent::duo`); Duo runs once per fingerprint.
- **Not a flake.** The same fingerprint failed the previous `main` pipeline too, or the loop retried the job once and it failed again. A first failure gets that one retry and no Duo.
- **Nothing in flight.** No open merge request from the Fix CI/CD service account, and no `fix_pipeline/v1` session still running.
- **Rate limits.** At most 1 Fix CI/CD run an hour and 3 a day (`MAX_FIX_RUNS_PER_HOUR`, `MAX_FIX_RUNS_PER_DAY`), counting every `fix_pipeline/v1` session in the project, including ones a person starts from the UI.

A failure Duo can't fix gets one `status::intent` issue per fingerprint for a human, and no Duo call. The loop starts the flow the way the pipeline page's "Fix pipeline with Duo" button does: `POST /api/v4/ai/duo_workflows/workflows` with the project's Fix CI/CD catalog consumer, the pipeline URL as the goal and `start_workflow: true` ([docs](https://docs.gitlab.com/api/duo_agent_platform_flows/)). Our Developer+ role can call it: the same request without `start_workflow` returns 201 after GitLab's `execute_ai_catalog_item` check and creates no session.

## Credits

Only the Duo flows spend credits, and they bill the person behind `GITLAB_TOKEN`; a Fix CI/CD or Code Review run costs about 3. The job keeps that small: at most one new issue per run, at most two scout issues with Duo at once, two Developer attempts per problem, one review fix round per MR, and the fix gate for red main (at most 3 Fix CI/CD runs, about 9 credits, a day, and none for infra, auth, quota or network failures). Code Review starts only when someone requests Duo as reviewer: the `merge_request_ready` event is off, the shepherd asks only for application code, and the `/issue` skill skips docs-only, lockfile-only and Renovate MRs (`reviewSkipReason` in `apps/ops/src/gates.ts`).

## Sources and what's not read yet

- Cloud Logging and Cloud Monitoring, as the `gitlab-ops` service account (logs and metrics viewer only), through Workload Identity Federation from the `operations` environment.
- GitLab Observability's query API (error spans only, never log bodies), once someone with the Developer role on the group creates an API key (group → Observe → API Keys) and sets it with `pulumi config set --secret o11y-api-key` in `infra/`. Until then the loop reads Google Cloud only and says so in its report. The server sends traces to the group's OTLP endpoint already (`apphosting.yaml`).
- GitLab error tracking needs a Maintainer to turn on, so the loop doesn't use it.

## Known limits

- A read takes at most 5,000 Cloud Logging entries and 500 GitLab Observability rows per window, so a flood of errors is undercounted. That makes the "before" window look smaller, never the fix look better than it is, as long as the "after" window is under the cap.
- Each unverified scout issue with a merged MR costs two Cloud Logging reads an hour, for at most 24 hours.
- Code owner approval isn't required: "Require approval from code owners" on the protected branch needs a Maintainer. CODEOWNERS only requests the reviewer, and the guardrails keep those paths out of auto-merge.
- Each phase (verify, scout, shepherd) runs even when another fails; failures go in the report and fail the job, so the pipeline shows them.
