# infra

Pulumi (TypeScript) for wovain's Google Cloud project, its DNS, its GitHub repository (github.com/sami-m-g/wovain) and its PostHog project. `index.ts` is the `prod` stack, which also holds dev.wovain.com (`dev.ts`). `bootstrap/` holds CI's own identities and the GitHub Actions workload identity pool, `policy/` is the CrossGuard policy pack, and `posthog/` is the PostHog project (part of the `prod` stack).

State lives in `gs://wovain-pulumi-state`; stack secrets are encrypted with the `stack-secrets` Cloud KMS key.

## How infra changes ship

1. **Pull request.** CI's `infra` job type-checks and runs both programs against mocks with no credentials (`*.test.ts`). This catches missing config, code that throws, duplicate URNs and dynamic providers that don't serialize.
2. **Preview** locally with real credentials before merging: `pnpm run infra:preview` (with the policy pack). Review the plan; `node infra/policy/guard.ts < preview.json` fails on a delete or replace of a stateful resource.
3. **Apply** with `pnpm run infra:up` from main. No workflow runs `pulumi up` yet; `gitlab-infra` already trusts GitHub Actions jobs in an `infrastructure` environment on main, for when one does.

The policy pack (`policy/index.ts`) is mandatory in every preview and `up`:

- **`stateful-resources-protected`:** databases, buckets, secrets, keys, repositories, service accounts and workload identity pools must be `protect: true`. The engine then refuses to delete or replace them, and a preview that would do so fails. To release one, run `pulumi state unprotect <urn>` and then remove its declaration while it still has `retainOnDelete`.

## GitHub

`github.ts` manages the repository (adopted, protected and retained), Dependabot alerts and security updates, and a ruleset on the default branch: no deletion, no force-push, changes only through a pull request (no approval required) whose `verify` and `infra` checks from `.github/workflows/ci.yml` passed. It also owns a `release` ruleset for `release/transcend`, every GitHub environment a workflow or Google's trust uses, and the Actions variables `.github/workflows/deploy.yml` reads:

| Environment | Deployment branches | Approval | Google trusts in it |
| --- | --- | --- | --- |
| `Production` | `release/transcend` | a required reviewer | `gitlab-deploy` |
| `next` | `main` | none | `wovain-deploy-next` |
| `dev` | `main` | none | `wovain-deploy-dev` |
| `infrastructure` | `main` | none | `gitlab-infra` (`bootstrap/`) |

`deploy.yml` uses `next` and `Production`; no workflow uses `dev` or `infrastructure` yet, but each is declared so Google's trust in it can't be claimed by an environment made by hand. None of the four existed on GitHub except `Production` (made by Vercel's integration; GitHub creates or updates an environment by name, so Pulumi adopts it as is). If one already exists when you apply, adopt it instead of recreating it, for example `pulumi import --cwd infra --stack prod github:index/repositoryEnvironment:RepositoryEnvironment infrastructure wovain:infrastructure` (the id is `<repository>:<environment>`). The repository-level `Preview` environment (Vercel's) is not used and not managed.

The repository's variables are `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_PROJECT_ID`, `GCP_REGION` and `DOCS_SITE_URL`. Each deploy environment has `GCP_DEPLOY_SERVICE_ACCOUNT`, `GCP_IMAGE_REPOSITORY`, `GCP_SQL_INSTANCE`, `DATABASE_URL_SECRET`, `NEXT_PUBLIC_POSTHOG_KEY`, `SITE_URL` and `WEB_SERVICE`, and `Production` also has `DOCS_SERVICE`. See "Releases" below.

The provider authenticates with the `github:token` stack secret. A fine-grained token for sami-m-g/wovain needs read and write on Administration, Environments, Variables and Dependabot alerts (`pulumi config set --secret github:token <token> --cwd infra --stack prod`).

Google trusts GitHub Actions through the `github` workload identity pool (`bootstrap/index.ts`). Its provider accepts only tokens from sami-m-g/wovain (by name, repository id and owner id) on `refs/heads/main`, or on `refs/heads/release/transcend` in the `Production` environment. `gitlab-deploy` trusts only jobs in the `Production` environment, `wovain-deploy-next` only jobs in `next`, `wovain-deploy-dev` only jobs in `dev`, and `gitlab-infra` only jobs in `infrastructure`. The two accounts keep their old ids: renaming would replace protected accounts.

## Leaving GitLab (one time, before the next `pulumi up`)

The GitLab project is archived and read-only, so Pulumi must never try to change or delete what it created there: GitLab would refuse, and the update would stop. This program declares nothing in GitLab anymore. Before the next `pulumi preview` or `pulumi up`, a project owner drops the GitLab resources from the state (GitLab keeps them, untouched), releases the Google and GitHub resources that went with GitLab, then applies `bootstrap` before `prod`. Run from the repository root, with `gcloud auth application-default login` done.

### 1. Drop every GitLab resource from the `prod` state

Each GitLab variable, environment, label, board, schedule, feature flag and Duo trigger (about 90 resources) uses one of two providers. `--target-dependents` deletes a provider and every resource that uses it from the state, and `--force` covers the four protected GitLab environments. Nothing is called in GitLab.

```sh
pulumi state delete --cwd infra --stack prod --yes --force --target-dependents \
  'urn:pulumi:prod::wovain::pulumi:providers:gitlab::default_10_4_0'
pulumi state delete --cwd infra --stack prod --yes --force --target-dependents \
  'urn:pulumi:prod::wovain::pulumi:providers:graphql::gitlab-graphql'
# Must print nothing.
pulumi stack export --cwd infra --stack prod \
  | jq -r '.deployment.resources[] | select(.type | test("^(gitlab|graphql):|^pulumi:providers:(gitlab|graphql)$")) | .urn'
```

If the check still prints URNs, delete each one it prints, then the two providers, and run the check again:

```sh
pulumi stack export --cwd infra --stack prod \
  | jq -r '.deployment.resources[] | select(.type | test("^(gitlab|graphql):")) | .urn' \
  | while read -r urn; do pulumi state delete --cwd infra --stack prod --yes --force --target-dependents "$urn" || true; done
```

### 2. Release what Pulumi may now delete

These are in Google Cloud and GitHub, which Pulumi can still change. They are protected, so the engine refuses to delete them until they are unprotected; the next `up` then deletes them.

```sh
# prod: the ops job's account (its three viewer grants and its trust go with it),
# and the GitHub mirror's deploy key pair (no external effect).
pulumi state unprotect --cwd infra --stack prod --yes \
  'urn:pulumi:prod::wovain::gcp:serviceaccount/account:Account::gitlab-ops'
pulumi state unprotect --cwd infra --stack prod --yes \
  'urn:pulumi:prod::wovain::tls:index/privateKey:PrivateKey::github-mirror'
# bootstrap: GitLab's two workload identity pools and providers, and the merge
# request preview account.
for urn in \
  'urn:pulumi:prod::wovain-bootstrap::gcp:iam/workloadIdentityPool:WorkloadIdentityPool::gitlab' \
  'urn:pulumi:prod::wovain-bootstrap::gcp:iam/workloadIdentityPoolProvider:WorkloadIdentityPoolProvider::gitlab' \
  'urn:pulumi:prod::wovain-bootstrap::gcp:iam/workloadIdentityPool:WorkloadIdentityPool::gitlab-mr' \
  'urn:pulumi:prod::wovain-bootstrap::gcp:iam/workloadIdentityPoolProvider:WorkloadIdentityPoolProvider::gitlab-mr' \
  'urn:pulumi:prod::wovain-bootstrap::gcp:serviceaccount/account:Account::gitlab-preview'; do
  pulumi state unprotect --cwd infra/bootstrap --stack prod --yes "$urn"
done
```

Deleted workload identity pools stay soft-deleted for 30 days, so the ids `gitlab` and `gitlab-mr` can't be reused until then.

### 3. Apply bootstrap, then prod

```sh
pnpm run infra:install
pulumi preview --cwd infra/bootstrap --stack prod --policy-pack ../policy
pulumi up --cwd infra/bootstrap --stack prod --policy-pack ../policy
# Adopt the PostHog objects that already exist (see "PostHog" below).
pulumi import --cwd infra --stack prod --file posthog/import.json --generate-code=false --protect=false --yes
pulumi preview --cwd infra --stack prod --refresh --policy-pack policy
pulumi up --cwd infra --stack prod --refresh --policy-pack policy
```

What the `bootstrap` preview should show: creates the `github` pool and provider and `infra-from-github`; deletes the GitLab pools and providers, `gitlab-preview` with its grants, and `infra-from-gitlab`.

What the `prod` preview should show:

- **Creates:** the PostHog objects not in `posthog/import.json` (see "PostHog" below), the `posthog-secret-key` secret (mounted once it has a value), `deployer-from-github`, the `main` ruleset, the `Production` environment and its main-only branch policy, Dependabot security updates, and one `ActionsVariable` per variable above.
- **Updates:** the imported PostHog objects (names, descriptions, tags, `kpi:<id>` alert names, project settings), the repository (description, homepage https://wovain.com, topics, issues on, vulnerability alerts), the `gitlab-deploy` display name, the web services' env (no `GITLAB_FEATURE_FLAGS_*` or GitLab Observability `OTEL_*`; the refresh also drops a leftover `FAULT_INJECTION_REVISION`), and `gitlab-feature-flags-instance-id` (unmounted, retained in `legacy.ts`).
- **Deletes:** the mirror's deploy key, its private key and the "main is mirrored from GitLab" ruleset; `gitlab-ops` and its grants; the GitLab-pool grants (`deployer-from-gitlab*`, `gitlab-*-database-url`); `deployer-logging.viewer` (only the canary used it); the runners' access to `gitlab-feature-flags-instance-id`; and the `status.wovain.com` domain mapping and its DNS record (the status page was GitLab Pages).

The old ruleset lets only the mirror's deploy key update main, so on GitHub no pull request can merge until this `up` replaces it. To merge the pull request that brings this change first, set the ruleset's enforcement to Disabled (Settings > Rules > Rulesets) and merge; the `up` deletes it.

The stack config no longer has `gitlab:token`, `gitlab-ci-token`, `renovate-token`, the Duo triggers or the GitLab project and Observability ids. `deploy.yml` stays `workflow_dispatch` only until this is applied; run it once by hand, then give it a push trigger.

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

- **next** (next.wovain.com, `APP_ENV=next`): where main deploys. Its own Cloud SQL instance, `wovain-next` (`db-f1-micro`, like production's).
- **dev** (dev.wovain.com, `APP_ENV=development`): rolled out by hand, or from the `dev` GitHub environment as `wovain-deploy-dev`. Its database `wovain_dev` stays on production's instance: moving it means a dump and restore and replacing a protected database, so it is a separate change.

What they still share with production: the Google Cloud project, the `wovain-com` DNS zone, the Resend sending domain (each has its own sending-only key) and the PostHog organization.

### Values only a provider's console hands out (one time, per environment)

Pulumi creates every `<id>-<name>` secret, empty until it has a value; an empty one is not mounted, since Cloud Run won't start a revision on a secret with no version. These values have no API or IaC provider to create them, so you paste each once as a stack secret (`pulumi config set --secret --cwd infra --stack prod <id>-<name> <value>`), for `<name>` = `next` and `dev`:

| Stack secret | From | Why it can't be created in code |
| --- | --- | --- |
| `inngest-event-key-<name>`, `inngest-signing-key-<name>` | a new Inngest environment per name (Inngest dashboard > Environments > Create) | Inngest has no Terraform or Pulumi provider, and its REST API can't create environments or their keys. |
| `polar-access-token-<name>` | an organization token of a new Polar sandbox organization per name | Polar's organization tokens are made only in its dashboard; the community Terraform providers need that token themselves. `polar-webhook-secret-<name>` then gets a placeholder version, and `POLAR_WEBHOOK_URL=https://<host>/api/auth/polar/webhooks POLAR_WEBHOOK_SECRET_ID=polar-webhook-secret-<name> pnpm polar:seed` (with that token) creates the endpoint and writes its real secret. |
| `google-client-secret-<name>` and the plain config `googleClientId-<name>` | a new OAuth client per name in Google Auth Platform, with `https://<host>/api/auth/callback/google` as its redirect URI | Google's sign-in OAuth clients have no public API or Terraform resource. |
| `meta-app-id-<name>`, `meta-app-secret-<name>` | a Meta app per name (or a test app of production's), with `https://<host>/api/connections/meta/callback` | Meta apps are made only in the Meta developer console. |
| `nebius-api-key-<name>`, `tavily-api-key-<name>`, `qloo-api-key-<name>` | each provider's console (Qloo's hackathon key comes from Qloo) | None has an API that creates keys. |
| `posthog-secret-key-<name>` | the environment's PostHog project > Settings > Secret API keys (`feature_flag:read`) | PostHog's Terraform provider has no secret key resource. Without it the flag registry answers, which is the safe state. |

Created in code, nothing to paste: `better-auth-secret-<name>`, `token-encryption-key-<name>`, `database-url-<name>` (generated), `resend-api-key-<name>` (a sending-only Resend key made with production's full-access key, `resend.ts`), and each PostHog project and its public token.

Until the Inngest keys are set, an environment serves pages but cannot start runs; until the Polar token is set, it cannot check out. Fourthwall needs no app (each merchant connects their own).

### What the preview for this change shows

Creates only, for next, dev's new resources and GitHub, plus deletes of dev's old grants. For production: no update and no replace.

- **Creates:** next's instance, database, user, secrets, bucket, runtime and deploy accounts, image repository, service, domain mapping and DNS record; dev's own `<id>-dev` secrets, deploy account and image repository; the two PostHog projects and two Resend keys; the `next`, `dev` and `infrastructure` environments with their main-only policies and variables.
- **Updates:** `web-dev` (its env: `APP_ENV`, `INNGEST_APP_ID`, its own PostHog token, and only its own secrets).
- **Deletes:** dev's grants on production's secrets (`runner-dev-<id>` for every provider secret), on production's `connections` KMS key (`runner-dev-connections`; the app no longer reads `WOVAIN_KMS_KEY`), and production's deploy account's grants on dev (`deployer-acts-as-runner-dev`, `deployer-database-url-dev`). These are bindings, not production resources: production's own grants are unchanged.

## PostHog (`posthog/`)

`posthog/program.ts` manages the PostHog project with PostHog's official Terraform provider, bridged into Pulumi (`packages:` in `Pulumi.yaml`; PostHog publishes no Pulumi package). `pulumi install` generates its SDK in `sdks/posthog` (gitignored). It declares:

- an insight and an alert per KPI in `kpis.yml`;
- the "wovain health" dashboard and the Growth, Retention, Agent quality and cost, and Web vitals dashboards, with the insights in `dashboards.ts`;
- the project settings (cookieless hashing, no stored IPs, the default test account filters) and the run-rating survey (created as a draft);
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
