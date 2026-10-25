import "./duo.ts";
import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";

import { ciVariables, environments } from "./gitlab.ts";

// wovain's Google Cloud project: Cloud Run serves apps/web (the image from
// apps/web/Dockerfile), Cloud SQL holds its Postgres database, Secret Manager
// holds the keys, and GitLab CI builds and deploys through Workload Identity
// Federation, with no stored Google key.
const config = new pulumi.Config();
const gcpConfig = new pulumi.Config("gcp");
const project = gcpConfig.require("project");
const region = gcpConfig.require("region");
const gitlabProject = config.require("gitlabProject");

// The billing account is read from the project, so its ID stays out of git.
const { billingAccount, number: projectNumber } =
  await gcp.organizations.getProject({ projectId: project });

const apis = [
  "artifactregistry",
  "billingbudgets",
  "cloudbilling",
  "clouderrorreporting",
  "cloudkms",
  "firebase",
  "iam",
  "iamcredentials",
  "logging",
  "monitoring",
  "run",
  "secretmanager",
  "sqladmin",
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
new gcp.firebase.Project(
  "firebase",
  { project },
  { ...afterApis, import: project, protect: true, retainOnDelete: true }
);

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

// Merchants' Fourthwall, fal and Meta grants are encrypted with this key, and
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

// Postgres for apps/web (packages/db). Public IP with no authorized networks:
// only the Cloud SQL Auth Proxy reaches it, which Cloud Run's /cloudsql socket
// and `cloud-sql-proxy` both use, authorized by IAM (roles/cloudsql.client).
const sql = new gcp.sql.DatabaseInstance(
  "postgres",
  {
    databaseVersion: "POSTGRES_18",
    deletionProtection: true,
    name: "wovain",
    region,
    settings: {
      availabilityType: "ZONAL",
      backupConfiguration: { enabled: true, startTime: "07:00" },
      deletionProtectionEnabled: true,
      diskAutoresize: true,
      diskSize: 10,
      // Shared-core tiers need the Enterprise edition (Postgres 16+ defaults
      // to Enterprise Plus).
      edition: "ENTERPRISE",
      ipConfiguration: { ipv4Enabled: true, sslMode: "ENCRYPTED_ONLY" },
      tier: "db-f1-micro",
    },
  },
  afterApis
);
const database = new gcp.sql.Database("wovain", {
  instance: sql.name,
  name: "wovain",
});
// URL-safe, so it goes into DATABASE_URL as is.
const dbPassword = new random.RandomPassword("postgres-wovain", {
  length: 32,
  special: false,
});
const dbUser = new gcp.sql.User("wovain", {
  instance: sql.name,
  name: "wovain",
  password: dbPassword.result,
});

// Secrets the app reads, by Secret Manager id; the env variable is the id in
// upper snake case. A secret gets a version only from its stack config value
// (`pulumi config set --secret <id>` in infra/), and Cloud Run mounts only the
// secrets that have one, since a revision won't start on an empty secret.
// fal-key, meta-app-*, nebius-api-key, qloo-api-key, tavily-api-key and
// wovain-allowed-emails were created by main; the others are new.
const secretIds = [
  "better-auth-secret",
  "fal-key",
  "fourthwall-client-id",
  "fourthwall-client-secret",
  "meta-app-id",
  "meta-app-secret",
  "nebius-api-key",
  "qloo-api-key",
  "tavily-api-key",
  "wovain-allowed-emails",
] as const;
const toEnvName = (id: string) => id.toUpperCase().replaceAll("-", "_");

const secrets = new Map<string, gcp.secretmanager.Secret>();
const populated = new Map<string, pulumi.Resource>();
for (const id of secretIds) {
  const secret = new gcp.secretmanager.Secret(
    id,
    { replication: { auto: {} }, secretId: id },
    afterApis
  );
  secrets.set(id, secret);
  const value = config.getSecret(id);
  if (value !== undefined) {
    populated.set(
      id,
      new gcp.secretmanager.SecretVersion(id, {
        secret: secret.id,
        secretData: value,
      })
    );
  }
}

// DATABASE_URL points at the socket Cloud Run mounts under /cloudsql;
// `cloud-sql-proxy --unix-socket /cloudsql` makes the same path for migrations.
const databaseUrl = new gcp.secretmanager.Secret(
  "database-url",
  { replication: { auto: {} }, secretId: "database-url" },
  afterApis
);
secrets.set("database-url", databaseUrl);
populated.set(
  "database-url",
  new gcp.secretmanager.SecretVersion("database-url", {
    secret: databaseUrl.id,
    secretData: pulumi.interpolate`postgresql://${dbUser.name}:${dbPassword.result}@localhost/${database.name}?host=/cloudsql/${sql.connectionName}`,
  })
);

// The identity apps/web runs as.
const runner = new gcp.serviceaccount.Account(
  "web-runner",
  { accountId: "wovain-web", displayName: "wovain web (Cloud Run)" },
  afterApis
);
for (const role of ["roles/cloudsql.client", "roles/logging.logWriter"]) {
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
for (const [id, secret] of secrets) {
  new gcp.secretmanager.SecretIamMember(`runner-${id}`, {
    member: runner.member,
    role: "roles/secretmanager.secretAccessor",
    secretId: secret.id,
  });
}

// Images built by CI (.gitlab/ci/deploy.yml); only the newest ten are kept.
const images = new gcp.artifactregistry.Repository(
  "images",
  {
    cleanupPolicies: [
      {
        action: "KEEP",
        id: "keep-recent",
        mostRecentVersions: { keepCount: 10 },
      },
      {
        action: "DELETE",
        condition: { tagState: "ANY" },
        id: "delete-rest",
      },
    ],
    format: "DOCKER",
    location: region,
    repositoryId: "wovain",
  },
  afterApis
);
export const imageRepository = pulumi.interpolate`${region}-docker.pkg.dev/${project}/${images.repositoryId}`;

// Cloud Run's deterministic URL, known before the service exists, so the app
// can be told its own address (BETTER_AUTH_URL) without a cycle.
const serviceName = "wovain-web";
export const siteUrl = `https://${serviceName}-${projectNumber}.${region}.run.app`;

// Pulumi owns the service's settings; CI rolls out each image with `gcloud
// run deploy --image`, so the image is ignored here. `pulumi up --refresh`
// (CI's infra job) reads the live image first, so a settings change keeps it.
const service = new gcp.cloudrunv2.Service(
  "web",
  {
    deletionProtection: false,
    ingress: "INGRESS_TRAFFIC_ALL",
    // Public: Better Auth guards the app.
    invokerIamDisabled: true,
    location: region,
    name: serviceName,
    template: {
      containers: [
        {
          envs: [
            { name: "BETTER_AUTH_URL", value: siteUrl },
            { name: "QLOO_API_URL", value: "https://hackathon.api.qloo.com" },
            { name: "WOVAIN_BUCKET", value: media.name },
            { name: "WOVAIN_KMS_KEY", value: connectionsKey.id },
            ...[...populated.keys()].map((id) => ({
              name: toEnvName(id),
              valueSource: {
                secretKeyRef: { secret: id, version: "latest" },
              },
            })),
          ],
          // The image's own port (apps/web/Dockerfile).
          image: "us-docker.pkg.dev/cloudrun/container/hello",
          ports: { containerPort: 3001 },
          resources: {
            cpuIdle: true,
            limits: { cpu: "1", memory: "512Mi" },
          },
          volumeMounts: [{ mountPath: "/cloudsql", name: "cloudsql" }],
        },
      ],
      scaling: { maxInstanceCount: 2, minInstanceCount: 0 },
      serviceAccount: runner.email,
      volumes: [
        {
          cloudSqlInstance: { instances: [sql.connectionName] },
          name: "cloudsql",
        },
      ],
    },
  },
  {
    dependsOn: [...populated.values()],
    ignoreChanges: ["client", "clientVersion", "template.containers[0].image"],
  }
);
export const serviceUri = service.uri;

new gcp.kms.CryptoKeyIAMMember("runner-connections", {
  cryptoKeyId: connectionsKey.id,
  member: runner.member,
  role: "roles/cloudkms.cryptoKeyEncrypterDecrypter",
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

// Builds and pushes the image, migrates the database and rolls out the
// revision, from jobs in the production environment only.
const deployer = new gcp.serviceaccount.Account(
  "gitlab-deploy",
  { accountId: "gitlab-deploy", displayName: "GitLab CI deploys" },
  afterApis
);
new gcp.serviceaccount.IAMMember("deployer-from-gitlab", {
  member: pulumi.interpolate`principalSet://iam.googleapis.com/${pool.name}/attribute.environment/production`,
  role: "roles/iam.workloadIdentityUser",
  serviceAccountId: deployer.name,
});
for (const role of [
  "roles/cloudsql.client",
  "roles/run.developer",
  "roles/serviceusage.serviceUsageConsumer",
]) {
  new gcp.projects.IAMMember(`deployer-${role.split("/")[1]}`, {
    member: deployer.member,
    project,
    role,
  });
}
new gcp.artifactregistry.RepositoryIamMember("deployer-images", {
  location: images.location,
  member: deployer.member,
  repository: images.name,
  role: "roles/artifactregistry.writer",
});
// The migrate job reads DATABASE_URL to run drizzle-kit through the proxy.
new gcp.secretmanager.SecretIamMember("deployer-database-url", {
  member: deployer.member,
  role: "roles/secretmanager.secretAccessor",
  secretId: databaseUrl.id,
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
for (const role of [
  "roles/cloudkms.admin",
  "roles/cloudsql.admin",
  "roles/editor",
  "roles/firebase.admin",
  "roles/iam.serviceAccountAdmin",
  "roles/iam.workloadIdentityPoolAdmin",
  "roles/resourcemanager.projectIamAdmin",
  "roles/run.admin",
  "roles/secretmanager.admin",
  "roles/serviceusage.serviceUsageAdmin",
]) {
  new gcp.projects.IAMMember(`infra-${role.split("/")[1]}`, {
    member: infra.member,
    project,
    role,
  });
}

// The self-healing loop reads production's logs, errors and metrics as this
// account, from the operations environment only. It can't read secrets or
// change anything.
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
for (const role of [
  "roles/errorreporting.viewer",
  "roles/logging.viewer",
  "roles/monitoring.viewer",
]) {
  new gcp.projects.IAMMember(`ops-${role.split("/")[1]}`, {
    member: ops.member,
    project,
    role,
  });
}

// Email alerts at 50%, 90% and 100% of $20 a month (Cloud SQL's smallest
// instance is about $10 of it).
new gcp.billing.Budget(
  "monthly",
  {
    amount: { specifiedAmount: { currencyCode: "USD", units: "20" } },
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
export const sqlConnectionName = sql.connectionName;

// What the pipeline reads. The tokens are stack secrets
// (`pulumi config set --secret <name>`); everything else comes from above.
ciVariables({
  GCP_DEPLOY_SERVICE_ACCOUNT: { protected: true, value: deployer.email },
  GCP_IMAGE_REPOSITORY: {
    created: true,
    protected: true,
    value: imageRepository,
  },
  GCP_INFRA_SERVICE_ACCOUNT: { protected: true, value: infra.email },
  GCP_OPS_SERVICE_ACCOUNT: { created: true, protected: true, value: ops.email },
  GCP_PROJECT_ID: { created: true, protected: true, value: project },
  GCP_REGION: { created: true, protected: true, value: region },
  GCP_SQL_INSTANCE: {
    created: true,
    protected: true,
    value: sql.connectionName,
  },
  GCP_WORKLOAD_IDENTITY_PROVIDER: { protected: true, value: provider.name },
  // The group's GitLab Observability query API, which the loop reads.
  GITLAB_O11Y_URL: {
    created: true,
    protected: true,
    value: `https://${config.require("o11yGroupId")}.gitlab-o11y.com`,
  },
  // GitLab's CI observability export (pipeline metrics, logs and traces).
  GITLAB_OBSERVABILITY_EXPORT: {
    protected: false,
    value: "metrics,logs,traces",
  },
  // The ai-catalog sync and the loop, on main. It's a person's token, so the
  // loop's assignments count as a human's and start Duo flows (GitLab skips
  // triggers for bot and flow actions).
  GITLAB_TOKEN: {
    masked: true,
    protected: true,
    value: config.requireSecret("gitlab-ci-token"),
  },
  // The loop's and scout's model calls and competitor searches.
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
  TAVILY_API_KEY: {
    created: true,
    masked: true,
    protected: true,
    value: config.requireSecret("tavily-api-key"),
  },
});
environments(siteUrl);
