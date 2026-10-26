// Real resources main created that the rebuild no longer uses. They are
// released, never destroyed: each is declared as before with
// retainOnDelete and protect (infra/policy). To drop one from Pulumi's state
// and leave it in place: `pulumi state unprotect <urn>`, then delete its
// declaration here. (Firestore's database already had deletionPolicy ABANDON.)
import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";

import { secretWithValue } from "./resources.ts";

const retain = { protect: true, retainOnDelete: true };

export const retainLegacy = ({
  project,
  projectNumber,
  region,
}: {
  project: string;
  projectNumber: string;
  region: string;
}) => {
  const config = new pulumi.Config();

  // The App Hosting backend that served main at app--wovain.us-central1.
  // hosted.app, and the bucket holding its uploaded sources.
  new gcp.firebase.AppHostingBackend(
    "app",
    {
      appId: "retained",
      backendId: "app",
      location: region,
      serviceAccount: `app-hosting@${project}.iam.gserviceaccount.com`,
      servingLocality: "GLOBAL_ACCESS",
    },
    { ...retain, ignoreChanges: ["appId"] }
  );
  new gcp.serviceaccount.Account(
    "app-hosting",
    { accountId: "app-hosting", displayName: "wovain App Hosting backend" },
    retain
  );
  new gcp.storage.Bucket(
    "apphosting-sources",
    {
      labels: { [`apphosting-source-${region}`]: "true" },
      lifecycleRules: [{ action: { type: "Delete" }, condition: { age: 30 } }],
      location: region.toUpperCase(),
      name: `firebaseapphosting-sources-${projectNumber}-${region}`,
      publicAccessPrevention: "enforced",
      uniformBucketLevelAccess: true,
    },
    retain
  );

  // main's WorkOS key and OTLP settings, kept with their values, and the docs
  // chat's retired OpenRouter key (the chat now uses Nebius).
  for (const name of [
    "otel-exporter-otlp-endpoint",
    "openrouter-api-key",
    "otel-exporter-otlp-headers",
    "workos-api-key",
  ]) {
    secretWithValue(name, config.getSecret(name), retain, retain);
  }
};
