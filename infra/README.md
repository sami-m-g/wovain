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

`github.ts` manages the repository (adopted, protected and retained), Dependabot alerts and security updates, and a ruleset on the default branch: no deletion, no force-push, changes only through a pull request (no approval required) whose `verify` and `infra` checks from `.github/workflows/ci.yml` passed. It also owns a `release` ruleset for `release/transcend`, the `Production` environment (deploys from `release/transcend` only, after a required reviewer approves), the `qloo` environment (deploys from main only), and the Actions variables `.github/workflows/deploy.yml` reads. The repository's variables are `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_PROJECT_ID`, `GCP_REGION`, `GCP_SQL_INSTANCE`, `DOCS_SITE_URL` and `NEXT_PUBLIC_POSTHOG_KEY`. Each environment has `GCP_DEPLOY_SERVICE_ACCOUNT`, `GCP_IMAGE_REPOSITORY`, `DATABASE_URL_SECRET`, `SITE_URL` and `WEB_SERVICE`, and `Production` also has `DOCS_SERVICE`. See "Releases" below.

The provider authenticates with the `github:token` stack secret. A fine-grained token for sami-m-g/wovain needs read and write on Administration, Environments, Variables and Dependabot alerts (`pulumi config set --secret github:token <token> --cwd infra --stack prod`).

Google trusts GitHub Actions through the `github` workload identity pool (`bootstrap/index.ts`). Its provider accepts only tokens from sami-m-g/wovain (by name, repository id and owner id) on `refs/heads/main`, or on `refs/heads/release/transcend` in the `Production` environment. `gitlab-deploy` trusts only jobs in the `Production` environment, `wovain-deploy-qloo` only jobs in `qloo`, and `gitlab-infra` only jobs in `infrastructure`. The two accounts keep their old ids: renaming would replace protected accounts.

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

## Releases: production frozen, main on qloo.wovain.com

[ADR 0004](../docs/adr/0004-release-branch.md) has the reasons. In short, until the Transcend winners are announced (about **2026-11-16**), wovain.com must keep running the build judges saw at the deadline. All other work ships to qloo.wovain.com.

| Branch | GitHub environment | Approval | Deploys | As |
| --- | --- | --- | --- | --- |
| `release/transcend` (starts at `5b47472`, the live image) | `Production` | a required reviewer | `wovain-web`, `wovain-docs` | `gitlab-deploy` |
| `main` | `qloo` | none | `wovain-web-qloo` (qloo.wovain.com) | `wovain-deploy-qloo` |

- `.github/workflows/deploy.yml` is one file on both branches. Each environment's Actions variables (`github.ts`) give its service, image repository, database URL secret, site URL and deploy account.
- Google accepts the release branch only in the `Production` environment (`bootstrap/index.ts`). `gitlab-deploy` trusts only `Production`, and `wovain-deploy-qloo` trusts only `qloo` (`dev.ts`). `wovain-deploy-qloo` has `run.developer` on `wovain-web-qloo` alone, writes only to the `wovain-qloo` image repository and reads only `database-url-qloo`.
- `wovain:freezeProduction` (true by default) makes Pulumi ignore the whole `wovain-web` and `wovain-docs` templates. No `pulumi up` from main rolls out a new production revision, and the live revision keeps its GitLab flag and OTLP env.
- The `release` ruleset protects the release branch like main, with `verify` as its only required check.

### Ship a fix

- **Normal:** a pull request to main. After it merges, it deploys to qloo.wovain.com.
- **Production emergency (until about 2026-11-16, only with the hackathon's written approval on Devpost):** branch from `release/transcend`, `git cherry-pick -x <sha>` the smallest fix, and open a pull request to `release/transcend`. After `verify` passes and it merges, approve the `deploy` run's `Production` job. Land the same fix on main.
- **Infra:** applied from main. While production is frozen, leave its secrets, Cloud SQL, DNS records and services alone unless there is an emergency.

### Set up (one time, by a project owner)

1. Create the release branch at the live commit before the `release` ruleset exists: `git push github 5b47472d0fb30e822155c1420c1f40598ce5d2a4:refs/heads/release/transcend`. Then merge a pull request into it that adds only `.github/workflows/{ci,deploy}.yml` (no app code).
2. Apply `bootstrap` (it changes the provider's attribute condition), then `prod`. The `prod` preview for this change contains only additions for qloo, the `release` ruleset, the `qloo` environment and the environment variables. It no longer updates `wovain-web`.
3. Create an Inngest environment for qloo and a Polar sandbox organization, then set their keys: `pulumi config set --secret inngest-event-key-qloo …`, `inngest-signing-key-qloo`, `polar-access-token-qloo`, `polar-webhook-secret-qloo`. Optionally set `nebius-api-key-qloo`, `qloo-api-key-qloo` and `tavily-api-key-qloo`, so qloo doesn't spend production's credits.
4. In each OAuth provider's console, add qloo.wovain.com's callback URLs next to production's (Google: `https://qloo.wovain.com/api/auth/callback/google`; Meta and Fourthwall: their connect callbacks under the same host). None of these consoles is in IaC.
5. Uncomment the `push` trigger in `deploy.yml` on both branches.

### Converge

- **After about 2026-11-16:** set `wovain:freezeProduction false`, point the `production-release` deployment policy at main (or fast-forward `release/transcend` to main), and deploy main to production.
- **After 2026-12-15 (Nebius judging ends):** retire or keep qloo.wovain.com, and drop the release branch and its ruleset.

## dev.wovain.com and qloo.wovain.com

`dev.ts` declares the non-production environments with `appEnvironment`. Each runs `wovain-web-<name>`, which scales to zero, in the same project and stack. Each uses its own `wovain_<name>` database and user on the existing Cloud SQL instance, its own `database-url-<name>`, `better-auth-secret-<name>` and `token-encryption-key-<name>` secrets (generated by Pulumi), its own bucket and its own runtime account.

- **dev** (dev.wovain.com) shares production's provider secrets, including its Inngest and Polar keys, so don't sync its `/api/inngest`. It is rolled out by hand. `gitlab-deploy` may act as its runner and read its database URL.
- **qloo** (qloo.wovain.com) is isolated. It never mounts production's Inngest or Polar secrets: they come from `<id>-qloo` stack secrets, once those are set. It gets no grant on the `connections` KMS key. It has its own image repository and deploy account.

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
