# ADR 0001: Progressive delivery with GitLab feature flags, Cloud Run canaries and a Duo release guard

- Status: accepted (2026-10-26)
- Owner: @sami-m-g
- Related: `docs/flows.md` (flow 1, self-healing), MR !116 (`feat/billing-polar`), openspec change `add-progressive-delivery`

## Context

Every merge to `main` went to 100% of production at once (`gcloud run deploy`), and the three GitLab feature flags had a single "All users" strategy each, with their state set by hand. The self-healing flow repairs a fault after it has hurt every user. "Life after code" needs the step before healing: limit how many users a change reaches, watch it, and undo it on its own when it misbehaves, with an audit trail a person can follow.

Constraints:

- GitLab.com, hackathon Developer+ role (no Maintainer), Cloud Run, Pulumi in CI, PostHog for analytics, error tracking and KPI alerts.
- Only supported product features: no hand-rolled flag server, no hand-rolled traffic router.
- Duo flows start only for a human's action (a person's token assigns), and custom flows live in `wovain:duoCustomFlows`.
- Qloo's hackathon terms: until judging ends on 2026-11-05, Qloo may be used only on free and demo plans and must stay free for judges.
- At launch only the Free plan is sold (`billing-paid-plans` off everywhere).

## What the official docs say

**GitLab feature flags** ([docs.gitlab.com/operations/feature_flags](https://docs.gitlab.com/operations/feature_flags/), [API](https://docs.gitlab.com/api/feature_flags/)):

- Strategies: _All users_ (Unleash `default`), _Percent of users_ (`gradualRolloutUserId`, sticky for authenticated users; the client must send a user ID), _Percent rollout_ (`flexibleRollout`, stickiness by user, session, random or available ID), _User IDs_ (`userWithId`) and _User list_ (`gitlabUserList`, sent to clients as `userWithId`).
- Each strategy has environment scopes. Removing an environment from every strategy turns the flag off there; the flag's _Status_ toggle turns it off everywhere.
- The client uses the Unleash API URL, the project's instance ID, and the **environment name as the Unleash app name**.
- Limits: 50 flags per project on GitLab.com Free, 150 Premium, 200 Ultimate. The Unleash endpoint counts as unauthenticated traffic, limited per source IP: at one poll per 15 s about 125 clients share a quota.
- Not compatible with Unleash Edge, and the Unleash Proxy is deprecated (end of life 2026-11-26). The docs list no constraints, variants, metrics or frontend API, so we assume none: plan targeting and browser evaluation must happen in our app.
- REST: `PUT /projects/:id/feature_flags/:name` with `active`, Developer role. Responses carry `active`, `updated_at` and `strategies`.

**GitLab progressive delivery** ([docs.gitlab.com/ci/environments/incremental_rollouts](https://docs.gitlab.com/ci/environments/incremental_rollouts/)): incremental and timed rollouts are a CI pattern (jobs that raise the share, gated by checks); GitLab's built-in canary deployments are Kubernetes-only. On Cloud Run the traffic split itself comes from Cloud Run.

**Cloud Run** ([rollouts, rollbacks and traffic migration](https://docs.cloud.google.com/run/docs/rollouts-rollbacks-traffic-migration)):

- `gcloud run deploy SERVICE --image IMAGE --no-traffic --tag TAG` creates a revision with no traffic and a tag URL `https://TAG---SERVICE-HASH.a.run.app`. `--no-traffic` pins traffic that pointed at LATEST to the revision serving it before.
- `gcloud run services update-traffic SERVICE --to-tags TAG=PERCENT` (or `--to-revisions REV=PERCENT`) splits traffic; percentages total 100.
- Rollback: `update-traffic --to-revisions PREVIOUS=100`. It's immediate, with no health check of the target; later deploys keep the split until `--to-latest`.
- IAM: `roles/run.developer` on the service and `roles/iam.serviceAccountUser` on its runtime identity.

**DORA** ([dora.dev/guides/dora-metrics-four-keys](https://dora.dev/guides/dora-metrics-four-keys/)): deployment frequency and change lead time measure throughput; change failure rate and failed deployment recovery time measure stability. Small changes reach few users first, and fast rollback lowers both the failure rate and the recovery time. The status page already reports these (`apps/ops/src/status.ts`).

## Decision

### 1. One typed flag registry, applied as code

`packages/core/src/flag-registry.ts` lists every flag with its type (`release`, `kill-switch`, `permission`, `ops`), owner, expiry, optional plan allowlist, whether the release guard may switch it off, and a rollout per GitLab environment: `off`, `internal` (the `internal-only` user list), `percent` (that list plus _Percent of users_, its own group ID per flag) or `all`.

`infra/flags.ts` turns the registry into `gitlab.ProjectFeatureFlag` strategies and one `gitlab.ProjectFeatureFlagUserList` (`internal-only`, Better Auth user IDs from `wovain:internalUserIds`). A rollout step is therefore a reviewed merge request with a Pulumi preview. The Status toggle is the global **kill switch**: Pulumi sets it once and then ignores it, so people and the release guard can flip it without drift. `trends-tavily` and `trends-qloo` are kill switches by type: on in normal operation, turned off to cut a dependency.

| Flag | Type | Owner | Production | Development | Expires |
| --- | --- | --- | --- | --- | --- |
| `app-ui-v2` | release | design | internal | all | 2026-12-31 |
| `autopilot` | release | runs | internal | all | 2026-12-31 |
| `billing-paid-plans` | permission | billing | off (Status off) | off | 2027-01-31 |
| `billing-polar` | release | billing | internal | all | 2026-12-15 |
| `fal-oauth` | release | connectors | internal | all | 2026-12-31 |
| `fault-injection-checkout` | ops | platform | all (Status off) | all | 2027-03-31 |
| `mastra-runs` | release | runs | internal + 10% of users | all | 2026-12-31 |
| `trends-qloo` | kill-switch, free and demo plans only | growth | all | all | 2026-11-05 |
| `trends-tavily` | kill-switch | growth | all | all | 2027-06-30 |

### 2. The official Unleash Node SDK, server-side only

`packages/core/src/flags.ts` wraps `unleash-client` (pnpm catalog):

- Context: `userId` (GitLab's user lists and percentages match it), `plan` and `internal` as properties, the environment as the app name.
- **Fail closed**: until the SDK has fetched GitLab's flags, and for any flag GitLab doesn't return, the answer is `false`. Storage is in memory only, so a cold start never serves a stale backup file. Without any GitLab URL (laptops, tests) the registry's development rollout answers.
- **Plan gating in the app**: GitLab has no constraints, so a flag's `plans` allowlist is checked before GitLab. `trends-qloo` is `["free", "demo"]`: paid plans get Tavily-only trends even if the flag is on, which keeps Qloo out of paid products after paid plans open.
- **Exposures to PostHog**: the first answer per user, flag and value is a `$feature_flag_called` event with `$feature_flag`, `$feature_flag_response` and `$feature/<flag>`, so any KPI insight breaks down by flag value.
- **No browser SDK**: GitLab offers no frontend API, and `@unleash/nextjs` needs one (or an Unleash Edge, which GitLab doesn't support). Client components get values as props from a server component (`core.flags.snapshot`).
- Flag names are the registry's keys (`FlagName`): a typo fails `tsc`.

### 3. Canary on every production deploy

`deploy:production` deploys the web image with `--no-traffic --tag canary` and moves `CANARY_PERCENT` (10%) to the tag. `canary:production` (`apps/ops/src/canary.ts`, the official `@google-cloud/run` client) then, for `CANARY_WINDOW_S` (10 minutes):

- probes the tag URL (`/`, `/api/auth/ok`) every 30 s;
- counts 5xx responses per revision in Cloud Logging (`resource.labels.revision_name`);
- reads firing PostHog `kpi:` alerts and PostHog error-tracking exceptions since the deploy.

Verdict: **promote** (100% to the canary revision, tag removed) or **roll back** (100% to the stable revision, canary keeps 0% and its tag for debugging). Every verdict is a note in the job log, a GitLab deployment, and on rollback a `release-guard` issue with the evidence.

### 4. The release guard after promotion

The ops job (every 10 minutes, and right away from PostHog destinations) gets a `releaseGuard` phase. When production degrades within 24 hours of a deploy or a flag change (5xx ratio over the threshold in Cloud Logging, a new error-tracking spike, or a firing `kpi:` alert):

1. If a guarded flag changed in the last 24 hours, it switches that flag's Status off through the GitLab API (the kill switch).
2. Otherwise it starts a `ROLLBACK=1` pipeline, whose `rollback:production` job (the deploy account, the production environment) moves 100% back to the previous revision.
3. It opens a `release-guard` issue (and incident) with the evidence and assigns it to the custom Duo flow **`wovain release-guard`**, which reads the issue, the deploy's commits and the flag, writes the diagnosis and, when the cause is clear, opens a fix or revert MR that goes through the usual Duo Code Review and guardrails.

Caps: one automatic action an hour, three a day. Nothing is switched back on automatically: a person re-enables the flag or re-deploys.

### 5. Hygiene

The ops job's `flagHygiene` phase compares GitLab's flags with the registry and opens one `flag-cleanup` issue per flag (deduplicated by a marker, assigned to the owner) when a flag is past its expiry, a `release` flag has served all of production for 14+ days, or a flag exists only in GitLab or only in the registry.

## Consequences

- Each deploy reaches 10% of production for 10 minutes first; a bad one never reaches everyone, and failed deployment recovery time becomes the canary window.
- `pulumi up` must not undo CI's traffic split: the Cloud Run service ignores `traffics`, as it already ignores the image.
- The deploy account reads logs (`roles/logging.viewer`) for the canary verdict; the ops account stays read-only and asks for a rollback through a pipeline.
- Rollout state lives in two places by design: strategies in code (reviewed), Status in GitLab (fast kill switch). The registry comment and AGENTS.md say which is which.
- Fail closed means a GitLab outage at cold start turns trends off for 15 seconds at most per instance. That is the price of never serving Qloo to a paid plan by accident.
- A flag that GitLab can't express (plan targeting) is enforced in code and covered by tests, not by GitLab.

## Rejected

- **PostHog feature flags for everything**: good exposure analytics, but the hackathon is about GitLab, and GitLab's flags give the Duo flows a native, audited API.
- **`@unleash/nextjs` and browser evaluation**: needs an Unleash frontend API or Edge, which GitLab doesn't provide.
- **GitLab canary deployments**: Kubernetes only.
- **Cloud Deploy canaries for Cloud Run**: supported, but a second delivery system next to GitLab CI and Pulumi, more than a hackathon needs.
- **Hand-rolled plan check outside the registry**: the plan allowlist lives with the flag, so the rule and its tests sit in one place.
