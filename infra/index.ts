import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";

import { devEnvironment } from "./dev.ts";
import { configureDomain } from "./domains.ts";
import type { ShopRecord } from "./domains.ts";
import { githubRepository } from "./github.ts";
import { retainLegacy } from "./legacy.ts";
import { configurePostHog } from "./posthog/program.ts";
import { ResendDomain, ResendVerification } from "./resend.ts";
import { cloudRunService, secretEnv, secretWithValue } from "./resources.ts";

// wovain's Google Cloud project: Cloud Run serves apps/web at wovain.com and
// apps/fumadocs at docs.wovain.com (each from its Dockerfile), Cloud SQL holds its Postgres database, Secret Manager
// holds the keys, and GitHub Actions builds and deploys through Workload
// Identity Federation, with no stored Google key.
const config = new pulumi.Config();
const gcpConfig = new pulumi.Config("gcp");
const project = gcpConfig.require("project");
const region = gcpConfig.require("region");

// The billing account is read from the project, so its ID stays out of git.
const { billingAccount, number: projectNumber } =
  await gcp.organizations.getProject({ projectId: project });

const apiNames = [
  "artifactregistry",
  "billingbudgets",
  "cloudbilling",
  "clouderrorreporting",
  "cloudkms",
  "cloudtrace",
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
] as const;
const api = Object.fromEntries(
  apiNames.map((name) => [
    name,
    new gcp.projects.Service(name, {
      disableOnDestroy: false,
      service: `${name}.googleapis.com`,
    }),
  ])
) as Record<(typeof apiNames)[number], gcp.projects.Service>;
const apis = Object.values(api);
const afterApis = { dependsOn: apis };
// Data and identity: the engine refuses to delete or replace a protected
// resource, and the policy pack (infra/policy) requires it on each of them.
const kept = { ...afterApis, protect: true };

// The infrastructure account and the GitHub Actions workload identity pool
// live in infra/bootstrap, applied once by a project owner: an account that
// grants itself a role can't use it in the same run, since IAM takes minutes
// to propagate. Their names are fixed, so this stack just refers to them.
const pool = `projects/${projectNumber}/locations/global/workloadIdentityPools/github`;

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
// wovain-allowed-emails were created by main; the others are new. fal-key
// is no longer read (fal runs on each merchant's own key); it stays until
// its value is retired, since dropping it here would delete the secret.
// inngest-event-key and inngest-signing-key come from the Inngest app
// (docs/adr/0001-durable-runs.md): runs can't start until both are set.
// polar-access-token and polar-webhook-secret are wovain's own billing
// (packages/billing): a Polar organization token and the webhook endpoint's
// signing secret. posthog-secret-key is the PostHog project's secret API key
// (feature_flag:read), with which the app evaluates feature flags on the
// server (`pulumi config set --secret posthog-secret-key phs_...`). Each stays
// unmounted until its stack secret is set.
const secretIds = [
  "better-auth-secret",
  "fal-key",
  "google-client-secret",
  "inngest-event-key",
  "inngest-signing-key",
  "meta-app-id",
  "meta-app-secret",
  "nebius-api-key",
  "polar-access-token",
  "polar-webhook-secret",
  "posthog-secret-key",
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
  // A placeholder version, so Cloud Run starts before `pnpm polar:seed`
  // writes the endpoint's real secret as a newer version (Cloud Run mounts
  // the latest). Pulumi never writes the real value, so `pulumi up` keeps it.
  ["polar-webhook-secret", pulumi.output("pending-polar-seed")],
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

// Secrets whose versions live in Secret Manager outside Pulumi (the Meta app
// credentials, added by hand): mounted without a SecretVersion here, so
// `pulumi up` never touches their values. Each must keep an enabled version:
// Cloud Run refuses a revision whose secret has no `latest` version.
// Without them, connecting Meta answers META_NOT_CONFIGURED.
const externalSecretIds = ["meta-app-id", "meta-app-secret"] as const;
// wovain-allowed-emails is no longer read (the allowlist is gone); its secret
// stays, unmounted, until it is retired, since dropping it from secretIds
// would delete a protected resource.
const unmountedSecretIds = new Set(["wovain-allowed-emails"]);
const mountedSecretIds = [
  ...new Set([...populated.keys(), ...externalSecretIds]),
].filter((id) => !unmountedSecretIds.has(id));

// The identity apps/web runs as.
const runner = new gcp.serviceaccount.Account(
  "web-runner",
  { accountId: "wovain-web", displayName: "wovain web (Cloud Run)" },
  kept
);
// cloudtrace.agent: Mastra's traces of runs and agents go to Cloud Trace
// (packages/api/src/workflows/observability.ts).
for (const role of [
  "roles/cloudsql.client",
  "roles/cloudtrace.agent",
  "roles/logging.logWriter",
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
for (const [id, secret] of secrets) {
  new gcp.secretmanager.SecretIamMember(`runner-${id}`, {
    member: runner.member,
    role: "roles/secretmanager.secretAccessor",
    secretId: secret.id,
  });
}

// Images built by CI (.github/workflows/deploy.yml); only the newest ten are kept.
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

// Settings production and dev (dev.ts) share. NEMOTRON_MODEL is the Nebius
// model the agents call (`pulumi config set nemotronModel <id>`).
const sharedEnvs = {
  NEBIUS_BASE_URL: "https://api.tokenfactory.nebius.com/v1/",
  NEMOTRON_MODEL: config.require("nemotronModel"),
  QLOO_API_URL: "https://hackathon.api.qloo.com",
};

// PostHog product analytics (apps/web/.env.schema). The public project token
// (`pulumi config set posthogKey phc_...`) overrides the schema's default at
// runtime and, through the NEXT_PUBLIC_POSTHOG_KEY Actions variable below, in
// the image build. Optional.
const posthogKey = config.get("posthogKey");
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
    { name: "NEMOTRON_MODEL", value: sharedEnvs.NEMOTRON_MODEL },
    { name: "MCP_URL", value: mcpUrl },
    { name: "POLAR_ENVIRONMENT", value: polarEnvironment },
    ...googleEnv,
    ...posthogEnv,
    { name: "QLOO_API_URL", value: sharedEnvs.QLOO_API_URL },
    { name: "WOVAIN_BUCKET", value: media.name },
    { name: "WOVAIN_KMS_KEY", value: connectionsKey.id },
    ...mountedSecretIds.map((id) => secretEnv(id)),
  ],
  location: region,
  maxInstances: 2,
  // Mastra's agents run in-process: 512Mi ran out on 2026-10-26.
  memory: "1Gi",
  name: serviceName,
  port: 3001,
  serviceAccount: runner.email,
  startupCpuBoost: true,
  // Inngest calls /api/inngest once per run step; the slowest (a design:
  // brief, fal art, judge) needs more than Cloud Run's 300 s default.
  timeout: "900s",
});
export const serviceUri = service.uri;

// apps/fumadocs: the docs site and its AI chat, which calls Nemotron on
// Nebius Token Factory with the same nebius-api-key secret as the web app.
// Without a version of that secret the chat answers 503. SITE_URL is @public
// in its schema, so the image is built with it too
// (.github/workflows/deploy.yml).
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
// The docs chat's Nebius model (`pulumi config set docsChatModel <id>`).
const docsChatModel = config.require("docsChatModel");
const nebiusKey = secrets.get("nebius-api-key");
const nebiusVersion = populated.get("nebius-api-key");
if (nebiusKey === undefined) {
  throw new Error("nebius-api-key is not a declared secret");
}
new gcp.secretmanager.SecretIamMember("docs-runner-nebius-api-key", {
  member: docsRunner.member,
  role: "roles/secretmanager.secretAccessor",
  secretId: nebiusKey.id,
});
// The image's own port (apps/fumadocs/Dockerfile).
const docsService = cloudRunService("docs", {
  dependsOn: nebiusVersion === undefined ? [] : [nebiusVersion],
  envs: [
    { name: "SITE_URL", value: docsUrl },
    { name: "NEBIUS_BASE_URL", value: sharedEnvs.NEBIUS_BASE_URL },
    { name: "DOCS_CHAT_MODEL", value: docsChatModel },
    ...(nebiusVersion === undefined ? [] : [secretEnv("nebius-api-key")]),
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
  populated: mountedSecretIds,
  project,
  region,
  secrets,
  sql,
  url: devUrl,
});

// wovain.com end to end (domains.ts). The few values no API hands out are
// plain stack config keys: `pulumi config set <key> <value>` in infra/.
const site = configureDomain({
  // Only the APIs it calls: its lookups wait on these, and a lookup that waits
  // on a resource with pending changes is unknown in a preview, which would
  // show every record it feeds as changed (adding an unrelated API did).
  after: [api.dns, api.run, api.siteverification],
  apex: domain,
  caaIssuers: config.getObject<string[]>("caaIssuers") ?? [
    "pki.goog",
    "letsencrypt.org",
  ],
  dmarcRua: config.get("dmarcRua"),
  googleDkim: config.get("googleDkim"),
  googleSiteVerification: config.get("googleSiteVerification"),
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
  siteOwnerEmail: config.get("siteOwnerEmail"),
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

// Builds and pushes the images, migrates the database and rolls out the
// revisions (.github/workflows/deploy.yml). Its account id predates GitHub;
// renaming it would replace a protected account.
const deployer = new gcp.serviceaccount.Account(
  "gitlab-deploy",
  { accountId: "gitlab-deploy", displayName: "CI deploys (GitHub Actions)" },
  kept
);
// Only GitHub Actions jobs in the `Production` environment (infra/github.ts;
// the OIDC claim keeps its case), which the pool's
// provider already limits to sami-m-g/wovain's main branch (infra/bootstrap).
new gcp.serviceaccount.IAMMember("deployer-from-github", {
  member: `principalSet://iam.googleapis.com/${pool}/attribute.environment/Production`,
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
// The migrate step reads DATABASE_URL to run drizzle-kit through the proxy.
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
// The same account can roll dev out (wovain-web-dev, wovain_dev) once a
// workflow does it from a `development` environment Google trusts.
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

export const bucket = media.name;
export const connectionsKeyName = connectionsKey.id;
export const sqlConnectionName = sql.connectionName;

// What the workflows read (`vars.<NAME>`), so nothing is set by hand. None is
// a secret: deploy.yml gets Google credentials through Workload Identity
// Federation and reads DATABASE_URL from Secret Manager.
githubRepository({
  DOCS_SITE_URL: docsUrl,
  GCP_DEPLOY_SERVICE_ACCOUNT: deployer.email,
  GCP_IMAGE_REPOSITORY: imageRepository,
  GCP_PROJECT_ID: project,
  GCP_REGION: region,
  GCP_SQL_INSTANCE: sql.connectionName,
  GCP_WORKLOAD_IDENTITY_PROVIDER: `${pool}/providers/github`,
  ...(posthogKey === undefined ? {} : { NEXT_PUBLIC_POSTHOG_KEY: posthogKey }),
  SITE_URL: siteUrl,
});

// The PostHog project: KPIs and alerts, dashboards, the run-rating survey,
// project settings and the app's feature flags (posthog/program.ts).
export const posthogDashboardUrl = configurePostHog();
