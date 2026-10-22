# wovain at GitLab Transcend: Life After Code

wovain is Path B: an existing project, live at `https://app--wovain.us-central1.hosted.app/mcp` (add it as a remote MCP server in ChatGPT or Claude). It's an MCP server that takes a print-on-demand seller from an idea to a Fourthwall product, two video ads and a paused Meta Advantage+ campaign in one chat. This page lists, for each prize, what wovain does and where to see it.

## The idea: the post-code lifecycle drives itself

Once a change merges, wovain's lifecycle runs without anyone at the keyboard. Production telemetry turns into intents, intents into Duo's merge requests, merge requests into reviewed, auto-merged deploys, and deploys into measured outcomes that close or reopen the intent. People set direction and approve risky plans; the loop does the rest.

It follows the shape of Anthropic's AI-native SDLC: every change carries its **intent**, **spec**, **plan** and **verify** documents (`docs/changes/<issue>-<slug>/`). A person accepts the intent and approves risky plans; agents (Claude Code, GitLab Duo) build; and verification is evidence from production, not a checkbox. The self-healing loop is the same cycle run backwards, starting from what production says.

## Stage 1: GitLab Duo Agent Platform

| What | Where |
| --- | --- |
| Three built-in flow triggers, declared as code and filtered to human actions or a red `main`: Developer (assign, mention), Code Review (reviewer requested, ready), Fix CI/CD (failed push pipeline on `main`) | `infra/Pulumi.prod.yaml`, `infra/duo.ts` |
| The loop chains them: it assigns scout issues to the Developer flow, marks Duo's MRs ready or requests Duo Code Review, and asks the Developer flow to address review threads | `apps/ops/src/scout.ts`, `apps/ops/src/shepherd.ts`, [loop.md](loop.md) |
| Code Review reads project rules (spending, tool inputs, no hand-rolling, secrets, widgets) | `.gitlab/duo/mr-review-instructions.yaml` |
| A custom flow and a custom agent in the AI Catalog, validated and synced by GitLab's `ai-catalog` component, then enabled as code: the scout flow (a pipeline trigger only the weekly schedule's child pipeline fires, with a fixed prompt) and the read-only **wovain explain** agent (explains pipeline and MR failures; no write tools) | `.gitlab/duo/catalog/`, `wovain:duoCustomFlows` and `wovain:duoCustomAgents` in `infra/Pulumi.prod.yaml` |
| Agent skills every Duo flow reads | `.agents/skills/` |

## Path B "Hands-off": an autonomous post-code lifecycle

The hourly `wovain loop` schedule ([loop.md](loop.md), with its diagram):

1. **Observe.** It reads Cloud Logging, Cloud Monitoring and GitLab Observability (error spans, once its API key is set) and groups errors by fingerprint. It reads only fields the server controls: the route template Hono matched, the error class (checked against an allowlist) and the status, never a log message or URL.
2. **Intent.** It files each new problem as a `scout` issue titled `scout: <ErrorClass> on <ROUTE> (<status>)`. A known class on a known route that Cloud Logging saw goes to the Duo Developer flow; anything else is a `status::intent` issue for a human ([loop.md](loop.md#untrusted-input)).
3. **Fix and review.** Duo writes the MR; the loop marks it ready or requests Duo Code Review, once per commit.
4. **Merge.** GitLab's auto-merge, set by the loop only when provenance is proven (the loop filed and assigned the issue, GitLab links the MR to it, and a Developer session that assignment started produced it), every path is low-risk application source or tests (nothing that signs in, holds credentials, spends or launches ads), the change is at most 100 lines, Duo reviewed the head commit, none of its threads is open, no one else wrote on the MR and the pipeline is green. No agent merges.
5. **Deploy.** The `main` pipeline applies infra, deploys, smoke-tests and releases; a red `main` goes to Duo Fix CI/CD.
6. **Verify.** Two or more hours after the merge, it compares the error rate before and after, then closes the issue with the numbers or reopens it for another try.

Evidence: !50 (loop, triggers, guardrails, tests), the `loop` job logs, and the `digest` issue's daily comments.

## Most Stages Covered

All nine stages run on their own; the README's [DevSecOps stages](../README.md#devsecops-stages) table maps each to its feature, flow or job. Built-ins first: Duo Developer, Code Review and Fix CI/CD; GitLab SAST, Secret Detection and Dependency Scanning; GitLab Observability; auto-merge; releases and environments. Where a model isn't needed, code does the work: the scout turns production errors into intents and the market scout turns competitors' news into one, without an LLM holding write tools. The one custom agent is read-only. We dropped two earlier triage agents after a security review: agent YAML can't scope a write tool to one issue, so an agent reading untrusted text could have written anywhere.

Evidence: README, !50, !51 (Monitor: funnel metric, weekly analysis, market scout), !53 (SCI), the docs MR for #29.

## Most Environmentally Impactful

**14.27 gCO2e per idea-to-paused-campaign run** (Green Software Foundation SCI, ((E × I) + M) per R, us-central1 at 432 gCO2e/kWh location-based), recomputed by the `sci` job on every `main` pipeline. Gains: scale to zero avoids about 334 gCO2e a week against an always-on instance, scheduled pipelines skip the scanners (about 262 CI minutes and 29 gCO2e a week), Duo triggers are filtered to human actions, the loop and the market scout make no model calls, and the shepherd checks paths, size and provenance before it spends a review. Every estimate is labeled.

Evidence: [sustainability.md](sustainability.md), README "Sustainability (SCI)", !53, the `sci` job's "SCI report" artifact.

## Most Creative

- An MCP server whose product and its own upkeep are both agentic: merchants work with agents in chat, and agents keep wovain running.
- The market scout closes the loop with the product: each week it reads competitors' news and wovain's own funnel (connect → idea → set approved → ad approved → campaign created → autopilot run) and proposes the next intent where merchants drop off.
- Auto-merge that can prove where a change came from: GitLab's session API, closing links and reviewer states, not text in the MR.

Evidence: !51, [architecture.md](architecture.md).

## Blocked by Maintainer-only settings

Our hackathon role is Developer+, a custom role that can manage merge request settings, AI Catalog items and their consumers, flow triggers, CI/CD variables, webhooks and Terraform state. Everything it can reach through an API is in `infra/`. These still need a Maintainer or Owner, or have no API for our role; wovain works around each, and turning any of them on makes it stronger:

| Setting | Effect today | Workaround |
| --- | --- | --- |
| Enable flows in the top-level group | Custom flows and agents can be enabled in the project (GitLab adds the group consumer), but not configured for the whole group | The scout flow and the explain agent are enabled in the project from `infra/` |
| A Duo schedule for the scout flow | A `scheduled` trigger runs as a service account GitLab creates in the project, which needs `create_service_account` | The weekly schedule starts a one-job child pipeline whose success is the scout's trigger; the hourly CI job does the scout's work in between, without credits |
| Automatic Duo review, SAST false-positive detection, Resolve SAST | Off. The SAST AI flows aren't available to our role, and we don't replace them with a custom agent | The loop requests Code Review; scanners run on every MR and a person triages findings |
| "Pipelines must succeed", "All threads must be resolved" | Our role can tick them in the UI, but `PUT /projects/:id` needs `admin_project` and GraphQL has no mutation for them, so they can't be code | Auto-merge waits for the pipeline, the loop never sets it on a failed head pipeline, and it counts open threads across every discussion page |
| "Require approval from code owners" | CODEOWNERS only requests reviewers | The guardrails keep every non-application path away from auto-merge |
| Approval rules | Not set: a required human approval would stop the loop's auto-merge on Duo's MRs | The guardrails and Duo Code Review gate auto-merge |
| Protected branches and environments | Managed in the UI | `main` takes only merges; deploy jobs run in their environments |
| Error tracking | Off | Errors come from Cloud Logging and GitLab Observability |
| OTLP ingestion token enforcement in GitLab Observability | Off: the OTLP endpoint accepts telemetry without a token, so anyone could send spans that look like the server's. Turning it on needs Observability's Editor role or an administrator (docs.gitlab.com, operations/observability/ci_cd), which in practice is a group Owner | The scout reads no text from Observability, and a problem only Observability saw goes to a human, never to Duo |

Also manual, with no API for our role: the GitLab Observability API key (group → Observe → API Keys, then `pulumi config set --secret o11y-api-key` in `infra/`).
