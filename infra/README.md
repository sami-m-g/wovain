# infra

Pulumi (TypeScript) for wovain's Google Cloud project, its DNS and its GitHub repository (github.com/sami-m-g/wovain). `index.ts` is the `prod` stack, which also holds dev.wovain.com (`dev.ts`). `bootstrap/` holds CI's own identities and the GitHub Actions workload identity pool, `policy/` is the CrossGuard policy pack, and `posthog/` is the PostHog project in OpenTofu.

State lives in `gs://wovain-pulumi-state`; stack secrets are encrypted with the `stack-secrets` Cloud KMS key.

## How infra changes ship

1. **Pull request.** CI's `infra` job type-checks and runs both programs against mocks with no credentials (`*.test.ts`). This catches missing config, code that throws, duplicate URNs and dynamic providers that don't serialize.
2. **Preview** locally with real credentials before merging: `pnpm run infra:preview` (with the policy pack). Review the plan; `node infra/policy/guard.ts < preview.json` fails on a delete or replace of a stateful resource.
3. **Apply** with `pnpm run infra:up` from main. No workflow runs `pulumi up` yet; `gitlab-infra` already trusts GitHub Actions jobs in an `infrastructure` environment on main, for when one does.

The policy pack (`policy/index.ts`) is mandatory in every preview and `up`:

- **`stateful-resources-protected`:** databases, buckets, secrets, keys, repositories, service accounts and workload identity pools must be `protect: true`. The engine then refuses to delete or replace them, and a preview that would do so fails. To release one, run `pulumi state unprotect <urn>` and then remove its declaration while it still has `retainOnDelete`.

## GitHub

`github.ts` manages the repository (adopted, protected and retained), Dependabot alerts and security updates, and a ruleset on the default branch: no deletion, no force-push, changes only through a pull request (no approval required) whose `verify` and `infra` checks from `.github/workflows/ci.yml` passed. It also owns the `Production` environment (deploys from main only) and the Actions variables `.github/workflows/deploy.yml` reads: `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_DEPLOY_SERVICE_ACCOUNT`, `GCP_PROJECT_ID`, `GCP_REGION`, `GCP_IMAGE_REPOSITORY`, `GCP_SQL_INSTANCE`, `SITE_URL`, `DOCS_SITE_URL` and `NEXT_PUBLIC_POSTHOG_KEY`.

The provider authenticates with the `github:token` stack secret. A fine-grained token for sami-m-g/wovain needs read and write on Administration, Environments, Variables and Dependabot alerts (`pulumi config set --secret github:token <token> --cwd infra --stack prod`).

Google trusts GitHub Actions through the `github` workload identity pool (`bootstrap/index.ts`). Its provider accepts only tokens from sami-m-g/wovain (by name, repository id and owner id) on `refs/heads/main`. `gitlab-deploy` trusts only jobs in the `Production` environment, `gitlab-infra` only jobs in `infrastructure`. The two accounts keep their old ids: renaming would replace protected accounts.

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
pulumi preview --cwd infra --stack prod --refresh --policy-pack policy
pulumi up --cwd infra --stack prod --refresh --policy-pack policy
```

What the `bootstrap` preview should show: creates the `github` pool and provider and `infra-from-github`; deletes the GitLab pools and providers, `gitlab-preview` with its grants, and `infra-from-gitlab`.

What the `prod` preview should show:

- **Creates:** the `posthog-secret-key` secret (mounted once it has a value), `deployer-from-github`, the `main` ruleset, the `Production` environment and its main-only branch policy, Dependabot security updates, and one `ActionsVariable` per variable above.
- **Updates:** the repository (description, homepage https://wovain.com, topics, issues on, vulnerability alerts), the `gitlab-deploy` display name, the web services' env (no `GITLAB_FEATURE_FLAGS_*` or GitLab Observability `OTEL_*`; the refresh also drops a leftover `FAULT_INJECTION_REVISION`), and `gitlab-feature-flags-instance-id` (unmounted, retained in `legacy.ts`).
- **Deletes:** the mirror's deploy key, its private key and the "main is mirrored from GitLab" ruleset; `gitlab-ops` and its grants; the GitLab-pool grants (`deployer-from-gitlab*`, `gitlab-*-database-url`); `deployer-logging.viewer` (only the canary used it); the runners' access to `gitlab-feature-flags-instance-id`; and the `status.wovain.com` domain mapping and its DNS record (the status page was GitLab Pages).

The old ruleset lets only the mirror's deploy key update main, so on GitHub no pull request can merge until this `up` replaces it. To merge the pull request that brings this change first, set the ruleset's enforcement to Disabled (Settings > Rules > Rulesets) and merge; the `up` deletes it.

The stack config no longer has `gitlab:token`, `gitlab-ci-token`, `renovate-token`, the Duo triggers or the GitLab project and Observability ids. `deploy.yml` stays `workflow_dispatch` only until this is applied; run it once by hand, then give it a push trigger.

## Bootstrap (one time, by a project owner)

CI's account, its roles and the workload identity pool live in `bootstrap/`, not in `prod`: an account that grants itself a role can't use it in the same run, because IAM takes minutes to propagate. Apply it before any `prod` change that refers to it (above). The repository's numeric ids in `bootstrap/Pulumi.prod.yaml` come from `gh api repos/sami-m-g/wovain --jq '.id, .owner.id'`.

## dev.wovain.com

`dev.ts` runs `wovain-web-dev`, which scales to zero, in the same project and stack. It uses its own `wovain_dev` database and user on the existing Cloud SQL instance, its own `database-url-dev`, `better-auth-secret-dev` and `token-encryption-key-dev` secrets (generated by Pulumi), its own bucket and its own runtime account. It shares the provider API key secrets. No workflow deploys it yet; `gitlab-deploy` may act as its runner and read its database URL, for when one does (from a `development` environment Google would trust).

## PostHog (`posthog/`)

OpenTofu with PostHog's provider: the KPI insights and alerts (`kpis.yml`, `kpis.tf`), the dashboards, the project settings, the run-rating survey and the app's feature flags (`flags.tf`, which replace GitLab's; `TF_VAR_internal_user_ids` lists the team). The web app evaluates flags with the `posthog-secret-key` secret, mounted as `POSTHOG_SECRET_KEY` once its stack secret is set (`pulumi config set --secret posthog-secret-key <key>`). The destinations that started GitLab's ops pipeline are gone. It is applied by hand:

```sh
cd infra/posthog
export TF_VAR_posthog_project_id=$(pulumi config get posthogProjectId --cwd .. --stack prod)
export TF_VAR_posthog_api_key=$(pulumi config get posthog-personal-api-key --cwd .. --stack prod)
# Feature flags (flags.tf): the team's Better Auth user ids, as a list.
export TF_VAR_internal_user_ids='["<user id>"]'
tofu init
tofu plan
tofu apply
```

Its state used to be GitLab-managed (the `posthog` state of the GitLab project); it now lives in `gs://wovain-pulumi-state/opentofu/posthog`. Move it once, before the first `tofu plan`:

1. Download the old state. An archived project still serves it read-only: `curl -fsS -H "PRIVATE-TOKEN: <token with read_api>" -o /tmp/posthog.tfstate https://gitlab.com/api/v4/projects/87296573/terraform/state/posthog`.
2. `tofu init` (the new, empty GCS backend), then `tofu state push /tmp/posthog.tfstate`, and delete `/tmp/posthog.tfstate`: it holds the PostHog key in plain text.
3. `tofu plan` should show only the two `posthog_hog_function.ops` destinations deleted (they called GitLab's pipeline trigger) and no other change.

If the state can't be downloaded, start from an empty state instead: `import.tf` adopts the four dashboards, their insights and three KPIs and alerts. Add `import` blocks for the rest (the health dashboard and its insights, the other KPI insights and alerts, the survey and the project settings, by their PostHog ids) before the first `tofu apply`, or the apply creates duplicates. Delete the two "-> wovain ops" destinations in PostHog (Data pipeline > Destinations) by hand.
