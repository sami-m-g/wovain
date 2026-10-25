// The resource types the policy pack (index.ts) and the preview guard
// (guard.ts) check, by Pulumi type token.

// Data or identity that a delete or replace would lose: a database, a
// bucket, a secret, a key, a repository, a service account or workload
// identity that grants and CI variables point at, a GitLab environment
// (GitLab refuses to delete one that's running).
export const STATEFUL = new Set([
  "gcp:artifactregistry/repository:Repository",
  "gcp:firebase/project:Project",
  "gcp:firestore/database:Database",
  "gcp:iam/workloadIdentityPool:WorkloadIdentityPool",
  "gcp:iam/workloadIdentityPoolProvider:WorkloadIdentityPoolProvider",
  "gcp:kms/cryptoKey:CryptoKey",
  "gcp:kms/keyRing:KeyRing",
  "gcp:secretmanager/secret:Secret",
  "gcp:serviceaccount/account:Account",
  "gcp:sql/database:Database",
  "gcp:sql/databaseInstance:DatabaseInstance",
  "gcp:storage/bucket:Bucket",
  "github:index/repository:Repository",
  "gitlab:index/project:Project",
  "gitlab:index/projectEnvironment:ProjectEnvironment",
]);

// GitLab resources that need Maintainer or Owner; wovain's role is
// Developer, so GitLab answers 403 at apply time.
export const MAINTAINER_ONLY = new Set([
  "gitlab:index/branchProtection:BranchProtection",
  "gitlab:index/complianceFramework:ComplianceFramework",
  "gitlab:index/deployKey:DeployKey",
  "gitlab:index/pagesDomain:PagesDomain",
  "gitlab:index/projectAccessToken:ProjectAccessToken",
  "gitlab:index/projectComplianceFrameworks:ProjectComplianceFrameworks",
  "gitlab:index/projectProtectedEnvironment:ProjectProtectedEnvironment",
  "gitlab:index/projectSecurityPolicyAttachment:ProjectSecurityPolicyAttachment",
]);
