# infra

Pulumi (TypeScript) for wovain's Google Cloud project, its DNS, its GitHub repository (github.com/sami-m-g/wovain) and its PostHog project. `index.ts` is the `prod` stack, which also holds dev.wovain.com (`dev.ts`). `bootstrap/` holds CI's own identities and the GitHub Actions workload identity pool, `policy/` is the CrossGuard policy pack, and `posthog/` is the PostHog project (part of the `prod` stack).

State lives in `gs://wovain-pulumi-state`; stack secrets are encrypted with the `stack-secrets` Cloud KMS key.

## How infra changes ship

1. **Pull request.** CI's `infra` job type-checks and runs both programs against mocks with no credentials (`*.test.ts`). This catches missing config, code that throws, duplicate URNs and dynamic providers that don't serialize.
2. **Preview** locally with real credentials before merging: `pnpm run infra:preview` (with the policy pack, on a copy of the state). Review the plan; `node infra/policy/guard.ts < preview.json` fails on a delete or replace of a stateful resource.
3. **Apply** with `pnpm run infra:up` from main. No workflow runs `pulumi up` yet; `gitlab-infra` already trusts GitHub Actions jobs in an `infrastructure` environment on main, for when one does.

The policy pack (`policy/index.ts`) is mandatory in every preview and `up`:

- **`stateful-resources-protected`:** databases, buckets, secrets, keys, repositories, service accounts and workload identity pools must be `protect: true`. The engine then refuses to delete or replace them, and a preview that would do so fails. To release one, run `pulumi state unprotect <urn>` and then remove its declaration while it still has `retainOnDelete`.

## GitHub

`github.ts` manages the repository (adopted, protected and retained), Dependabot alerts and security updates, and a ruleset on the default branch: no deletion, no force-push, changes only through a pull request (no approval required) whose `verify` and `infra` checks from `.github/workflows/ci.yml` passed. It also owns the `Production` environment (deploys from main only) and the Actions variables `.github/workflows/deploy.yml` reads: `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_DEPLOY_SERVICE_ACCOUNT`, `GCP_PROJECT_ID`, `GCP_REGION`, `GCP_IMAGE_REPOSITORY`, `GCP_SQL_INSTANCE`, `SITE_URL`, `DOCS_SITE_URL` and `NEXT_PUBLIC_POSTHOG_KEY`.

The provider authenticates with the `github:token` stack secret. A fine-grained token for sami-m-g/wovain needs read and write on Administration, Environments, Variables and Dependabot alerts (`pulumi config set --secret github:token <token> --cwd infra --stack prod`).

Google trusts GitHub Actions through the `github` workload identity pool (`bootstrap/index.ts`). Its provider accepts only tokens from sami-m-g/wovain (by name, repository id and owner id) on `refs/heads/main`. `gitlab-deploy` trusts only jobs in the `Production` environment, `gitlab-infra` only jobs in `infrastructure`. The two accounts keep their old ids: renaming would replace protected accounts.

## Leaving GitLab and retiring leftovers

The GitLab project is archived and read-only, so Pulumi must never try to change or delete what it created there. `scripts/pulumi.ts`, which `pnpm run infra:preview` and `pnpm run infra:up` call, does the state changes no program can make before it runs Pulumi. Each checks the state first, so a second run does nothing:

- It drops every GitLab resource from the state (`pulumi state delete --target-dependents` on the `gitlab` and `graphql` providers). Nothing is called in GitLab.
- It runs `pulumi state unprotect` on what `policy/retired.ts` releases that way: GitLab's pools, providers and accounts, and the mirror's deploy key pair.

A preview runs on a copy of the state in a throwaway local backend, with those changes applied to the copy, so it never writes the real state and shows exactly what `up` will do. Only `up` changes the real state.

Everything else `policy/retired.ts` lists is released in code: `legacy.ts` declares it without `protect` or `retainOnDelete`, and adopts with `import` what Pulumi never managed (Firebase's Admin SDK account and its roles, the default compute account's Editor role, App Hosting's Cloud Run service and image repository, and Vercel's `Preview` GitHub environment). The policy pack lets those be unprotected, and the guard lets a plan delete them. Once an `up` had written that to the state, the follow-up pull request removed the declarations (`retired.ts` marks them `deleted`), and its `up` deleted them.

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

## dev.wovain.com

`dev.ts` runs `wovain-web-dev`, which scales to zero, in the same project and stack. It uses its own `wovain_dev` database and user on the existing Cloud SQL instance, its own `database-url-dev`, `better-auth-secret-dev` and `token-encryption-key-dev` secrets (generated by Pulumi), its own bucket and its own runtime account. It shares the provider API key secrets. No workflow deploys it yet; `gitlab-deploy` may act as its runner and read its database URL, for when one does (from a `development` environment Google would trust).

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
