import "./duo.ts";
import "./workos.ts";
import { readFileSync } from "node:fs";

import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";

import { mirrorPrivateKey } from "./github.ts";
import { ciVariables, environments } from "./gitlab.ts";

// wovain's Google Cloud project: App Hosting runs apps/server, Firestore and a
// private bucket hold each merchant's records and artwork, Secret Manager holds
// the keys, and GitLab CI deploys through Workload Identity Federation.
const config = new pulumi.Config();
const gcpConfig = new pulumi.Config("gcp");
const project = gcpConfig.require("project");
const region = gcpConfig.require("region");
const gitlabProject = config.require("gitlabProject");

// The billing account is read from the project, so its ID stays out of git.
const { billingAccount, number: projectNumber } =
  await gcp.organizations.getProject({
    projectId: project,
  });

const apis = [
  "artifactregistry",
  "billingbudgets",
  "cloudkms",
  "cloudbilling",
  "cloudbuild",
  "firebase",
  "firebaseapphosting",
  "firebaserules",
  "firebasestorage",
  "firestore",
  "iam",
  "iamcredentials",
  "logging",
  "monitoring",
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

// Firebase was added to the project by hand at first; adopted, never removed.
const firebase = new gcp.firebase.Project(
  "firebase",
  { project },
  { ...afterApis, import: project, protect: true, retainOnDelete: true }
);

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
// Linked to Firebase only so storage.rules applies, which refuses every client.
const mediaLink = new gcp.firebase.StorageBucket(
  "media",
  { bucketId: media.name },
  { dependsOn: [firebase, ...apis] }
);
const storageRules = new gcp.firebaserules.Ruleset(
  "storage-rules",
  {
    source: {
      files: [
        {
          content: readFileSync(
            new URL("../apps/server/storage.rules", import.meta.url),
            "utf-8"
          ),
          name: "storage.rules",
        },
      ],
    },
  },
  { dependsOn: [mediaLink] }
);
new gcp.firebaserules.Release("storage-release", {
  name: pulumi.interpolate`firebase.storage/${media.name}`,
  rulesetName: pulumi.interpolate`projects/${project}/rulesets/${storageRules.name}`,
});

// The names match apphosting.yaml. Each value is stack config encrypted with
// the KMS key in Pulumi.prod.yaml: `pulumi config set --secret <name>`; a
// secret without a value gets no version (App Hosting won't build until it has
// one).
const secretNames = [
  "fal-key",
  "meta-app-id",
  "meta-app-secret",
  "nebius-api-key",
  "otel-exporter-otlp-endpoint",
  "otel-exporter-otlp-headers",
  "qloo-api-key",
  "tavily-api-key",
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
for (const [index, secret] of secrets.entries()) {
  const name = secretNames[index] ?? "";
  const value = config.getSecret(name);
  if (value !== undefined) {
    new gcp.secretmanager.SecretVersion(name, {
      secret: secret.id,
      secretData: value,
    });
  }
}

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
// The build resolves each secret's latest version, so it reads the secret's
// metadata as well as its value (what `firebase apphosting:secrets:grantaccess`
// grants).
for (const [index, secret] of secrets.entries()) {
  for (const role of [
    "roles/secretmanager.secretAccessor",
    "roles/secretmanager.viewer",
  ]) {
    new gcp.secretmanager.SecretIamMember(
      `runner-${secretNames[index]}${role.endsWith("viewer") ? "-viewer" : ""}`,
      { member: runner.member, role, secretId: secret.id }
    );
  }
}

// App Hosting builds from source that GitLab CI uploads (`firebase deploy
// --only apphosting`, firebase.json), so the backend has no linked repository.
// The CLI keeps uploads in this bucket; it finds it by its label.
const sources = new gcp.storage.Bucket(
  "apphosting-sources",
  {
    labels: { [`apphosting-source-${region}`]: "true" },
    lifecycleRules: [{ action: { type: "Delete" }, condition: { age: 30 } }],
    location: region.toUpperCase(),
    name: `firebaseapphosting-sources-${projectNumber}-${region}`,
    publicAccessPrevention: "enforced",
    uniformBucketLevelAccess: true,
  },
  afterApis
);

const webApp = new gcp.firebase.WebApp(
  "wovain",
  { deletionPolicy: "ABANDON", displayName: "wovain" },
  afterApis
);
const backend = new gcp.firebase.AppHostingBackend("app", {
  appId: webApp.appId,
  backendId: "app",
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
    "attribute.environment": "assertion.environment",
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
// Each account answers only to jobs in its own GitLab environment.
new gcp.serviceaccount.IAMMember("deployer-from-gitlab", {
  member: pulumi.interpolate`principalSet://iam.googleapis.com/${pool.name}/attribute.environment/production`,
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
// The CLI lists buckets to find the sources bucket, then uploads to it.
new gcp.projects.IAMMember("deployer-bucketViewer", {
  member: deployer.member,
  project,
  role: "roles/storage.bucketViewer",
});
new gcp.storage.BucketIAMMember("deployer-sources", {
  bucket: sources.name,
  member: deployer.member,
  role: "roles/storage.objectAdmin",
});
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
  member: pulumi.interpolate`principalSet://iam.googleapis.com/${pool.name}/attribute.environment/infrastructure`,
  role: "roles/iam.workloadIdentityUser",
  serviceAccountId: infra.name,
});
const infraRoles = [
  "roles/cloudkms.admin",
  "roles/editor",
  "roles/firebase.admin",
  "roles/iam.serviceAccountAdmin",
  "roles/iam.workloadIdentityPoolAdmin",
  "roles/resourcemanager.projectIamAdmin",
  "roles/secretmanager.admin",
  "roles/serviceusage.serviceUsageAdmin",
].map(
  (role) =>
    new gcp.projects.IAMMember(`infra-${role.split("/")[1]}`, {
      member: infra.member,
      project,
      role,
    })
);

// The self-healing loop (.gitlab/ci/loop.yml) reads production's logs and
// metrics as this account, from the operations environment only. It can't
// read secrets or change anything.
const ops = new gcp.serviceaccount.Account(
  "gitlab-ops",
  {
    accountId: "gitlab-ops",
    displayName: "GitLab CI operations (self-healing loop)",
  },
  afterApis
);
new gcp.serviceaccount.IAMMember("ops-from-gitlab", {
  member: pulumi.interpolate`principalSet://iam.googleapis.com/${pool.name}/attribute.environment/operations`,
  role: "roles/iam.workloadIdentityUser",
  serviceAccountId: ops.name,
});
for (const role of ["roles/logging.viewer", "roles/monitoring.viewer"]) {
  new gcp.projects.IAMMember(`ops-${role.split("/")[1]}`, {
    member: ops.member,
    project,
    role,
  });
}

// The weekly analysis (apps/ops/src/weekly.ts) is the only job that reads
// merchants' records, for funnel counts and one aggregate of fal clips' GPU
// seconds, so it has its own account, trusted only from its own analytics
// environment. records.ts reads statuses and fal job timings through field
// masks; the grants stay KMS-encrypted and this account can't use the key.
// The loop and sci jobs never get Firestore access.
const analytics = new gcp.serviceaccount.Account(
  "gitlab-analytics",
  {
    accountId: "gitlab-analytics",
    displayName: "GitLab CI weekly analysis (funnel counts)",
  },
  afterApis
);
new gcp.serviceaccount.IAMMember("analytics-from-gitlab", {
  member: pulumi.interpolate`principalSet://iam.googleapis.com/${pool.name}/attribute.environment/analytics`,
  role: "roles/iam.workloadIdentityUser",
  serviceAccountId: analytics.name,
});
for (const role of ["roles/datastore.viewer", "roles/monitoring.viewer"]) {
  new gcp.projects.IAMMember(`analytics-${role.split("/")[1]}`, {
    member: analytics.member,
    project,
    role,
  });
}

// Merchants' Fourthwall and fal grants are encrypted with this key
// (apps/server/src/lib/cipher.ts, WOVAIN_KMS_KEY in apphosting.yaml), and
// only the runner may use it. Key rings and keys can't be deleted in KMS.
const keyRing = new gcp.kms.KeyRing(
  "wovain",
  { location: region, name: "wovain" },
  { ...afterApis, protect: true }
);
const connectionsKey = new gcp.kms.CryptoKey(
  "connections",
  {
    keyRing: keyRing.id,
    name: "connections",
    purpose: "ENCRYPT_DECRYPT",
    rotationPeriod: "7776000s",
  },
  { protect: true }
);
// Setting a key's IAM needs cloudkms.admin, granted to the infra account above.
new gcp.kms.CryptoKeyIAMMember(
  "runner-connections",
  {
    cryptoKeyId: connectionsKey.id,
    member: runner.member,
    role: "roles/cloudkms.cryptoKeyEncrypterDecrypter",
  },
  { dependsOn: infraRoles }
);

// Pending connect links, launch confirmations and OAuth flows expire within 10
// minutes; Firestore deletes the leftovers by their expiresAt timestamp.
for (const collection of [
  "connectTickets",
  "launchApprovals",
  "launchRequests",
  "oauthFlows",
]) {
  new gcp.firestore.Field(`ttl-${collection}`, {
    collection,
    database: database.name,
    field: "expiresAt",
    indexConfig: {},
    ttlConfig: {},
  });
}

// Email alerts at 50%, 90% and 100% of $5 a month.
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

// Stack secrets are encrypted with this key (created once with gcloud, like
// the state bucket), so the infra job decrypts with it.
new gcp.kms.CryptoKeyIAMMember("infra-stack-secrets", {
  cryptoKeyId: `projects/${project}/locations/${region}/keyRings/pulumi/cryptoKeys/stack-secrets`,
  member: infra.member,
  role: "roles/cloudkms.cryptoKeyEncrypterDecrypter",
});

// Budgets live on the billing account, so the infra account needs a role there.
new gcp.billing.AccountIamMember("infra-budgets", {
  billingAccountId: billingAccount,
  member: infra.member,
  role: "roles/billing.costsManager",
});

export const bucket = media.name;
export const connectionsKeyName = connectionsKey.id;
export const siteUrl = pulumi.interpolate`https://${backend.backendId}--${project}.${region}.hosted.app`;

// GitLab Observability is enabled on the project's group; its id names the
// instance (docs.gitlab.com, operations/observability/api_access).
const o11yGroupId = config.require("o11yGroupId");
const o11yApiKey = config.getSecret("o11y-api-key");

// What the pipeline reads. The tokens are stack secrets
// (`pulumi config set --secret <name>`); everything else comes from above.
ciVariables({
  FIREBASE_PROJECT_ID: { protected: true, value: project },
  GCP_ANALYTICS_SERVICE_ACCOUNT: {
    created: true,
    protected: true,
    value: analytics.email,
  },
  GCP_DEPLOY_SERVICE_ACCOUNT: { protected: true, value: deployer.email },
  GCP_INFRA_SERVICE_ACCOUNT: { protected: true, value: infra.email },
  GCP_OPS_SERVICE_ACCOUNT: { created: true, protected: true, value: ops.email },
  GCP_WORKLOAD_IDENTITY_PROVIDER: { protected: true, value: provider.name },
  GITHUB_MIRROR_KEY: { masked: true, protected: true, value: mirrorPrivateKey },
  // GitLab's CI observability export (pipeline metrics, logs and traces).
  GITLAB_OBSERVABILITY_EXPORT: {
    protected: false,
    value: "metrics,logs,traces",
  },
  // The group's GitLab Observability (SigNoz) query API, which the loop reads
  // with an API key made in the group's Observe > API Keys. Until the
  // `o11y-api-key` stack secret is set, the loop reads Google Cloud only.
  ...(o11yApiKey === undefined
    ? {}
    : {
        GITLAB_O11Y_API_KEY: {
          created: true,
          masked: true,
          protected: true,
          value: o11yApiKey,
        },
      }),
  GITLAB_O11Y_URL: {
    created: true,
    protected: true,
    value: `https://${o11yGroupId}.gitlab-o11y.com`,
  },
  // semantic-release, the ai-catalog sync and the loop, all on main. It's a
  // person's token, so the loop's assignments count as a human's and start
  // Duo flows (GitLab skips triggers for bot and flow actions).
  GITLAB_TOKEN: {
    masked: true,
    protected: true,
    value: config.requireSecret("gitlab-ci-token"),
  },
  // The nightly live e2e journey's design judge (.gitlab/ci/proof.yml).
  NEBIUS_API_KEY: {
    created: true,
    masked: true,
    protected: true,
    value: config.requireSecret("nebius-api-key"),
  },
  RENOVATE_TOKEN: {
    masked: true,
    protected: true,
    value: config.requireSecret("renovate-token"),
  },
  SITE_URL: { protected: true, value: siteUrl },
  // The weekly market scout's competitor searches (3 Tavily credits) and the
  // nightly live e2e journey's research.
  TAVILY_API_KEY: {
    created: true,
    masked: true,
    protected: true,
    value: config.requireSecret("tavily-api-key"),
  },
});
environments(siteUrl);
