// The infrastructure account and the workload identity pool that lets GitHub
// Actions act as CI's accounts. A project owner applies this stack once
// (infra/README.md), apart from infra/: an account that grants itself a role
// can't use it in the same run, since IAM takes minutes to propagate, so CI
// never manages its own access.
import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";

import { pullRequestPreviews } from "./preview.ts";
import { pulumiState } from "./state.ts";

const config = new pulumi.Config();
const gcpConfig = new pulumi.Config("gcp");
const project = gcpConfig.require("project");
const region = gcpConfig.require("region");
// The repository by its numeric ids as well as its name: a deleted and
// re-created repository or account with the same name gets new ids
// (cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines).
const githubRepository = config.require("githubRepository");
const githubRepositoryId = config.require("githubRepositoryId");
const githubOwnerId = config.require("githubOwnerId");

const { billingAccount } = await gcp.organizations.getProject({
  projectId: project,
});
// Deleting or replacing any of these would cut CI off (infra/policy).
const kept = { protect: true };
const workloadIdentityUser = "roles/iam.workloadIdentityUser";
// The state bucket and the stack secrets key (state.ts).
const state = pulumiState(project, region);
const stackSecrets = state.stackSecrets.id;

// GitHub Actions' OIDC tokens, from this repository's main branch only: no
// pull request, other branch or tag gets a Google token. Each account trusts
// one GitHub environment of the pool: gitlab-deploy `Production`
// (infra/index.ts) and gitlab-infra `infrastructure` (below).
const pool = new gcp.iam.WorkloadIdentityPool(
  "github",
  { displayName: "GitHub Actions", workloadIdentityPoolId: "github" },
  kept
);
export const workloadIdentityProvider =
  new gcp.iam.WorkloadIdentityPoolProvider(
    "github",
    {
      attributeCondition: [
        `assertion.repository == "${githubRepository}"`,
        `assertion.repository_id == "${githubRepositoryId}"`,
        `assertion.repository_owner_id == "${githubOwnerId}"`,
        `assertion.ref == "refs/heads/main"`,
      ].join(" && "),
      attributeMapping: {
        "attribute.environment": "assertion.environment",
        "attribute.ref": "assertion.ref",
        "attribute.repository": "assertion.repository",
        "google.subject": "assertion.sub",
      },
      displayName: "GitHub Actions",
      oidc: { issuerUri: "https://token.actions.githubusercontent.com" },
      workloadIdentityPoolId: pool.workloadIdentityPoolId,
      workloadIdentityPoolProviderId: "github",
    },
    kept
  ).name;

// `pulumi up` from CI. Its account id predates GitHub; renaming it would
// replace a protected account and its grants.
const infra = new gcp.serviceaccount.Account(
  "gitlab-infra",
  {
    accountId: "gitlab-infra",
    displayName: "CI infrastructure (Pulumi)",
  },
  kept
);
export const infraServiceAccount = infra.email;
for (const role of [
  "roles/artifactregistry.admin",
  "roles/cloudkms.admin",
  "roles/cloudsql.admin",
  "roles/editor",
  "roles/firebase.admin",
  "roles/iam.serviceAccountAdmin",
  "roles/iam.workloadIdentityPoolAdmin",
  "roles/resourcemanager.projectIamAdmin",
  "roles/run.admin",
  "roles/secretmanager.admin",
  "roles/serviceusage.serviceUsageAdmin",
]) {
  new gcp.projects.IAMMember(`infra-${role.split("/")[1]}`, {
    member: infra.member,
    project,
    role,
  });
}
// Only jobs in the `infrastructure` GitHub environment, on main.
new gcp.serviceaccount.IAMMember("infra-from-github", {
  member: pulumi.interpolate`principalSet://iam.googleapis.com/${pool.name}/attribute.environment/infrastructure`,
  role: workloadIdentityUser,
  serviceAccountId: infra.name,
});
new gcp.kms.CryptoKeyIAMMember("infra-stack-secrets", {
  cryptoKeyId: stackSecrets,
  member: infra.member,
  role: "roles/cloudkms.cryptoKeyEncrypterDecrypter",
});
// Budgets live on the billing account.
new gcp.billing.AccountIamMember("infra-budgets", {
  billingAccountId: billingAccount,
  member: infra.member,
  role: "roles/billing.costsManager",
});

// Read-only previews of pull requests (preview.ts).
const previews = pullRequestPreviews({
  bucket: state.bucket,
  githubOwnerId,
  githubRepository,
  githubRepositoryId,
  project,
  stackSecrets: state.stackSecrets,
});
export const previewServiceAccount = previews.account;
export const previewWorkloadIdentityProvider = previews.provider;
