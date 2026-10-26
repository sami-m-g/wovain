# infra

Pulumi (TypeScript) for wovain's Google Cloud project, GitLab project and DNS. `index.ts` is the `prod` stack, which also holds dev.wovain.com (`dev.ts`). `bootstrap/` holds CI's own identities, and `policy/` is the CrossGuard policy pack.

## How infra changes ship

1. **Merge request.** `verify:infra` type-checks and runs both programs against mocks with no credentials (`*.test.ts`). This catches missing config, code that throws, duplicate URNs and dynamic providers that don't serialize. `infra:preview` runs `pulumi preview` against the real stack with the policy pack, as `gitlab-preview`. That account is read-only and Google trusts it only from this project's merge request pipelines. The plan is linked in the merge request widget as **infra preview**. The job fails on any error, on any policy violation, and on any delete or replace of a stateful resource (`policy/guard.ts`).
2. **Review** the plan. Merge only a green, reviewed plan.
3. **Merge.** On main, `infra:production` refreshes, runs the same guarded preview and then `pulumi up`, with the same policy pack and without `--continue-on-error`. It runs alongside the image builds, and only when infra/ (or another file the program reads) changed since the stack's last successful update; `FORCE_ALL=1` on Run pipeline forces it. The migration and the rollouts run only after it succeeds.

The policy pack (`policy/index.ts`) is mandatory in every preview and `up`:

- **`stateful-resources-protected`:** databases, buckets, secrets, keys, repositories, service accounts, workload identity pools and GitLab environments must be `protect: true`. The engine then refuses to delete or replace them, and a preview that would do so fails. To release one, run `pulumi state unprotect <urn>` and then remove its declaration while it still has `retainOnDelete`.
- **`gitlab-maintainer-only`:** blocks GitLab resources that need Maintainer, such as a Pages domain or a project access token. Our role would get a 403 at apply time. A Maintainer applies them locally with `--policy-pack-config policy/maintainer.json`.

**Why there's no saved plan file between the merge request and main.** `pulumi preview --save-plan` is a preview feature and `pulumi up --plan` is experimental. A plan file is also bound to the exact state it was computed from. Every app deploy changes the Cloud Run image in that state, so a plan from the merge request would routinely fail on main. It would also have to be passed from a merge request pipeline to a main pipeline. Instead, main re-plans right before applying, under the same policy and guard, and the merge request preview shows what will change.

The merge request preview runs without `--refresh`, so it never reads secret values. Live drift therefore shows up only in main's preview.

## Bootstrap (one time, by a project owner)

CI's accounts, their roles and the workload identity pools live in `bootstrap/`, not in `prod`. An account that grants itself a role can't use it in the same run, because IAM takes minutes to propagate. Run these steps once, from the repository root, before merging the change that introduced `bootstrap/`:

```sh
pnpm run infra:install
gcloud auth application-default login --scopes=https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/userinfo.email,https://www.googleapis.com/auth/siteverification
pulumi stack init prod --cwd infra/bootstrap --secrets-provider gcpkms://projects/wovain/locations/us-central1/keyRings/pulumi/cryptoKeys/stack-secrets
# Move CI's existing identities from prod into bootstrap; nothing in Google changes.
p=urn:pulumi:prod::wovain::gcp
pulumi state move --cwd infra --source prod --dest organization/wovain-bootstrap/prod --yes \
  $p:serviceaccount/account:Account::gitlab-infra \
  $p:projects/iAMMember:IAMMember::infra-{artifactregistry.admin,cloudkms.admin,cloudsql.admin,editor,firebase.admin,iam.serviceAccountAdmin,iam.workloadIdentityPoolAdmin,resourcemanager.projectIamAdmin,run.admin,secretmanager.admin,serviceusage.serviceUsageAdmin} \
  $p:serviceaccount/iAMMember:IAMMember::infra-from-gitlab \
  $p:kms/cryptoKeyIAMMember:CryptoKeyIAMMember::infra-stack-secrets \
  $p:billing/accountIamMember:AccountIamMember::infra-budgets \
  $p:iam/workloadIdentityPool:WorkloadIdentityPool::gitlab \
  $p:iam/workloadIdentityPoolProvider:WorkloadIdentityPoolProvider::gitlab
# Optional: only these GitLab users' merge requests may preview.
# pulumi config set --cwd infra/bootstrap --stack prod --path 'previewUsers[0]' <username>
pulumi preview --cwd infra/bootstrap --stack prod --policy-pack ../policy   # creates only the gitlab-preview account, its pool and grants
pulumi up --cwd infra/bootstrap --stack prod --policy-pack ../policy
pulumi preview --cwd infra --stack prod --policy-pack policy  # no deletes of the moved resources
```

After the merge, main's `pulumi up` creates the `GCP_PREVIEW_*` CI variables, and the next merge request gets its preview. A merge request preview can decrypt the stack's secrets, so anyone who can push a branch can read them. Set `previewUsers` to limit who can preview.

## dev.wovain.com

`dev.ts` runs `wovain-web-dev`, which scales to zero, in the same project and stack. It uses its own `wovain_dev` database and user on the existing Cloud SQL instance, its own `database-url-dev`, `better-auth-secret-dev` and `token-encryption-key-dev` secrets (generated by Pulumi), its own bucket and its own runtime account. It shares the provider API key secrets. GitLab feature flags apply to both `production` and `development`. To roll a main commit out to dev, run the manual `migrate:development` job; `deploy:development` follows it automatically.
