import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";

import { devEnvironment } from "./dev.ts";
import { configureDomain } from "./domains.ts";
import type { ShopRecord } from "./domains.ts";
import { posthogTrigger, statusDomainVerification } from "./duo.ts";
import { githubMirror } from "./github.ts";
import { ciVariables, environments } from "./gitlab.ts";
import { retainLegacy } from "./legacy.ts";
import { ResendDomain, ResendVerification } from "./resend.ts";
import { cloudRunService, secretEnv, secretWithValue } from "./resources.ts";

// wovain's Google Cloud project: Cloud Run serves apps/web at wovain.com and
// apps/fumadocs at docs.wovain.com (each from its Dockerfile), Cloud SQL holds its Postgres database, Secret Manager
// holds the keys, and GitLab CI builds and deploys through Workload Identity
// Federation, with no stored Google key.
const config = new pulumi.Config();
const gcpConfig = new pulumi.Config("gcp");
const project = gcpConfig.require("project");
const region = gcpConfig.require("region");
const gitlabProjectId = config.require("gitlabProjectId");

// The billing account is read from the project, so its ID stays out of git.
const { billingAccount, number: projectNumber } =
  await gcp.organizations.getProject({ projectId: project });

const apis = [
  "artifactregistry",
  "billingbudgets",
  "cloudbilling",
  "clouderrorreporting",
  "cloudkms",
  "dns",
  "firebase",
  "iam",
  "iamcredentials",
  "logging",
  "monitoring",
  "run",
  "secretmanager",
  "siteverification",
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
// Data and identity: the engine refuses to delete or replace a protected
// resource, and the policy pack (infra/policy) requires it on each of them.
const kept = { ...afterApis, protect: true };

// The identities CI runs as, their roles and the workload identity pools
// live in infra/bootstrap, applied once by a project owner: an account that
// grants itself a role can't use it in the same run, since IAM takes minutes
// to propagate. Their names are fixed, so this stack just refers to them.
const pools = `projects/${projectNumber}/locations/global/workloadIdentityPools`;
const pool = `${pools}/gitlab`;

// Firebase was added to the project by hand at first; adopted, never removed.
new gcp.firebase.Project(
  "firebase",
  { project },
  { ...kept, import: project, retainOnDelete: true }
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
  kept
);

// main's key for merchants' grants; the app now seals tokens with
// TOKEN_ENCRYPTION_KEY. Kept because KMS key rings and keys can't be deleted.
const keyRing = new gcp.kms.KeyRing(
  "wovain",
  { location: region, name: "wovain" },
  kept
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
  kept
);
const database = new gcp.sql.Database(
  "wovain",
  { instance: sql.name, name: "wovain" },
  { protect: true }
);
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
// upper snake case. A secret gets a version from its stack config value
// (`pulumi config set --secret <id>` in infra/) or, for the two below, a
// generated one; Cloud Run mounts only the secrets that have a version, since
// a revision won't start on an empty secret.
// fal-key, meta-app-*, nebius-api-key, qloo-api-key, tavily-api-key and
// wovain-allowed-emails were created by main; the others are new.
// polar-access-token and polar-webhook-secret are wovain's own billing
// (packages/billing): a Polar organization token and the webhook endpoint's
// signing secret. Each stays unmounted until its stack secret is set.
const secretIds = [
  "better-auth-secret",
  "fal-key",
  "gitlab-feature-flags-instance-id",
  "google-client-secret",
  "meta-app-id",
  "meta-app-secret",
  "nebius-api-key",
  "polar-access-token",
  "polar-webhook-secret",
  "qloo-api-key",
  "resend-api-key",
  "tavily-api-key",
  "token-encryption-key",
  "wovain-allowed-emails",
] as const;

// Values Pulumi makes itself unless the stack config sets one: Better Auth's
// secret, and TOKEN_ENCRYPTION_KEY's 32 random bytes, base64 encoded.
const generated = new Map<string, pulumi.Output<string>>([
  [
    "better-auth-secret",
    new random.RandomPassword("better-auth-secret", {
      length: 48,
      special: false,
    }).result,
  ],
  [
    "token-encryption-key",
    new random.RandomBytes("token-encryption-key", { length: 32 }).base64,
  ],
]);

const secrets = new Map<string, gcp.secretmanager.Secret>();
const populated = new Map<string, pulumi.Resource>();
for (const id of secretIds) {
  const { secret, version } = secretWithValue(
    id,
    config.getSecret(id) ?? generated.get(id),
    kept
  );
  secrets.set(id, secret);
  if (version !== undefined) {
    populated.set(id, version);
  }
}

// DATABASE_URL points at the socket Cloud Run mounts under /cloudsql;
// `cloud-sql-proxy --unix-socket /cloudsql` makes the same path for migrations.
const { secret: databaseUrl, version: databaseUrlVersion } = secretWithValue(
  "database-url",
  pulumi.interpolate`postgresql://${dbUser.name}:${dbPassword.result}@localhost/${database.name}?host=/cloudsql/${sql.connectionName}`,
  kept
);
secrets.set("database-url", databaseUrl);
if (databaseUrlVersion !== undefined) {
  populated.set("database-url", databaseUrlVersion);
}

// The identity apps/web runs as.
const runner = new gcp.serviceaccount.Account(
  "web-runner",
  { accountId: "wovain-web", displayName: "wovain web (Cloud Run)" },
  kept
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
  kept
);
export const imageRepository = pulumi.interpolate`${region}-docker.pkg.dev/${project}/${images.repositoryId}`;

// The public addresses (domains.ts maps them to the services).
const domain = "wovain.com";
export const siteUrl = `https://${domain}`;
export const docsUrl = `https://docs.${domain}`;
// ChatGPT's connector URL; access tokens are bound to it (packages/auth).
export const mcpUrl = `https://mcp.${domain}/api/mcp`;
const serviceName = "wovain-web";

// Settings production and dev (dev.ts) share.
const sharedEnvs = {
  GITLAB_FEATURE_FLAGS_URL: `https://gitlab.com/api/v4/feature_flags/unleash/${gitlabProjectId}`,
  NEBIUS_BASE_URL: "https://api.tokenfactory.nebius.com/v1/",
  QLOO_API_URL: "https://hackathon.api.qloo.com",
};

// PostHog product analytics (apps/web/.env.schema). The public project token
// (`pulumi config set posthogKey phc_...`) overrides the schema's default at
// runtime and, through the NEXT_PUBLIC_POSTHOG_KEY CI variable below, in the
// image build; the scout reads PostHog with a personal API key
// (`pulumi config set --secret posthog-personal-api-key phx_...`) and the
// project id (`pulumi config set posthogProjectId <id>`). Each is optional.
const posthogKey = config.get("posthogKey");
const posthogPersonalApiKey = config.getSecret("posthog-personal-api-key");
const polarAccessToken = config.getSecret("polar-access-token");
const posthogProjectId = config.get("posthogProjectId");
const posthogEnv =
  posthogKey === undefined
    ? []
    : [{ name: "NEXT_PUBLIC_POSTHOG_KEY", value: posthogKey }];

// Google sign-in (apps/web/.env.schema): the OAuth client's ID is public
// (`pulumi config set googleClientId ...`); its secret is the
// google-client-secret stack secret above. Without the ID the button is hidden.
const googleClientId = config.get("googleClientId");
const googleEnv =
  googleClientId === undefined
    ? []
    : [{ name: "GOOGLE_CLIENT_ID", value: googleClientId }];

// Polar's environment (apps/web/.env.schema): sandbox until the business
// is registered (`pulumi config set polarEnvironment production`).
const polarEnvironment = config.get("polarEnvironment") ?? "sandbox";

// The image's own port (apps/web/Dockerfile).
const service = cloudRunService("web", {
  cloudSqlInstance: sql.connectionName,
  dependsOn: [...populated.values()],
  envs: [
    { name: "BETTER_AUTH_URL", value: siteUrl },
    { name: "NEBIUS_BASE_URL", value: sharedEnvs.NEBIUS_BASE_URL },
    { name: "GITLAB_FEATURE_FLAGS_ENVIRONMENT", value: "production" },
    {
      name: "GITLAB_FEATURE_FLAGS_URL",
      value: sharedEnvs.GITLAB_FEATURE_FLAGS_URL,
    },
    { name: "MCP_URL", value: mcpUrl },
    { name: "POLAR_ENVIRONMENT", value: polarEnvironment },
    ...googleEnv,
    ...posthogEnv,
    { name: "QLOO_API_URL", value: sharedEnvs.QLOO_API_URL },
    { name: "WOVAIN_BUCKET", value: media.name },
    { name: "WOVAIN_KMS_KEY", value: connectionsKey.id },
    ...[...populated.keys()].map((id) => secretEnv(id)),
  ],
  location: region,
  maxInstances: 2,
  name: serviceName,
  port: 3001,
  serviceAccount: runner.email,
});
export const serviceUri = service.uri;

// apps/fumadocs: the docs site and its OpenRouter chat. Without the
// openrouter-api-key secret (new, empty until set) the chat answers 503.
// SITE_URL is @public in its schema, so the image is built with it too
// (.gitlab/ci/deploy.yml).
const docsRunner = new gcp.serviceaccount.Account(
  "docs-runner",
  { accountId: "wovain-docs", displayName: "wovain docs (Cloud Run)" },
  kept
);
new gcp.projects.IAMMember("docs-runner-logWriter", {
  member: docsRunner.member,
  project,
  role: "roles/logging.logWriter",
});
const { secret: openrouterKey, version: openrouterVersion } = secretWithValue(
  "openrouter-api-key",
  config.getSecret("openrouter-api-key"),
  kept
);
new gcp.secretmanager.SecretIamMember("docs-runner-openrouter-api-key", {
  member: docsRunner.member,
  role: "roles/secretmanager.secretAccessor",
  secretId: openrouterKey.id,
});
// The image's own port (apps/fumadocs/Dockerfile).
const docsService = cloudRunService("docs", {
  dependsOn: openrouterVersion === undefined ? [] : [openrouterVersion],
  envs: [
    { name: "SITE_URL", value: docsUrl },
    ...(openrouterVersion === undefined
      ? []
      : [secretEnv("openrouter-api-key")]),
  ],
  location: region,
  maxInstances: 2,
  name: "wovain-docs",
  port: 4000,
  serviceAccount: docsRunner.email,
});
export const docsServiceUri = docsService.uri;

// Resend sends wovain.com's mail. With the `resend-api-key` stack secret
// set and `resendDomain: true`, Pulumi registers the domain with Resend and
// writes its records. Its dynamic provider failed to serialize because the
// closure serializer needs TypeScript's JS API, which TypeScript 7 doesn't
// have; infra/ now gives it TypeScript 6 (program.test.ts covers it).
const resendApiKey = config.getSecret("resend-api-key");
const resendDomain =
  resendApiKey === undefined || config.getBoolean("resendDomain") !== true
    ? undefined
    : new ResendDomain("resend", {
        apiKey: resendApiKey,
        name: domain,
        region: config.get("resendRegion") ?? "us-east-1",
      });

// dev.wovain.com (dev.ts).
export const devUrl = `https://dev.${domain}`;
const dev = devEnvironment({
  connectionsKey,
  envs: [
    ...Object.entries(sharedEnvs).map(([name, value]) => ({ name, value })),
    // The same Google OAuth client (dev.wovain.com is a registered origin).
    ...googleEnv,
    // The same PostHog project; events say "development" by host.
    ...posthogEnv,
    { name: "WOVAIN_KMS_KEY", value: connectionsKey.id },
  ],
  kept,
  populated: [...populated.keys()],
  project,
  region,
  secrets,
  sql,
  url: devUrl,
});

// wovain.com end to end (domains.ts). The few values no API hands out are
// plain stack config keys: `pulumi config set <key> <value>` in infra/.
const site = configureDomain({
  after: apis,
  apex: domain,
  caaIssuers: config.getObject<string[]>("caaIssuers") ?? [
    "pki.goog",
    "letsencrypt.org",
  ],
  dmarcRua: config.get("dmarcRua"),
  metaDomainVerification: config.get("metaDomainVerification"),
  project,
  region,
  resendRecords: resendDomain?.records,
  routes: [
    { host: domain, service: service.name },
    // apps/web redirects www to the apex (src/proxy.ts).
    { host: `www.${domain}`, service: service.name },
    // The MCP endpoint's own host (mcpUrl): same service, its own resource.
    { host: `mcp.${domain}`, service: service.name },
    { host: `docs.${domain}`, service: docsService.name },
    { host: `dev.${domain}`, service: dev.service.name },
  ],
  shopRecords: config.getObject<ShopRecord[]>("shopDnsRecords") ?? [],
  statusDomainVerification,
  statusPagesTarget:
    config.get("statusPagesTarget") ?? "gitlab-ai-hackathon.gitlab.io.",
  zone: "wovain-com",
});
export const domainMappings = site.mappings;
if (resendDomain !== undefined && resendApiKey !== undefined) {
  new ResendVerification(
    "resend",
    { apiKey: resendApiKey, domainId: resendDomain.id },
    { dependsOn: site.resendRecordSets }
  );
}

new gcp.kms.CryptoKeyIAMMember("runner-connections", {
  cryptoKeyId: connectionsKey.id,
  member: runner.member,
  role: "roles/cloudkms.cryptoKeyEncrypterDecrypter",
});

// Builds and pushes the image, migrates the database and rolls out the
// revision, from jobs in the production environment only.
const deployer = new gcp.serviceaccount.Account(
  "gitlab-deploy",
  { accountId: "gitlab-deploy", displayName: "GitLab CI deploys" },
  kept
);
new gcp.serviceaccount.IAMMember("deployer-from-gitlab", {
  member: pulumi.interpolate`principalSet://iam.googleapis.com/${pool}/attribute.environment/production`,
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
new gcp.artifactregistry.RepositoryIamMember(
  "deployer-images",
  {
    location: images.location,
    member: deployer.member,
    repository: images.name,
    role: "roles/artifactregistry.writer",
  },
  afterApis
);
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
new gcp.serviceaccount.IAMMember("deployer-acts-as-docs-runner", {
  member: deployer.member,
  role: "roles/iam.serviceAccountUser",
  serviceAccountId: docsRunner.name,
});
// The same account rolls dev out, from the development environment (still
// main only): it acts as dev's runner and reads dev's DATABASE_URL.
new gcp.serviceaccount.IAMMember("deployer-from-gitlab-dev", {
  member: `principalSet://iam.googleapis.com/${pool}/attribute.environment/development`,
  role: "roles/iam.workloadIdentityUser",
  serviceAccountId: deployer.name,
});
new gcp.serviceaccount.IAMMember("deployer-acts-as-runner-dev", {
  member: deployer.member,
  role: "roles/iam.serviceAccountUser",
  serviceAccountId: dev.runner.name,
});
new gcp.secretmanager.SecretIamMember("deployer-database-url-dev", {
  member: deployer.member,
  role: "roles/secretmanager.secretAccessor",
  secretId: dev.databaseUrl.id,
});
// The migrate jobs get DATABASE_URL from GitLab's gcp_secret_manager secrets
// (.gitlab/ci/deploy.yml), read as the job's own federated identity, not an
// account: each environment reads only its own database's URL.
for (const [environment, secret] of [
  ["production", databaseUrl],
  ["development", dev.databaseUrl],
] as const) {
  new gcp.secretmanager.SecretIamMember(`gitlab-${environment}-database-url`, {
    member: `principalSet://iam.googleapis.com/${pool}/attribute.environment/${environment}`,
    role: "roles/secretmanager.secretAccessor",
    secretId: secret.id,
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
  kept
);
new gcp.serviceaccount.IAMMember("ops-from-gitlab", {
  member: pulumi.interpolate`principalSet://iam.googleapis.com/${pool}/attribute.environment/operations`,
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

retainLegacy({ project, projectNumber, region });
const githubMirrorKey = githubMirror();

export const bucket = media.name;
export const connectionsKeyName = connectionsKey.id;
export const sqlConnectionName = sql.connectionName;

// What the pipeline reads. The tokens are stack secrets
// (`pulumi config set --secret <name>`); everything else comes from above.
ciVariables({
  DEV_SITE_URL: { created: true, protected: true, value: devUrl },
  DOCS_SITE_URL: { created: true, protected: true, value: docsUrl },
  GCP_DEPLOY_SERVICE_ACCOUNT: { protected: true, value: deployer.email },
  GCP_IMAGE_REPOSITORY: {
    created: true,
    protected: true,
    value: imageRepository,
  },
  GCP_INFRA_SERVICE_ACCOUNT: {
    protected: true,
    value: `gitlab-infra@${project}.iam.gserviceaccount.com`,
  },
  GCP_OPS_SERVICE_ACCOUNT: { created: true, protected: true, value: ops.email },
  // The merge request preview (.gitlab/ci/verify.yml): read-only, and trusted
  // only from merge request pipelines, which don't get protected variables.
  // Set once with the bootstrap, so the first merge request previews; adopted.
  GCP_PREVIEW_SERVICE_ACCOUNT: {
    protected: false,
    value: `gitlab-preview@${project}.iam.gserviceaccount.com`,
  },
  GCP_PREVIEW_WORKLOAD_IDENTITY_PROVIDER: {
    protected: false,
    value: `${pools}/gitlab-mr/providers/gitlab-mr`,
  },
  GCP_PROJECT_ID: { created: true, protected: true, value: project },
  // What GitLab's gcp_secret_manager secrets exchange the job's token with.
  GCP_PROJECT_NUMBER: { created: true, protected: true, value: projectNumber },
  GCP_REGION: { created: true, protected: true, value: region },
  GCP_SQL_INSTANCE: {
    created: true,
    protected: true,
    value: sql.connectionName,
  },
  GCP_WORKLOAD_IDENTITY_FEDERATION_POOL_ID: {
    created: true,
    protected: true,
    value: "gitlab",
  },
  GCP_WORKLOAD_IDENTITY_FEDERATION_PROVIDER_ID: {
    created: true,
    protected: true,
    value: "gitlab",
  },
  GCP_WORKLOAD_IDENTITY_PROVIDER: {
    protected: true,
    value: `${pool}/providers/gitlab`,
  },
  // Write deploy key for the GitHub mirror job (infra/github.ts), base64.
  GITHUB_MIRROR_KEY: {
    created: true,
    masked: true,
    protected: true,
    value: githubMirrorKey,
  },
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
  // The web image's public PostHog token; merge request image checks read it
  // too, so it isn't protected.
  ...(posthogKey === undefined
    ? {}
    : {
        NEXT_PUBLIC_POSTHOG_KEY: {
          created: true,
          protected: false,
          value: posthogKey,
        },
      }),
  // The polar:seed job (.gitlab/ci/polar.yml) builds the Polar catalog with
  // the same token the app uses.
  ...(polarAccessToken === undefined
    ? {}
    : {
        POLAR_ACCESS_TOKEN: {
          created: true,
          masked: true,
          protected: true,
          value: polarAccessToken,
        },
        POLAR_ENVIRONMENT: {
          created: true,
          protected: true,
          value: polarEnvironment,
        },
      }),
  // The scout's PostHog query API access (apps/ops/src/posthog.ts).
  ...(posthogPersonalApiKey === undefined
    ? {}
    : {
        POSTHOG_PERSONAL_API_KEY: {
          created: true,
          masked: true,
          protected: true,
          value: posthogPersonalApiKey,
        },
      }),
  ...(posthogProjectId === undefined
    ? {}
    : {
        POSTHOG_PROJECT_ID: {
          created: true,
          protected: true,
          value: posthogProjectId,
        },
      }),
  // PostHog's destinations start the ops pipeline with it (infra/posthog).
  ...(posthogTrigger === undefined
    ? {}
    : {
        POSTHOG_TRIGGER_TOKEN: {
          created: true,
          masked: true,
          protected: true,
          value: posthogTrigger.token,
        },
      }),
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
environments(siteUrl, devUrl);
