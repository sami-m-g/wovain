# Tasks

## 1. Flags as code

- [x] 1.1 Typed registry with owners, expiries, types and plan allowlists
- [x] 1.2 Pulumi strategies per environment and the `internal-only` user list
- [x] 1.3 Team members from `WOVAIN_ALLOWED_EMAILS` match `internal-only` (no manual IDs)
- [ ] 1.4 `pulumi preview` on the MR, then merge

## 2. App SDK

- [x] 2.1 `unleash-client` from the pnpm catalog, fail closed, in-memory state
- [x] 2.2 PostHog exposures (`$feature_flag_called`)
- [x] 2.3 `trends-qloo` and `trends-tavily` in trend research, by plan
- [ ] 2.4 Swap MR !116's local boolean for `isFlagOn("billing-paid-plans")` and `isFlagOn("billing-polar")`
- [ ] 2.5 Pass the merchant's plan into `Actor.plan` once billing lands

## 3. Canary and rollback

- [x] 3.1 Tagged canary revision with 10% of traffic on every web deploy
- [x] 3.2 `canary:production` verdict: promote or roll back, file the issue
- [x] 3.3 `rollback:production` for `ROLLBACK=1` pipelines
- [x] 3.4 Pulumi ignores Cloud Run traffic; the deploy account reads logs
- [ ] 3.5 First canary deploy on main, then a `CANARY_DEMO_FAULT=1` run for the video

## 4. Release guard

- [x] 4.1 `releaseGuard` ops phase: flag off or rollback pipeline, caps, issue
- [x] 4.2 `wovain release-guard` Duo flow in `wovain:duoCustomFlows`
- [x] 4.3 `DUO_RELEASE_GUARD_ACCOUNT` from `infra/duo.ts` outputs

## 5. Hygiene

- [x] 5.1 `flagHygiene` ops phase with one cleanup issue per finding
