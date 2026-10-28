# ADR 0004: Production deploys from a release branch; main deploys to next.wovain.com

- Status: proposed
- Date: 2026-10-28

## Context

wovain.com is the GitLab Transcend entry. The hackathon judges "the project as it was at the deadline" and warns that changes after it, even small ones, can put the submission at risk. Winners are announced about **2026-11-16**. Until then production must keep running the deadline build, stay free for judges, and keep its running dependencies (secrets, Cloud SQL, provider credits) stable.

Live production, read on 2026-10-28:

- `wovain-web` runs `web:5b47472d0fb30e822155c1420c1f40598ce5d2a4` (revision `wovain-web-00161-pac`, 100% of traffic). GitLab CI deployed it on 2026-10-27.
- `wovain-docs` runs `docs:1af48d04bfa345060e2475d620b6d5e846f26958`. `1af48d0..5b47472` changes only `apps/web`, so `5b47472` matches both.
- That build reads GitLab feature flags (`GITLAB_FEATURE_FLAGS_*`) and the GitLab OTLP settings. main no longer has them.

Work on main goes on for the Qloo hackathon (judging November 2 to 5) and the Nebius hackathon (December 1 to 15). Both need a live URL.

## Decision

**Production** (wovain.com, docs.wovain.com) deploys only from the branch `release/transcend`, which starts at `5b47472`.

- The release branch has the same rules as main: no deletion, no force-push, changes only through a pull request with a passing `verify` check (`infra/github.ts`, ruleset `release`).
- `.github/workflows/deploy.yml` deploys it in the `Production` GitHub environment. Only the release branch can deploy there, and only after a required reviewer approves. Google trusts the production deploy account only from that environment. The workload identity provider accepts the release branch only in `Production` (`infra/bootstrap`).
- Until about 2026-11-16, the release path is for emergencies only: a fix that keeps the judged build working, and only after the hackathon allows it in writing (Devpost). Every other fix goes to main.
- `pulumi up` from main never rolls out a new production revision while `wovain:freezeProduction` is true (the default). The `wovain-web` and `wovain-docs` templates (image, env, secrets, scaling) stay as they are live.

**main** deploys to **next.wovain.com** (Cloud Run `wovain-web-next`) in the `next` GitHub environment, with no approval. It is a new environment that owns all its resources and shares nothing with production:

|  | Production | next |
| --- | --- | --- |
| Database | `wovain` on the `wovain` instance | `wovain_next` on its own instance, `wovain-next` (`db-f1-micro`) |
| Migrations | from the release branch, with `database-url` | from main, with `database-url-next` only |
| Auth | `better-auth-secret`, `https://wovain.com` | `better-auth-secret-next`, `https://next.wovain.com`; cookies are host-only (no `crossSubDomainCookies`) |
| Inngest | production's keys, app `wovain` | its own environment's keys (`inngest-*-key-next`), app `wovain-next` |
| Polar | production's sandbox org | its own sandbox org (`polar-*-next`) |
| Nebius, Qloo, Tavily, Google, Meta | production's keys | `<id>-next` only; a feature without its key is off |
| Resend | production's key | its own sending-only key, made by Pulumi |
| Images | `wovain` repository | `wovain-next` repository |
| Deploy account | `gitlab-deploy` (from `Production`) | `wovain-deploy-next` (from `next`): `run.developer` on `wovain-web-next` only |
| PostHog | project 687269, `APP_ENV=production` | its own project, `APP_ENV=next` |

dev.wovain.com gets the same treatment except its database, which stays on production's instance until a separate migration: its own `<id>-dev` secrets, PostHog project, Inngest app id, deploy account (from the `dev` GitHub environment) and no grant on production's secrets or KMS key. Production's deploy account loses its grants on dev.

**Why a new host and not dev.wovain.com:** dev.wovain.com was rolled out by hand and still had production's keys mounted. A new environment can be isolated from the start, with pure additions in Pulumi and no changes to production.

**Why its own Cloud SQL instance:** every environment owns its resources. A database on production's instance would share its `db-f1-micro` CPU, connections and maintenance with production while judges use it. The instance costs about $10 a month, so the project now runs close to the $20 budget (`infra/index.ts` alerts at 50%, 90% and 100%).

**How the app knows its environment:** `APP_ENV` (`production`, `next`, `development`), set on each Cloud Run service by Pulumi, not the host name. Feature flags have a `next` rollout that follows production's.

## Shipping

- **A normal fix or feature:** a pull request to main. Merging deploys it to next.wovain.com.
- **A production emergency (until about 2026-11-16, with written approval):** a pull request to `release/transcend` that cherry-picks the smallest fix (`git cherry-pick -x <sha>`). After it merges, the deploy run waits for approval in `Production`. The same fix also goes to main.
- **Infra:** applied from main as before. While production is frozen, a change to a production resource (secrets, Cloud SQL, DNS, services) waits until after the announcement, unless it is an emergency.

## Convergence

- **After about 2026-11-16 (Transcend winners announced):** set `wovain:freezeProduction false` (or delete the freeze), point the `Production` deployment policy at main (or fast-forward the release branch to main), and deploy main to wovain.com. The GitLab flags and OTLP settings leave production then. next.wovain.com stays for Nebius.
- **After 2026-12-15 (Nebius judging ends):** retire next.wovain.com (unprotect, then remove `appEnvironment` for `next`) or keep it as staging, and delete the `release` ruleset and branch if production then deploys from main.

## Consequences

- Two branches can drift. Cherry-pick only emergency fixes. `deploy.yml` is the same file on both branches.
- `infra/bootstrap` must be applied (provider condition) before a release deploy can get a Google token.
- Before the first next run, the owner pastes the values only a provider console hands out (Inngest environment keys, a Polar sandbox token, OAuth clients, metered API keys; `infra/README.md` lists each and why). Until then, next serves pages but cannot start runs or checkouts.
- next has its own Google OAuth client and Meta app, made in their consoles: neither has an API or IaC provider.
