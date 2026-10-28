# ADR 0004: Production deploys from a release branch; main deploys to qloo.wovain.com

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

**main** deploys to **qloo.wovain.com** (Cloud Run `wovain-web-qloo`) in the `qloo` GitHub environment, with no approval. It is a new environment, isolated from production:

|  | Production | qloo |
| --- | --- | --- |
| Database | `wovain` on the `wovain` instance | `wovain_qloo` on the same instance, with its own user and password |
| Migrations | from the release branch, with `database-url` | from main, with `database-url-qloo` only |
| Auth | `better-auth-secret`, `https://wovain.com` | `better-auth-secret-qloo`, `https://qloo.wovain.com`; cookies are host-only (no `crossSubDomainCookies`) |
| Inngest | production's keys | its own keys from a separate Inngest environment (`inngest-*-key-qloo`); never production's |
| Polar | production's sandbox org | its own (`polar-*-qloo`); never production's |
| Nebius, Qloo, Tavily | production's keys | `<id>-qloo` if set, else production's |
| Images | `wovain` repository | `wovain-qloo` repository |
| Deploy account | `gitlab-deploy` (from `Production`) | `wovain-deploy-qloo` (from `qloo`): `run.developer` on `wovain-web-qloo` only |
| PostHog | `environment: production` | `environment: qloo`, excluded by the test account filter |

dev.wovain.com is unchanged and still rolled out by hand.

**Why a new host and not dev.wovain.com:** dev.wovain.com shares production's Inngest and Polar keys and is used by hand. A new environment can be isolated from the start, with pure additions in Pulumi and no changes to existing resources. A scale-to-zero Cloud Run service, a database on the existing instance, a bucket and secrets cost almost nothing. A second Cloud SQL instance would cost about $10 a month, half the budget.

**Why share the Cloud SQL instance:** a separate database and user keep the data apart, and the qloo deploy account can read only its own password. The shared resource is the `db-f1-micro` CPU and its connections. If qloo traffic puts production at risk, move qloo to its own instance.

## Shipping

- **A normal fix or feature:** a pull request to main. Merging deploys it to qloo.wovain.com.
- **A production emergency (until about 2026-11-16, with written approval):** a pull request to `release/transcend` that cherry-picks the smallest fix (`git cherry-pick -x <sha>`). After it merges, the deploy run waits for approval in `Production`. The same fix also goes to main.
- **Infra:** applied from main as before. While production is frozen, a change to a production resource (secrets, Cloud SQL, DNS, services) waits until after the announcement, unless it is an emergency.

## Convergence

- **After about 2026-11-16 (Transcend winners announced):** set `wovain:freezeProduction false` (or delete the freeze), point the `Production` deployment policy at main (or fast-forward the release branch to main), and deploy main to wovain.com. The GitLab flags and OTLP settings leave production then. qloo.wovain.com stays for Nebius.
- **After 2026-12-15 (Nebius judging ends):** retire qloo.wovain.com (unprotect, then remove `appEnvironment("qloo")`) or keep it as staging, and delete the `release` ruleset and branch if production then deploys from main.

## Consequences

- Two branches can drift. Cherry-pick only emergency fixes. `deploy.yml` is the same file on both branches.
- `infra/bootstrap` must be applied (provider condition) before a release deploy can get a Google token.
- Before the first qloo run, the owner creates the Inngest environment and a Polar sandbox organization and sets their keys as stack secrets. Until then, qloo serves pages but cannot start runs or checkouts.
- OAuth providers (Google, Meta, Fourthwall) need qloo.wovain.com's redirect URIs added next to production's in their consoles. None is in IaC.
