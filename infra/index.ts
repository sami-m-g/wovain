import { readFileSync } from "node:fs";

import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";

// wovain's Google Cloud project: App Hosting runs apps/server, Firestore and a
// private bucket hold each merchant's records and artwork, Secret Manager holds
// the keys, and GitLab CI deploys through Workload Identity Federation.
const config = new pulumi.Config();
const gcpConfig = new pulumi.Config("gcp");
const project = gcpConfig.require("project");
const region = gcpConfig.require("region");
const gitlabProject = config.require("gitlabProject");
// Set to true once the GitHub app is installed from the connection's link
// (`pulumi stack output githubSetup`); the repository link and the backend's
// codebase wait for it.
const githubAuthorized = config.getBoolean("githubAuthorized") ?? false;

const apis = [
  "artifactregistry",
  "billingbudgets",
  "cloudbilling",
  "cloudbuild",
  "developerconnect",
  "firebase",
  "firebaseapphosting",
  "firebaserules",
  "firestore",
  "iam",
  "iamcredentials",
  "run",
  "secretmanager",
  "storage",
  "sts",
].map(
  (api) =>
    new gcp.projects.Service(api, {
      disableOnDestroy: false,
      service: `${api}.googleapis.com`,
    })
);
const afterApis = { dependsOn: apis };

// Records: one Firestore database; clients are refused by firestore.rules.
const database = new gcp.firestore.Database(
  "records",
  {
    deleteProtectionState: "DELETE_PROTECTION_ENABLED",
    deletionPolicy: "ABANDON",
    locationId: region,
    name: "(default)",
    type: "FIRESTORE_NATIVE",
  },
  afterApis
);
const rules = new gcp.firebaserules.Ruleset(
  "firestore-rules",
  {
    source: {
      files: [
        {
          content: readFileSync(
            new URL("../apps/server/firestore.rules", import.meta.url),
            "utf-8"
          ),
          name: "firestore.rules",
        },
      ],
    },
  },
  { dependsOn: [database] }
);
new gcp.firebaserules.Release("firestore-release", {
  name: "cloud.firestore",
  rulesetName: pulumi.interpolate`projects/${project}/rulesets/${rules.name}`,
});

// Staged artwork: private, in us-central1 for the always-free tier.
const media = new gcp.storage.Bucket(
  "media",
  {
    location: region.toUpperCase(),
    name: `${project}-media`,
    publicAccessPrevention: "enforced",
    uniformBucketLevelAccess: true,
  },
  afterApis
);

// Values are set outside code: `firebase apphosting:secrets:set <name>`.
// The names match apphosting.yaml.
const secretNames = [
  "fal-key",
  "meta-ad-account-id",
  "meta-page-id",
  "meta-pixel-id",
  "meta-system-user-token",
  "otel-exporter-otlp-endpoint",
  "otel-exporter-otlp-headers",
  "workos-api-key",
  "wovain-allowed-emails",
];
const secrets = secretNames.map(
  (name) =>
    new gcp.secretmanager.Secret(
      name,
      { replication: { auto: {} }, secretId: name },
      afterApis
    )
);

// The identity the server builds and runs as.
const runner = new gcp.serviceaccount.Account(
  "app-hosting",
  { accountId: "app-hosting", displayName: "wovain App Hosting backend" },
  afterApis
);
for (const role of [
  "roles/datastore.user",
  "roles/firebaseapphosting.computeRunner",
]) {
  new gcp.projects.IAMMember(`runner-${role.split("/")[1]}`, {
    member: runner.member,
    project,
    role,
  });
}
new gcp.storage.BucketIAMMember("runner-media", {
  bucket: media.name,
  member: runner.member,
  role: "roles/storage.objectAdmin",
});
for (const [index, secret] of secrets.entries()) {
  new gcp.secretmanager.SecretIamMember(`runner-${secretNames[index]}`, {
    member: runner.member,
    role: "roles/secretmanager.secretAccessor",
    secretId: secret.id,
  });
}

// App Hosting builds from the GitHub mirror through Developer Connect. The
// first `pulumi up` creates the connection; open the link in githubSetup to
// install the Firebase GitHub app, then set githubAuthorized.
const developerConnect = new gcp.projects.ServiceIdentity(
  "developerconnect-agent",
  { service: "developerconnect.googleapis.com" },
  afterApis
);
const connectionAccess = new gcp.projects.IAMMember(
  "developerconnect-secrets",
  {
    member: developerConnect.member,
    project,
    role: "roles/secretmanager.admin",
  }
);
const github = new gcp.developerconnect.Connection(
  "github",
  {
    connectionId: "github",
    githubConfig: { githubApp: "FIREBASE" },
    location: region,
  },
  {
    dependsOn: [connectionAccess],
    ignoreChanges: [
      "githubConfig.appInstallationId",
      "githubConfig.authorizerCredential",
    ],
  }
);
const repository = githubAuthorized
  ? new gcp.developerconnect.GitRepositoryLink("wovain", {
      cloneUri: config.require("githubRepo"),
      gitRepositoryLinkId: "wovain",
      location: region,
      parentConnection: github.connectionId,
    })
  : undefined;

const webApp = new gcp.firebase.WebApp(
  "wovain",
  { deletionPolicy: "ABANDON", displayName: "wovain" },
  afterApis
);
const backend = new gcp.firebase.AppHostingBackend("app", {
  appId: webApp.appId,
  backendId: "app",
  ...(repository === undefined
    ? {}
    : { codebase: { repository: repository.name, rootDirectory: "/" } }),
  location: region,
  serviceAccount: runner.email,
  servingLocality: "GLOBAL_ACCESS",
});

// GitLab CI deploys from main only, with short-lived tokens and no key.
const pool = new gcp.iam.WorkloadIdentityPool(
  "gitlab",
  { displayName: "GitLab CI", workloadIdentityPoolId: "gitlab" },
  afterApis
);
const provider = new gcp.iam.WorkloadIdentityPoolProvider("gitlab", {
  // Only the protected main branch, not a tag or branch that happens to be
  // called main.
  attributeCondition: `assertion.project_path == "${gitlabProject}" && assertion.ref == "main" && assertion.ref_type == "branch" && assertion.ref_protected == "true"`,
  attributeMapping: {
    "attribute.project_path": "assertion.project_path",
    "attribute.ref": "assertion.ref",
    "attribute.ref_protected": "assertion.ref_protected",
    "attribute.ref_type": "assertion.ref_type",
    "google.subject": "assertion.sub",
  },
  oidc: { issuerUri: "https://gitlab.com" },
  workloadIdentityPoolId: pool.workloadIdentityPoolId,
  workloadIdentityPoolProviderId: "gitlab",
});
const deployer = new gcp.serviceaccount.Account(
  "gitlab-deploy",
  { accountId: "gitlab-deploy", displayName: "GitLab CI deploys" },
  afterApis
);
new gcp.serviceaccount.IAMMember("deployer-from-gitlab", {
  member: pulumi.interpolate`principalSet://iam.googleapis.com/${pool.name}/attribute.ref/main`,
  role: "roles/iam.workloadIdentityUser",
  serviceAccountId: deployer.name,
});
for (const role of [
  "roles/firebase.viewer",
  "roles/firebaseapphosting.developer",
  "roles/serviceusage.serviceUsageConsumer",
]) {
  new gcp.projects.IAMMember(`deployer-${role.split("/")[1]}`, {
    member: deployer.member,
    project,
    role,
  });
}
new gcp.serviceaccount.IAMMember("deployer-acts-as-runner", {
  member: deployer.member,
  role: "roles/iam.serviceAccountUser",
  serviceAccountId: runner.name,
});

// The CI `infra` job runs `pulumi up` on main as this account: it manages the
// resources above, their IAM, the state bucket and the budget.
const infra = new gcp.serviceaccount.Account(
  "gitlab-infra",
  {
    accountId: "gitlab-infra",
    displayName: "GitLab CI infrastructure (Pulumi)",
  },
  afterApis
);
new gcp.serviceaccount.IAMMember("infra-from-gitlab", {
  member: pulumi.interpolate`principalSet://iam.googleapis.com/${pool.name}/attribute.ref/main`,
  role: "roles/iam.workloadIdentityUser",
  serviceAccountId: infra.name,
});
for (const role of [
  "roles/developerconnect.admin",
  "roles/editor",
  "roles/firebase.admin",
  "roles/iam.serviceAccountAdmin",
  "roles/iam.workloadIdentityPoolAdmin",
  "roles/resourcemanager.projectIamAdmin",
  "roles/secretmanager.admin",
  "roles/serviceusage.serviceUsageAdmin",
]) {
  new gcp.projects.IAMMember(`infra-${role.split("/")[1]}`, {
    member: infra.member,
    project,
    role,
  });
}

// Email alerts at 50%, 90% and 100% of $5 a month.
// The billing account is read from the project, so its ID stays out of git.
const { billingAccount, number: projectNumber } =
  await gcp.organizations.getProject({
    projectId: project,
  });
new gcp.billing.Budget(
  "monthly",
  {
    amount: { specifiedAmount: { currencyCode: "USD", units: "5" } },
    billingAccount,
    budgetFilter: { projects: [`projects/${projectNumber}`] },
    displayName: "wovain monthly",
    thresholdRules: [0.5, 0.9, 1].map((thresholdPercent) => ({
      thresholdPercent,
    })),
  },
  afterApis
);

// Budgets live on the billing account, so the infra account needs a role there.
new gcp.billing.AccountIamMember("infra-budgets", {
  billingAccountId: billingAccount,
  member: infra.member,
  role: "roles/billing.costsManager",
});

// GitLab CI variables and the site URL come from these.
export const bucket = media.name;
export const infraServiceAccount = infra.email;
export const deployServiceAccount = deployer.email;
export const githubSetup = github.installationStates;
export const siteUrl = pulumi.interpolate`https://${backend.backendId}--${project}.${region}.hosted.app`;
export const workloadIdentityProvider = provider.name;
