# Proposal

MR: !121 (`feat/progressive-delivery`). Status: in review. Design: `docs/adr/0001-progressive-delivery.md`.

## Why

Every merge went to all of production at once, and the GitLab feature flags were three "All users" toggles flipped by hand. The self-healing flow fixes a fault after it has hit every user. Life after code needs the step before healing: reach few users first, watch, and undo on its own, with an audit trail.

## What Changes

- A typed flag registry (`packages/core/src/flag-registry.ts`) with owner, expiry, type, plan allowlist and a rollout per environment, applied to GitLab by Pulumi (`infra/flags.ts`): an `internal-only` user list, "Percent of users" rollouts, and the Status toggle as the kill switch.
- New flags: `billing-polar`, `billing-paid-plans` (off everywhere: only Free is sold at launch), `mastra-runs`, `app-ui-v2`, `fal-oauth`, `trends-qloo` (free and demo plans only until Qloo judging ends on 2026-11-05).
- The official Unleash Node SDK (`unleash-client`, pnpm catalog) server-side: context with user ID, plan, environment and internal; fail closed; PostHog `$feature_flag_called` exposures.
- Trend research uses `trends-qloo` and `trends-tavily`: paid plans get Tavily-only trends.
- A canary for every web deploy: a tagged Cloud Run revision with 10% of traffic, promoted or rolled back by `canary:production` (`@google-cloud/run`).
- A release guard in the ops job: on an error spike after a flag change or deploy, switch the flag off or start a `ROLLBACK=1` pipeline, then file a `release-guard` issue for the new `wovain release-guard` Duo flow.
- Flag hygiene: cleanup issues for expired, fully rolled out or unregistered flags.

## Capabilities

### New Capabilities

- `progressive-delivery`: how changes reach production gradually, and how they are undone and cleaned up without a person.

### Modified Capabilities

- `delivery-ops`: the deploy job canaries the web app; Pulumi no longer owns Cloud Run traffic.

## Impact

`packages/core` (registry, SDK, trends), `packages/api` (ideas flow), `apps/web` (flag helper, quote route), `apps/ops` (canary, release guard, hygiene), `.gitlab/ci` (deploy, rollback), `.gitlab/duo/catalog/flows/release-guard.yml`, `infra/` (flags, labels, the deploy account's `roles/logging.viewer`, `traffics` ignored). People add their Better Auth user IDs to `wovain:internalUserIds` and confirm the release-guard flow's service account name once it is enabled.
