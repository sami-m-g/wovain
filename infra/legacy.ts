// Real resources nothing uses anymore, on their way out (policy/retired.ts).
// Each is declared here without protect or retainOnDelete, and adopted with
// `import` when it isn't in the state yet, so an `up` of this file changes
// nothing in Google Cloud or GitHub: it only lets Pulumi delete them. The
// pull request that then removes these declarations deletes them.
//
// gitlab-feature-flags-instance-id is the exception: production's frozen
// revision still mounts it (`wovain:freezeProduction`), so it and wovain-web's access to
// it stay, retained, until production next deploys.
import * as gcp from "@pulumi/gcp";
import * as github from "@pulumi/github";
import * as pulumi from "@pulumi/pulumi";

import { secretWithValue } from "./resources.ts";

const retain = { protect: true, retainOnDelete: true };
const release = { protect: false, retainOnDelete: false };

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

  // Kept while production's live revision reads it (see above).
  const { secret: featureFlags } = secretWithValue(
    "gitlab-feature-flags-instance-id",
    config.getSecret("gitlab-feature-flags-instance-id"),
    retain,
    retain
  );
  new gcp.secretmanager.SecretIamMember(
    "runner-gitlab-feature-flags-instance-id",
    {
      member: `serviceAccount:wovain-web@${project}.iam.gserviceaccount.com`,
      role: "roles/secretmanager.secretAccessor",
      secretId: featureFlags.id,
    },
    { retainOnDelete: true }
  );

  // The App Hosting backend that served main at app--wovain.us-central1.
  // hosted.app, before Cloud Run, and what App Hosting made for it: its
  // Cloud Run service `app`, the bucket of uploaded sources and the image
  // repository. Nothing routes to it.
  const backend = new gcp.firebase.AppHostingBackend(
    "app",
    {
      appId: "retained",
      backendId: "app",
      location: region,
      serviceAccount: `app-hosting@${project}.iam.gserviceaccount.com`,
      servingLocality: "GLOBAL_ACCESS",
    },
    { ...release, ignoreChanges: ["appId"] }
  );
  // The v1 resource: it deletes without a deletion-protection flag, which
  // the v2 one would need set in the state first. Its settings are App
  // Hosting's, so none is compared on import.
  new gcp.cloudrun.Service(
    "apphosting-app",
    { location: region, name: "app" },
    {
      ...release,
      dependsOn: [backend],
      ignoreChanges: ["*"],
      import: `locations/${region}/namespaces/${project}/services/app`,
    }
  );
  new gcp.artifactregistry.Repository(
    "apphosting-images",
    {
      format: "DOCKER",
      location: region,
      repositoryId: "firebaseapphosting-images",
    },
    {
      ...release,
      ignoreChanges: ["*"],
      import: `projects/${project}/locations/${region}/repositories/firebaseapphosting-images`,
    }
  );
  new gcp.serviceaccount.Account(
    "app-hosting",
    { accountId: "app-hosting", displayName: "wovain App Hosting backend" },
    release
  );
  new gcp.storage.Bucket(
    "apphosting-sources",
    {
      // Its uploads expire after 30 days; the delete takes the rest.
      forceDestroy: true,
      labels: { [`apphosting-source-${region}`]: "true" },
      lifecycleRules: [{ action: { type: "Delete" }, condition: { age: 30 } }],
      location: region.toUpperCase(),
      name: `firebaseapphosting-sources-${projectNumber}-${region}`,
      publicAccessPrevention: "enforced",
      uniformBucketLevelAccess: true,
    },
    release
  );

  // main's WorkOS key and GitLab Observability's OTLP settings, read only by
  // the App Hosting build, and the docs chat's retired OpenRouter key.
  for (const name of [
    "otel-exporter-otlp-endpoint",
    "openrouter-api-key",
    "otel-exporter-otlp-headers",
    "workos-api-key",
  ]) {
    secretWithValue(name, config.getSecret(name), release, release);
  }

  // Firebase's Admin SDK account and its two project roles. No app uses
  // the Admin SDK (App Hosting used its own service agent), and the account
  // has no keys.
  const adminSdk = new gcp.serviceaccount.Account(
    "firebase-adminsdk",
    {
      accountId: "firebase-adminsdk-fbsvc",
      description: "Firebase Admin SDK Service Agent",
      displayName: "firebase-adminsdk",
    },
    {
      ...release,
      import: `projects/${project}/serviceAccounts/firebase-adminsdk-fbsvc@${project}.iam.gserviceaccount.com`,
    }
  );
  for (const role of [
    "roles/firebase.sdkAdminServiceAgent",
    "roles/iam.serviceAccountTokenCreator",
  ]) {
    const member = `serviceAccount:firebase-adminsdk-fbsvc@${project}.iam.gserviceaccount.com`;
    new gcp.projects.IAMMember(
      `firebase-adminsdk-${role.split("/")[1]}`,
      { member, project, role },
      {
        ...release,
        dependsOn: [adminSdk],
        import: `${project} ${role} ${member}`,
      }
    );
  }

  // Compute Engine's default account gets Editor on the project; nothing
  // runs as it (Cloud Run uses its own accounts, builds run in GitHub
  // Actions). Only the grant goes: Google manages the account.
  const computeAccount = `serviceAccount:${projectNumber}-compute@developer.gserviceaccount.com`;
  new gcp.projects.IAMMember(
    "compute-default-editor",
    { member: computeAccount, project, role: "roles/editor" },
    { ...release, import: `${project} roles/editor ${computeAccount}` }
  );

  // Vercel's `Preview` GitHub environment: its last deployment was on
  // 2026-10-20, before the app moved to Cloud Run.
  new github.RepositoryEnvironment(
    "vercel-preview",
    { environment: "Preview", repository: "wovain" },
    { ...release, import: "wovain:Preview" }
  );
};
