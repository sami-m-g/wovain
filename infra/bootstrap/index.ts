// The identities GitLab CI runs as and the workload identity pools that trust
// it. A project owner applies this stack once (infra/README.md), apart from
// infra/: an account that grants itself a role can't use it in the same run,
// since IAM takes minutes to propagate, so CI never manages its own access.
import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();
const gcpConfig = new pulumi.Config("gcp");
const project = gcpConfig.require("project");
const region = gcpConfig.require("region");
const gitlabProject = config.require("gitlabProject");
// GitLab usernames whose merge requests get a preview; unset, everyone's.
const previewUsers = config.getObject<string[]>("previewUsers");

const { billingAccount } = await gcp.organizations.getProject({
  projectId: project,
});
// Deleting or replacing any of these would cut CI off (infra/policy).
const kept = { protect: true };
const oidc = { issuerUri: "https://gitlab.com" };
const workloadIdentityUser = "roles/iam.workloadIdentityUser";
// Pulumi's stack secrets key and state bucket, made once with gcloud.
const stackSecrets = `projects/${project}/locations/${region}/keyRings/pulumi/cryptoKeys/stack-secrets`;
const stateBucket = `${project}-pulumi-state`;

// main: `pulumi up` as gitlab-infra, from the protected main branch and the
// infrastructure environment only (.gitlab/ci/deploy.yml). The deploy and ops
// accounts trust other environments of the same pool (infra/index.ts).
const pool = new gcp.iam.WorkloadIdentityPool(
  "gitlab",
  { displayName: "GitLab CI", workloadIdentityPoolId: "gitlab" },
  kept
);
export const workloadIdentityProvider =
  new gcp.iam.WorkloadIdentityPoolProvider(
    "gitlab",
    {
      // Not a tag or an unprotected branch that happens to be called main.
      attributeCondition: `assertion.project_path == "${gitlabProject}" && assertion.ref == "main" && assertion.ref_type == "branch" && assertion.ref_protected == "true"`,
      attributeMapping: {
        "attribute.environment": "assertion.environment",
        "attribute.project_path": "assertion.project_path",
        "attribute.ref": "assertion.ref",
        "attribute.ref_protected": "assertion.ref_protected",
        "attribute.ref_type": "assertion.ref_type",
        "google.subject": "assertion.sub",
      },
      oidc,
      workloadIdentityPoolId: pool.workloadIdentityPoolId,
      workloadIdentityPoolProviderId: "gitlab",
    },
    kept
  ).name;

const infra = new gcp.serviceaccount.Account(
  "gitlab-infra",
  {
    accountId: "gitlab-infra",
    displayName: "GitLab CI infrastructure (Pulumi)",
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
new gcp.serviceaccount.IAMMember("infra-from-gitlab", {
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

// Merge requests: `pulumi preview` as gitlab-preview, which reads the stack
// and the project and changes nothing (.gitlab/ci/verify.yml). Its own pool:
// a principal set spans every provider in a pool, so a merge request's token
// never matches main's environment bindings above.
const previewPool = new gcp.iam.WorkloadIdentityPool(
  "gitlab-mr",
  { displayName: "GitLab merge requests", workloadIdentityPoolId: "gitlab-mr" },
  kept
);
export const previewWorkloadIdentityProvider =
  new gcp.iam.WorkloadIdentityPoolProvider(
    "gitlab-mr",
    {
      attributeCondition: [
        `assertion.project_path == "${gitlabProject}"`,
        `assertion.pipeline_source == "merge_request_event"`,
        ...(previewUsers === undefined
          ? []
          : [`assertion.user_login in ${JSON.stringify(previewUsers)}`]),
      ].join(" && "),
      attributeMapping: { "google.subject": "assertion.sub" },
      oidc,
      workloadIdentityPoolId: previewPool.workloadIdentityPoolId,
      workloadIdentityPoolProviderId: "gitlab-mr",
    },
    kept
  ).name;

const preview = new gcp.serviceaccount.Account(
  "gitlab-preview",
  {
    accountId: "gitlab-preview",
    displayName: "GitLab CI merge request preview (read-only)",
  },
  kept
);
export const previewServiceAccount = preview.email;
new gcp.serviceaccount.IAMMember("preview-from-gitlab", {
  member: pulumi.interpolate`principalSet://iam.googleapis.com/${previewPool.name}/*`,
  role: workloadIdentityUser,
  serviceAccountId: preview.name,
});
// Read the project (viewer), bill API calls to it (the providers'
// userProjectOverride), read the state and decrypt the stack's secrets. A
// preview without --refresh reads no secret values.
for (const role of [
  "roles/serviceusage.serviceUsageConsumer",
  "roles/viewer",
]) {
  new gcp.projects.IAMMember(`preview-${role.split("/")[1]}`, {
    member: preview.member,
    project,
    role,
  });
}
new gcp.storage.BucketIAMMember("preview-state", {
  bucket: stateBucket,
  member: preview.member,
  role: "roles/storage.objectViewer",
});
new gcp.kms.CryptoKeyIAMMember("preview-stack-secrets", {
  cryptoKeyId: stackSecrets,
  member: preview.member,
  role: "roles/cloudkms.cryptoKeyDecrypter",
});
