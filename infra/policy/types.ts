// The resource types the policy pack (index.ts) and the preview guard
// (guard.ts) check, by Pulumi type token.

// Data or identity that a delete or replace would lose: a database, a
// bucket, a secret, a key, a repository, or a service account or workload
// identity that grants and Actions variables point at.
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
]);
