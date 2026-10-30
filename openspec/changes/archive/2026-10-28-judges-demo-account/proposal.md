# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/96

## Why

Hackathon judges need one shared account on next.wovain.com that is ready for a full drop: signed in with a password from Devpost's private testing instructions, with credits, a brand and safe autonomy settings already in place. Credits must still come only from a promo code defined in code and granted through Polar's webhook, never from a manual top-up, and setting the account up must never be able to touch production.

## What Changes

- A promo can name the only accounts that may redeem it (`emails` in `BILLING_CATALOG`). To anyone else its code reads as unknown, and Polar's webhook credits no one else either.
- next's catalog (`infra/next/Pulumi.next.yaml`) gains `judges-account-2026`: 300 credits (about 17 full drops), one redemption, until 2026-12-31, for `judges@wovain.com` only. Production's catalog is unchanged.
- `pnpm --filter @wovain/auth seed:judges --env next|dev` creates `judges@wovain.com` through Better Auth's server API with a verified email and a random password, printed once. It seeds a sample brand profile (marked onboarded, so the account lands on the overview) and the `draft` autonomy level with a $5 daily and $20 monthly spend cap. It is idempotent and refuses production's Cloud SQL instance, database user and secret before connecting, and checks the server again once connected.
- The overview's setup checklist is titled "Start here".
- The README gains a demo login section; infra/README.md documents the seed through the Cloud SQL Auth Proxy.

## Capabilities

### New Capabilities

- `demo-account`: the judges' shared demo account and its seed.

### Modified Capabilities

- `billing-and-credits`: promos limited to named accounts.

## Impact

- `packages/billing`: `catalog.ts` (`emails`), `promos.ts` (`promoAllows`), `redeem.ts`, `webhooks.ts`, the test catalog.
- `packages/auth`: `judges.ts`, `seed-judges.ts`, tests; `tsx` (MIT) through the pnpm catalog to run the seed.
- `apps/web`: the checklist title in en, es and fr.
- `infra/next/Pulumi.next.yaml`: the new promo. Apply it after next runs this build: older builds refuse a catalog with `emails`.
- No database migration. Production is untouched.
