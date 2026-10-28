// Where Pulumi keeps every stack's state and the key its stack secrets are
// encrypted with (Pulumi.yaml's backend and secretsprovider). Both were
// made once with gcloud, before any stack existed, and are adopted here.
// Protected: losing either loses every stack.
import * as gcp from "@pulumi/gcp";

const kept = { protect: true };

export const pulumiState = (project: string, region: string) => {
  const keyRing = new gcp.kms.KeyRing(
    "pulumi",
    { location: region, name: "pulumi" },
    {
      ...kept,
      import: `projects/${project}/locations/${region}/keyRings/pulumi`,
    }
  );
  const stackSecrets = new gcp.kms.CryptoKey(
    "stack-secrets",
    {
      destroyScheduledDuration: "2592000s",
      keyRing: keyRing.id,
      name: "stack-secrets",
      purpose: "ENCRYPT_DECRYPT",
      versionTemplate: {
        algorithm: "GOOGLE_SYMMETRIC_ENCRYPTION",
        protectionLevel: "SOFTWARE",
      },
    },
    {
      ...kept,
      import: `projects/${project}/locations/${region}/keyRings/pulumi/cryptoKeys/stack-secrets`,
    }
  );
  // Versioned, so an earlier checkpoint can always be restored.
  const bucket = new gcp.storage.Bucket(
    "pulumi-state",
    {
      location: region.toUpperCase(),
      name: `${project}-pulumi-state`,
      publicAccessPrevention: "enforced",
      softDeletePolicy: { retentionDurationSeconds: 604_800 },
      storageClass: "STANDARD",
      uniformBucketLevelAccess: true,
      versioning: { enabled: true },
    },
    { ...kept, import: `${project}-pulumi-state` }
  );
  return { bucket, stackSecrets };
};
