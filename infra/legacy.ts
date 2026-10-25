// Real resources main created that the rebuild no longer uses. They are
// released, never destroyed: each is declared as before with
// retainOnDelete, so once this has been applied, deleting a declaration here
// only drops the resource from Pulumi's state and leaves it in place.
// (Firestore's database already had deletionPolicy ABANDON.)
import * as gcp from "@pulumi/gcp";
import * as github from "@pulumi/github";
import * as pulumi from "@pulumi/pulumi";

const retain = { retainOnDelete: true };

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

  // The GitHub mirror's repository: protected and retained, so no `pulumi
  // up` can delete it. Mirroring itself (deploy key, ruleset) is gone.
  new github.Repository(
    "wovain",
    {
      allowAutoMerge: false,
      deleteBranchOnMerge: true,
      description:
        "wovain: an MCP server for print-on-demand sellers (product idea → Fourthwall product → Meta Advantage+ campaign). Mirror of GitLab.",
      hasIssues: false,
      hasProjects: false,
      hasWiki: false,
      homepageUrl: "https://learn-ai-basics.devpost.com/",
      name: "wovain",
      topics: [
        "devpost",
        "fal-ai",
        "firebase",
        "fourthwall",
        "mcp",
        "mcp-apps",
        "meta-ads",
        "print-on-demand",
        "typescript",
      ],
      visibility: "public",
    },
    { import: "wovain", protect: true, retainOnDelete: true }
  );

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

  // main's WorkOS key and OTLP settings, kept with their values.
  for (const name of [
    "otel-exporter-otlp-endpoint",
    "otel-exporter-otlp-headers",
    "workos-api-key",
  ]) {
    const secret = new gcp.secretmanager.Secret(
      name,
      { replication: { auto: {} }, secretId: name },
      retain
    );
    const value = config.getSecret(name);
    if (value !== undefined) {
      new gcp.secretmanager.SecretVersion(
        name,
        { secret: secret.id, secretData: value },
        retain
      );
    }
  }
};
