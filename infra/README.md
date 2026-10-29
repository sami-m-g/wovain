# infra

Pulumi (TypeScript) for wovain's Google Cloud project, its DNS, its GitHub repository (github.com/sami-m-g/wovain) and its PostHog project. `index.ts` is the `prod` stack, which also holds dev.wovain.com (`dev.ts`). `bootstrap/` holds CI's own identities and the GitHub Actions workload identity pool, `policy/` is the CrossGuard policy pack, and `posthog/` is the PostHog project (part of the `prod` stack).

State lives in `gs://wovain-pulumi-state`; stack secrets are encrypted with the `stack-secrets` Cloud KMS key. Both were made with gcloud before any stack existed; `bootstrap/state.ts` adopts them (`import`), protected.

## How infra changes ship

1. **Pull request.** CI's `infra` job type-checks and runs both programs against mocks with no credentials (`*.test.ts`). This catches missing config, code that throws, duplicate URNs and dynamic providers that don't serialize.
2. **Preview** locally with real credentials before merging: `pnpm run infra:preview` (with the policy pack, on a copy of the state). Review the plan; `node infra/policy/guard.ts < preview.json` fails on a delete or replace of a stateful resource.
3. **Apply**: `.github/workflows/infra.yml` runs `pulumi up` of `prod` on every push to main that touches infra, in the `infrastructure` environment, as `gitlab-infra`, after the same preview and guard. Then it runs `pnpm polar:seed` (`packages/billing/src/seed.ts`), which keeps Polar's catalog, promo codes and webhook endpoint as code. On a pull request, the same workflow previews both stacks read-only as `infra-preview` (`bootstrap/preview.ts`, a pool of its own that trusts only this repository's `pull_request` events) and writes the plan to the job summary. `pnpm run infra:up` does the same from a laptop.

The policy pack (`policy/index.ts`) is mandatory in every preview and `up`:

- **`stateful-resources-protected`:** databases, buckets, secrets, keys, repositories, service accounts and workload identity pools must be `protect: true`. The engine then refuses to delete or replace them, and a preview that would do so fails. To release one, run `pulumi state unprotect <urn>` and then remove its declaration while it still has `retainOnDelete`.

## GitHub

`github.ts` manages the repository (adopted, protected and retained), Dependabot alerts and security updates, and a ruleset on the default branch: no deletion, no force-push, changes only through a pull request (no approval required) whose `verify` and `infra` checks from `.github/workflows/ci.yml`, `codeql` from `codeql.yml` and `dependency-review` from `supply-chain.yml` passed. It also owns a `release` ruleset for `release/transcend`, every GitHub environment a workflow or Google's trust uses, and the Actions variables `.github/workflows/deploy.yml` reads:

| Environment | Deployment branches | Approval | Google trusts in it |
| --- | --- | --- | --- |
| `Production` | `release/transcend` | a required reviewer | `gitlab-deploy` |
| `next` | `main` | none | `wovain-deploy-next` |
| `dev` | `main` | none | `wovain-deploy-dev` |
| `infrastructure` | `main` | none | `gitlab-infra` (`bootstrap/`) |

`deploy.yml` uses `next` and `Production`; no workflow uses `dev` or `infrastructure` yet, but each is declared so Google's trust in it can't be claimed by an environment made by hand. None of the four existed on GitHub except `Production` (made by Vercel's integration; GitHub creates or updates an environment by name, so Pulumi adopts it as is). If one already exists when you apply, adopt it instead of recreating it, for example `pulumi import --cwd infra --stack prod github:index/repositoryEnvironment:RepositoryEnvironment infrastructure wovain:infrastructure` (the id is `<repository>:<environment>`). The repository-level `Preview` environment (Vercel's) is not used and not managed.

### GitGuardian secret

The repository's one secret is `GITGUARDIAN_API_KEY`, which the `ggshield` job in `.github/workflows/supply-chain.yml` reads. Set it as a stack secret and Pulumi writes it as the Actions secret (`github.ts` declares it only when the stack secret is set): `pulumi config set --secret --cwd infra --stack prod gitguardian-api-key <key>`, with a service-account API key from the GitGuardian dashboard (scope: scan). Don't set it by hand in the repository's settings. `.gitguardian.yaml` holds the scan's ignored paths. Until the key exists the `ggshield` job fails, so it is not a required check. Like the new required checks above, the secret lives in the `prod` stack: apply neither before the production freeze ends (about 2026-11-16).

The repository's variables are `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_PROJECT_ID`, `GCP_REGION` and `DOCS_SITE_URL`. Each deploy environment has `GCP_DEPLOY_SERVICE_ACCOUNT`, `GCP_IMAGE_REPOSITORY`, `GCP_SQL_INSTANCE`, `DATABASE_URL_SECRET`, `NEXT_PUBLIC_POSTHOG_KEY`, `SITE_URL` and `WEB_SERVICE`, and `Production` also has `DOCS_SERVICE`. See "Releases" below.

The provider authenticates with the `github:token` stack secret. A fine-grained token for sami-m-g/wovain needs read and write on Administration, Environments, Variables and Dependabot alerts (`pulumi config set --secret github:token <token> --cwd infra --stack prod`).

Google trusts GitHub Actions through the `github` workload identity pool (`bootstrap/index.ts`). Its provider accepts only tokens from sami-m-g/wovain (by name, repository id and owner id) on `refs/heads/main`, or on `refs/heads/release/transcend` in the `Production` environment. `gitlab-deploy` trusts only jobs in the `Production` environment, `wovain-deploy-next` only jobs in `next`, `wovain-deploy-dev` only jobs in `dev`, and `gitlab-infra` only jobs in `infrastructure`. The two accounts keep their old ids: renaming would replace protected accounts.

## Leaving GitLab and retiring leftovers

The GitLab project is archived and read-only, so Pulumi must never try to change or delete what it created there. `scripts/pulumi.ts`, which `pnpm run infra:preview` and `pnpm run infra:up` call, does the state changes no program can make before it runs Pulumi. Each checks the state first, so a second run does nothing:

- It drops every GitLab resource from the state (`pulumi state delete --target-dependents` on the `gitlab` and `graphql` providers). Nothing is called in GitLab.
- It runs `pulumi state unprotect` on what `policy/retired.ts` releases that way: GitLab's pools, providers and accounts, and the mirror's deploy key pair.

A preview runs on a copy of the state in a throwaway local backend, with those changes applied to the copy, so it never writes the real state and shows exactly what `up` will do. Only `up` changes the real state.

Everything else `policy/retired.ts` lists is released in code: `legacy.ts` declares it without `protect` or `retainOnDelete`, and adopts with `import` what Pulumi never managed (Firebase's Admin SDK account and its roles, the default compute account's Editor role, App Hosting's Cloud Run service and image repository, and Vercel's `Preview` GitHub environment). The policy pack lets those be unprotected, and the guard lets a plan delete them. The follow-up pull request removed the declarations (`retired.ts` marks them `deleted`), so the next `up` deletes them.

That `up` should have run between the two pull requests (#47 and #48), but production was frozen, so the state still protects and retains the App Hosting backend, its account and sources bucket, and the WorkOS, OTLP and OpenRouter secrets, and every preview failed on deleting a protected resource. `scripts/pulumi.ts` therefore also releases each `deleted` resource the state still protects or retains (`scripts/state.ts`): it clears both flags in an export of the state and imports it back, which `pulumi state unprotect` can't do for `retainOnDelete`. A preview does that on its copy; the first gated `up` after the freeze does it on the real state, then deletes them. The resources `legacy.ts` would have imported (Firebase's Admin SDK account and roles, the compute account's Editor role, App Hosting's Cloud Run service and image repository, Vercel's `Preview` environment) were never in the state, so Pulumi leaves them alone.

Apply `bootstrap` before `prod`:

```sh
pnpm run infra:install
pnpm run infra:bootstrap:preview
pnpm run infra:bootstrap:up
pulumi import --cwd infra --stack prod --file posthog/import.json --generate-code=false --protect=false --yes
pnpm run infra:preview
pnpm run infra:up
```

Deleted workload identity pools stay soft-deleted for 30 days, so the ids `gitlab` and `gitlab-mr` can't be reused until then.

### Production freeze

Production (wovain.com) is frozen for the Transcend judging while `wovain:freezeProduction` is on (the default; the release-branch change, #25, adds it to `index.ts`, which then leaves the `wovain-web` and `wovain-docs` templates as they are live). The guard fails any plan that still changes either service, and `scripts/pulumi.ts up` runs that preview and guard before it applies, so a laptop `up` can't roll production either. `legacy.ts` also keeps `gitlab-feature-flags-instance-id` and wovain-web's access to it, since the live revision still mounts it. Retire both after production's next deploy.

## Bootstrap (one time, by a project owner)

CI's account, its roles and the workload identity pool live in `bootstrap/`, not in `prod`: an account that grants itself a role can't use it in the same run, because IAM takes minutes to propagate. Apply it before any `prod` change that refers to it (above). The repository's numeric ids in `bootstrap/Pulumi.prod.yaml` come from `gh api repos/sami-m-g/wovain --jq '.id, .owner.id'`.

## Releases: production frozen, main on next.wovain.com

[ADR 0004](../docs/adr/0004-release-branch.md) has the reasons. In short, until the Transcend winners are announced (about **2026-11-16**), wovain.com must keep running the build judges saw at the deadline. All other work ships to next.wovain.com.

| Branch | GitHub environment | Approval | Deploys | As |
| --- | --- | --- | --- | --- |
| `release/transcend` (starts at `5b47472`, the live image) | `Production` | a required reviewer | `wovain-web`, `wovain-docs` | `gitlab-deploy` |
| `main` | `next` | none | `wovain-web-next` (next.wovain.com) | `wovain-deploy-next` |

- `.github/workflows/deploy.yml` is one file on both branches. Each environment's Actions variables (`github.ts`) give its service, image repository, Cloud SQL instance, database URL secret, PostHog token, site URL and deploy account.
- Google accepts the release branch only in the `Production` environment (`bootstrap/index.ts`). `gitlab-deploy` trusts only `Production`, and `wovain-deploy-next` trusts only `next` (`dev.ts`). `wovain-deploy-next` has `run.developer` on `wovain-web-next` alone, writes only to the `wovain-next` image repository and reads only `database-url-next`.
- `wovain:freezeProduction` (true by default) makes Pulumi ignore the whole `wovain-web` and `wovain-docs` templates. No `pulumi up` from main rolls out a new production revision, and the live revision keeps its GitLab flag and OTLP env. The template already has `APP_ENV=production` and `INNGEST_APP_ID=wovain` for when it converges.
- The `release` ruleset protects the release branch like main, with `verify` as its only required check.

### Ship a fix

- **Normal:** a pull request to main. After it merges, it deploys to next.wovain.com.
- **Production emergency (until about 2026-11-16, only with the hackathon's written approval on Devpost):** branch from `release/transcend`, `git cherry-pick -x <sha>` the smallest fix, and open a pull request to `release/transcend`. After `verify` passes and it merges, approve the `deploy` run's `Production` job. Land the same fix on main.
- **Infra:** applied from main. While production is frozen, leave its secrets, Cloud SQL, DNS records and services alone unless there is an emergency.

### Set up (one time, by a project owner)

1. Create the release branch at the live commit before the `release` ruleset exists: `git push github 5b47472d0fb30e822155c1420c1f40598ce5d2a4:refs/heads/release/transcend`. Then merge a pull request into it that adds only `.github/workflows/{ci,deploy}.yml` (no app code).
2. Apply `bootstrap` (it changes the provider's attribute condition), then `prod`. Check the `prod` preview: for production it must show no update or replace (see "What the preview for this change shows" below).
3. Paste the values only a provider's console hands out (next section), then `pulumi up` again so Pulumi writes them as secret versions and mounts them.
4. Uncomment the `push` trigger in `deploy.yml` on both branches.

### Converge

- **After about 2026-11-16:** set `wovain:freezeProduction false`, point the `production-release` deployment policy at main (or fast-forward `release/transcend` to main), and deploy main to production.
- **After 2026-12-15 (Nebius judging ends):** retire or keep next.wovain.com, and drop the release branch and its ruleset.

## dev.wovain.com and next.wovain.com

`dev.ts` declares the non-production environments with `appEnvironment`. Each owns its resources and holds nothing of production's: it runs `wovain-web-<name>` (scales to zero) as its own runtime account, with its own bucket, database and user, `<id>-<name>` secret for every key the app reads, PostHog project (`posthog/program.ts`), Inngest app id (`INNGEST_APP_ID=wovain-<name>`), `APP_ENV`, image repository and deploy account, which only its own GitHub environment may use. Neither has a grant on production's secrets, its `connections` KMS key or its deploy account; production's deploy account has none on them.

- **next** (next.wovain.com, `APP_ENV=next`): where main deploys. Its own stack, `next` of the `wovain-next` project (`next/`), so applying it can't plan a change to production (below). Its own Cloud SQL instance, `wovain-next` (`db-f1-micro`, like production's).
- **dev** (dev.wovain.com, `APP_ENV=development`): rolled out by hand, or from the `dev` GitHub environment as `wovain-deploy-dev`. Its database `wovain_dev` stays on production's instance: moving it means a dump and restore and replacing a protected database, so it is a separate change.

What they still share with production: the Google Cloud project, the `wovain-com` DNS zone, the Resend sending domain (each has its own sending-only key) and the PostHog organization.

### next.wovain.com's own stack (`next/`)

`next/index.ts` declares only next's resources (every name has `next` in it, and `next/next.test.ts` fails otherwise): `appEnvironment` (`dev.ts`), its PostHog project, its Resend sending key, the `next.wovain.com` domain mapping and CNAME, and the `next` GitHub environment with its policy and Actions variables. Its config is plain keys in `next/Pulumi.next.yaml` (`pulumi config set --cwd infra/next --stack next emailFrom ...`). It reads, and never changes, the enabled APIs, the `wovain-com` zone, the `github` pool (`bootstrap/`), Search Console's verification of wovain.com and the Resend domain (`resendDomainId`).

It holds no credential of production's. Its provider credentials are its own stack secrets, each made for next, and a preview without one fails naming it:

| Stack secret | Create it in | Scope |
| --- | --- | --- |
| `resendAdminKey` | Resend > API Keys, "wovain next admin", Full access | Resend makes an API key only with a full-access one; the program uses it once, to make next's sending-only key for wovain.com (`resend-api-key-next`). Revoke it separately from production's. |
| `github:token` | a fine-grained token for sami-m-g/wovain with read and write on Environments and Variables only | The `next` environment, its branch policy and its Actions variables. Production's token also needs Administration and Dependabot, which next must not have. |
| `posthog:apiKey` | a personal API key in the PostHog organization, with `project:write` (organization scope) | Creating next's project is an organization action, so this key is organization-level; it is next's own key, revocable without touching production's. |

```sh
pulumi config set --secret --cwd infra/next --stack next resendAdminKey <key>
pulumi config set --secret --cwd infra/next --stack next github:token <token>
pulumi config set --secret --cwd infra/next --stack next posthog:apiKey <key>
```

A preview of a stack not yet in the state starts from an empty one, and `up` creates it (`scripts/pulumi.ts`):

```sh
pnpm run infra:install
pnpm run infra:bootstrap:preview   # the `github` pool next's deploy account trusts
pnpm run infra:bootstrap:up
pnpm run infra:next:preview        # creates only
pnpm run infra:next:up
```

### Values only a provider's console hands out (one time, per environment)

Pulumi creates every `<id>-<name>` secret, empty until it has a value; an empty one is not mounted, since Cloud Run won't start a revision on a secret with no version. These values have no API or IaC provider to create them, so you paste each once as a stack secret: dev's as `pulumi config set --secret --cwd infra --stack prod <id>-dev <value>`, next's without the suffix in its own stack, `pulumi config set --secret --cwd infra/next --stack next <id> <value>` (the Secret Manager id is still `<id>-next`):

| Stack secret | From | Why it can't be created in code |
| --- | --- | --- |
| `inngest-event-key-<name>`, `inngest-signing-key-<name>` | a new Inngest environment per name (Inngest dashboard > Environments > Create) | Inngest has no Terraform or Pulumi provider, and its REST API can't create environments or their keys. |
| `polar-access-token-<name>` | an organization token of a new Polar sandbox organization per name, never production's | Polar's API creates neither organizations nor organization tokens (dashboard only; the sandbox at sandbox.polar.sh is its own environment with its own sign-in), and the community Terraform providers need that token themselves. `polar-webhook-secret-<name>` then gets a placeholder version, and `POLAR_WEBHOOK_URL=https://<host>/api/auth/polar/webhooks POLAR_WEBHOOK_SECRET_ID=polar-webhook-secret-<name> pnpm polar:seed` (with that token) creates the endpoint and writes its real secret. |
| `google-client-secret-<name>` and the plain config `googleClientId-<name>` (next: `googleClientId`) | a new OAuth client per name in Google Auth Platform, with `https://<host>/api/auth/callback/google` as its redirect URI | Google's sign-in OAuth clients have no API: the Google provider's `gcp.iam.OauthClient` is for Workforce Identity Federation, and IAP's OAuth clients went away with the IAP OAuth Admin API. |
| `meta-app-id-<name>`, `meta-app-secret-<name>` | a Meta app per name (or a test app of production's), with `https://<host>/api/connections/meta/callback` | Meta has no API or IaC provider that creates apps; only the developer console does. |
| `nebius-api-key-<name>`, `tavily-api-key-<name>`, `qloo-api-key-<name>`, `fal-key-<name>` | each provider's console (Qloo's hackathon key comes from Qloo; fal's from fal.ai > API keys). Voice commands transcribe on `fal-key-<name>` (unset, they fail), and designs draw on it while the onboarding-wizard flag is on. | None has an API that creates keys. |
| `posthog-secret-key-<name>` | the environment's PostHog project > Settings > Secret API keys (`feature_flag:read`) | PostHog's Terraform provider has no secret key resource. Without it the flag registry answers, which is the safe state. |

Created in code, nothing to paste: `better-auth-secret-<name>`, `token-encryption-key-<name>`, `database-url-<name>` (generated), `resend-api-key-<name>` (a sending-only Resend key, `resend.ts`, made with production's full-access key for dev and with next's own `resendAdminKey` for next), and each PostHog project and its public token.

Until the Inngest keys are set, an environment serves pages but cannot start runs; until the Polar token is set, it cannot check out. Fourthwall needs no app (each merchant connects their own).

### The judges' demo account on next (one time, by a project owner)

Hackathon judges share one account on next.wovain.com, `judges@wovain.com` (openspec `judges-demo-account`). Its credits come from the `judges-account-2026` promo in `next/Pulumi.next.yaml`, which only that email can redeem. Apply `pnpm run infra:next:up` only after next runs a build that knows the promo's `emails` field: older builds refuse the catalog.

1. Seed the account through the Cloud SQL Auth Proxy, on the same `/cloudsql` socket the deploy's migrate step uses. The URL goes from Secret Manager straight into the command and is never printed:

   ```sh
   sudo mkdir -p /cloudsql && sudo chown "$(id -u)" /cloudsql
   cloud-sql-proxy --unix-socket /cloudsql wovain:us-central1:wovain-next &
   DATABASE_URL="$(gcloud secrets versions access latest --secret database-url-next --project wovain)" \
   DATABASE_URL_SECRET=database-url-next \
     pnpm --filter @wovain/auth seed:judges --env next
   ```

   It prints the password once: paste it into Devpost's testing instructions, never into the repository. A second run changes nothing and keeps the password; add `--reset-password` to set a new one (it signs the old one out). The seed refuses production's instance (`wovain`), user (`wovain`) and secret (`database-url`) before it connects, and refuses any server whose database isn't `wovain_next` once connected.

2. Create the promo in next's Polar sandbox organization: `pnpm polar:seed` with next's `POLAR_ACCESS_TOKEN` (`polar-access-token-next`), next's `BILLING_CATALOG` and `POLAR_METADATA_KEY=wovain:next`. next shares production's sandbox organization, and the seed finds and updates whatever carries its metadata key, so without `wovain:next` it would rewrite production's plans, benefits and promos. With it, the seed creates next's own meter, benefits, products and discounts, and the `POLAR_WEBHOOK_URL=https://next.wovain.com/api/auth/polar/webhooks POLAR_WEBHOOK_SECRET_ID=polar-webhook-secret-next` endpoint. With `GCP_PROJECT_ID=wovain` each promo's code goes to next's own secret, `polar-promo-<id>-next` (the judges' is `polar-promo-judges-account-2026-next`), and production's `polar-promo-<id>` secrets stay as they are; without it the code goes to the gitignored `.env.polar-promos`. Set `POLAR_PROMO_CODE_JUDGES_ACCOUNT_2026` to choose the code. Give the code to the judges with the password, or redeem it once yourself as the judges on Billing > Redeem a code.

### What the previews show

- **`next`** (`pnpm run infra:next:preview`): creates only, every one of them next's. No update, replace or delete.
- **`prod`**: next's resources are no longer in it. Its plan still holds production changes that wait for the freeze to end (about 2026-11-16): the apex TXT record's Search Console token, the delete of `status.wovain.com`'s mapping and record, the GitHub `Production` environment and rulesets, the PostHog project's settings and dashboards, and the retired App Hosting resources, which the state still protects (#47's `up` never ran before #48 merged), so the preview fails until they are unprotected. Don't apply `prod` while production is frozen.

## PostHog (`posthog/`)

`posthog/program.ts` manages the PostHog project with PostHog's official Terraform provider, bridged into Pulumi (`packages:` in `Pulumi.yaml`; PostHog publishes no Pulumi package). `pulumi install` generates its SDK in `sdks/posthog` (gitignored). It declares:

- an insight and an alert per KPI in `kpis.yml`;
- the "wovain health" dashboard and the Growth, Retention, Agent quality and cost, and Web vitals dashboards, with the insights in `dashboards.ts`;
- the project settings (cookieless hashing, no stored IPs, the default test account filters, the authorized domains, session replay, heatmaps, exceptions and web vitals) and the run-rating survey (created as a draft);
- the app's feature flags, from `flags.json`. `packages/core/src/flag-posthog.test.ts` writes that file from the typed registry, and fails while they differ. A flag's Status (`active`) is set once at creation and then ignored (`ignoreChanges`): it is the kill switch, flipped in PostHog without drift.

Stack config:

- `posthog:apiKey` (secret): a personal API key with write access to the project's insights, dashboards, alerts, surveys, feature flags and settings.
- `posthog:projectId`: `687269`.
- `wovain:posthogInternalUserIds` (optional): the team's Better Auth user ids, which every `internal` and `percent` rollout includes, e.g. `pulumi config set --path 'wovain:posthogInternalUserIds[0]' <user id>`.
- `wovain:posthogAlertSubscribers` (optional): the PostHog user ids that get KPI alert emails; the founder by default.

The web app evaluates flags with the `posthog-secret-key` secret, mounted as `POSTHOG_SECRET_KEY` once its stack secret is set (`pulumi config set --secret posthog-secret-key <key>`).

### Adopting what exists (one time)

The four product dashboards, their 19 insights, the three alert insights and their alerts were created through PostHog's API, and the project settings exist with the project. `posthog/import.json` lists them with their PostHog ids; `pulumi import` adds them to the state without changing PostHog, so `pulumi up` updates them in place instead of creating duplicates. Run it once, before the first preview that includes `posthog/` (step 3 of "Leaving GitLab"):

```sh
pulumi import --cwd infra --stack prod --file posthog/import.json --generate-code=false --protect=false --yes
```

The preview after it should show only updates for the imported objects, and creates for the rest: the health dashboard and its 6 insights, the other KPI insights and alerts, `insight-weekly_visitors`, `insight-top_referrers`, the survey and the feature flags. Delete `import.json` (and its test in `program.test.ts`) in the pull request after that `up`.
