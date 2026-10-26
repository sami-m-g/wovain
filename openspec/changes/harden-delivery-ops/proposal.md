# Proposal

MRs: !112 (`fix/status-domain`), !113 (`fix/duo-triggers`), !114 (`chore/renovate-deps-review`), !117 (`fix/duo-heal-in-code`). Status: in review.

## Why

Delivery has gaps that a person had to cover by hand: `status.wovain.com` never resolved, Duo Code Review skipped merge requests nobody assigned it to (!69 to !111 got no review), dependency updates had no policy, and custom Duo flows had to be enabled in the UI.

## What Changes

- !112: serve `status.wovain.com` through a Cloud Run domain mapping and proxy GitLab Pages from the web app; drop the Pages custom-domain path.
- !113: the `duo-code-review` trigger also fires when a merge request is created (about 0.25 Duo credit each).
- !114: Renovate policy (patch automerge, weekly grouped minors, dashboard approval for majors, OSV alerts, Drizzle rc only, pinned pnpm and Pulumi) and a read-only `deps-review` Duo flow that posts one verdict and opens `adopt:` issues.
- !117: enable every custom Duo flow in code (`infra/duo.ts`), including `heal`, with no Maintainer step.

## Capabilities

### New Capabilities

- `delivery-ops`: how code is reviewed, updated and kept running without manual steps.

### Modified Capabilities

None.

## Impact

`infra/` (Pulumi: domain mapping, Duo triggers and consumers), `apps/web` host rewrite, `.gitlab/renovate.json`, `.gitlab/duo/` flows and review instructions. People still need to add a read-only `GITHUB_COM_TOKEN` CI variable for !114 and confirm the deps-review service account name.
