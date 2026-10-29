// What a CI account needs to run `pulumi up` on one stack of the shared
// state bucket and nothing else: its own stack secrets key, and read and
// write on that stack's objects only (next.ts, github.ts).
import * as gcp from "@pulumi/gcp";
import type * as pulumi from "@pulumi/pulumi";

const kept = { protect: true };

interface StackAccessArgs {
  // The account's resource names start with it, e.g. `infra-next`.
  prefix: string;
  account: gcp.serviceaccount.Account;
  // The Pulumi project, e.g. `wovain-next`.
  project: string;
  // The stack secrets key's name and resource name, e.g. `next-stack-secrets`.
  keyName: string;
  keyRing: pulumi.Input<string>;
  // Its name, as fixed in state.ts.
  stateBucket: string;
}

export const stackAccess = ({
  account,
  keyName,
  keyRing,
  prefix,
  project,
  stateBucket,
}: StackAccessArgs) => {
  // The stack's own secrets key: no other stack's account can decrypt its
  // secrets (their encrypted data keys are public in the repository).
  const stackSecrets = new gcp.kms.CryptoKey(
    keyName,
    {
      destroyScheduledDuration: "2592000s",
      keyRing,
      name: keyName,
      purpose: "ENCRYPT_DECRYPT",
      versionTemplate: {
        algorithm: "GOOGLE_SYMMETRIC_ENCRYPTION",
        protectionLevel: "SOFTWARE",
      },
    },
    kept
  );
  new gcp.kms.CryptoKeyIAMMember(`${prefix}-stack-secrets`, {
    cryptoKeyId: stackSecrets.id,
    member: account.member,
    role: "roles/cloudkms.cryptoKeyEncrypterDecrypter",
  });

  // The state bucket: it lists every object's name, and reads and writes
  // only this stack's state, its locks, history and backups.
  new gcp.storage.BucketIAMMember(`${prefix}-state-list`, {
    bucket: stateBucket,
    member: account.member,
    role: "roles/storage.legacyBucketReader",
  });
  // Pulumi's object layout: .pulumi/<kind>/<project>/<stack>..., except
  // locks, which sit under the stack's fully qualified name:
  // .pulumi/locks/organization/<project>/<stack>/<lock>.json.
  const objects = `projects/_/buckets/${stateBucket}/objects/.pulumi`;
  new gcp.storage.BucketIAMMember(`${prefix}-state`, {
    bucket: stateBucket,
    condition: {
      expression: ["stacks", "locks/organization", "history", "backups"]
        .map(
          (kind) => `resource.name.startsWith("${objects}/${kind}/${project}/")`
        )
        .join(" || "),
      title: `${project.replace(/^wovain-/u, "")}'s state`,
    },
    member: account.member,
    role: "roles/storage.objectAdmin",
  });
  new gcp.storage.BucketIAMMember(`${prefix}-state-meta`, {
    bucket: stateBucket,
    condition: {
      expression: `resource.name == "${objects}/meta.yaml"`,
      title: "the backend's metadata",
    },
    member: account.member,
    role: "roles/storage.objectViewer",
  });
  return stackSecrets;
};
