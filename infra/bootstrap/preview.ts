// Read-only previews of pull requests (.github/workflows/infra.yml). A pool
// of its own, apart from `github`: a pull request's job runs code from its
// branch, so nothing it can reach may change anything. Its one account
// reads the project, the state and the stack secrets, and has no other
// grant. Fork pull requests get no OIDC token at all.
import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";

interface PreviewArgs {
  bucket: gcp.storage.Bucket;
  githubOwnerId: string;
  githubRepository: string;
  githubRepositoryId: string;
  project: string;
  stackSecrets: gcp.kms.CryptoKey;
}

export const pullRequestPreviews = (args: PreviewArgs) => {
  const kept = { protect: true };
  const pool = new gcp.iam.WorkloadIdentityPool(
    "github-pull-requests",
    {
      displayName: "GitHub pull request previews",
      workloadIdentityPoolId: "github-pull-requests",
    },
    kept
  );
  const provider = new gcp.iam.WorkloadIdentityPoolProvider(
    "github-pull-requests",
    {
      attributeCondition: [
        `assertion.repository == "${args.githubRepository}"`,
        `assertion.repository_id == "${args.githubRepositoryId}"`,
        `assertion.repository_owner_id == "${args.githubOwnerId}"`,
        `assertion.event_name == "pull_request"`,
      ].join(" && "),
      attributeMapping: {
        "attribute.repository": "assertion.repository",
        "google.subject": "assertion.sub",
      },
      displayName: "GitHub pull requests",
      oidc: { issuerUri: "https://token.actions.githubusercontent.com" },
      workloadIdentityPoolId: pool.workloadIdentityPoolId,
      workloadIdentityPoolProviderId: "github",
    },
    kept
  );
  const account = new gcp.serviceaccount.Account(
    "infra-preview",
    {
      accountId: "infra-preview",
      displayName: "CI infrastructure previews (read-only)",
    },
    kept
  );
  new gcp.serviceaccount.IAMMember("infra-preview-from-github", {
    member: pulumi.interpolate`principalSet://iam.googleapis.com/${pool.name}/attribute.repository/${args.githubRepository}`,
    role: "roles/iam.workloadIdentityUser",
    serviceAccountId: account.name,
  });
  for (const role of [
    "roles/viewer",
    "roles/serviceusage.serviceUsageConsumer",
  ]) {
    new gcp.projects.IAMMember(`infra-preview-${role.split("/")[1]}`, {
      member: account.member,
      project: args.project,
      role,
    });
  }
  // The preview copies the state to a local backend, so it only reads it.
  new gcp.storage.BucketIAMMember("infra-preview-state", {
    bucket: args.bucket.name,
    member: account.member,
    role: "roles/storage.objectViewer",
  });
  new gcp.kms.CryptoKeyIAMMember("infra-preview-stack-secrets", {
    cryptoKeyId: args.stackSecrets.id,
    member: account.member,
    role: "roles/cloudkms.cryptoKeyDecrypter",
  });
  return { account: account.email, provider: provider.name };
};
