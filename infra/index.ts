import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";

import { appEnvironment } from "./dev.ts";
import { configureDomain } from "./domains.ts";
import type { ShopRecord } from "./domains.ts";
import { previewEnvironment } from "./github-preview.ts";
import { githubRepository } from "./github.ts";
import { retainLegacy } from "./legacy.ts";
import { polarPromoSecrets } from "./polar.ts";
import { configurePostHog, environmentProject } from "./posthog/program.ts";
import { ResendApiKey, ResendDomain, ResendVerification } from "./resend.ts";
import {
  cloudRunService,
  postgresInstance,
  secretEnv,
  secretWithValue,
} from "./resources.ts";

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
// sami-m-g's GitHub user id (`gh api users/sami-m-g --jq .id`).
const OWNER_GITHUB_ID = 106_979_416;

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

// Production's Postgres (resources.ts). dev.wovain.com has a database on it;
// next.wovain.com has its own instance (dev.ts).
const sql = postgresInstance("postgres", "wovain", region, kept);
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
// fal-key, meta-app-* (the Meta app's id and secret, from the stack secrets
// `meta-app-id` and `meta-app-secret`), nebius-api-key, qloo-api-key, tavily-api-key and
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
// The Meta app's credentials were added by hand as version 1 of each secret;
// their stack secrets hold the same values, so Pulumi adopts those versions
// instead of adding new ones.
const adoptedVersions = new Map([
  ["meta-app-id", `projects/${project}/secrets/meta-app-id/versions/1`],
  ["meta-app-secret", `projects/${project}/secrets/meta-app-secret/versions/1`],
]);
for (const id of secretIds) {
  const adopted = adoptedVersions.get(id);
  const { secret, version } = secretWithValue(
    id,
    config.getSecret(id) ?? generated.get(id),
    kept,
    adopted === undefined ? undefined : { import: adopted }
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

// wovain-allowed-emails is no longer read (the allowlist is gone); its secret
// stays, unmounted, until it is retired, since dropping it from secretIds
// would delete a protected resource.
const unmountedSecretIds = new Set(["wovain-allowed-emails"]);
const mountedSecretIds = [...populated.keys()].filter(
  (id) => !unmountedSecretIds.has(id)
);

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
// model the agents call (`pulumi config set nemotronModel <id>`) and
// FAL_IMAGE_MODEL the fal endpoint that draws (`falImageModel`).
const sharedEnvs = {
  FAL_IMAGE_MODEL: config.require("falImageModel"),
  NEBIUS_BASE_URL: "https://api.tokenfactory.nebius.com/v1/",
  NEMOTRON_MODEL: config.require("nemotronModel"),
  NEMOTRON_VISION_MODEL: config.require("nemotronVisionModel"),
  QLOO_API_URL: "https://hackathon.api.qloo.com",
};

// apps/web's per-environment settings (apps/web/.env.schema gives none a
// default), from this stack's config: production's under plain keys, and
// dev's and next's under `<key>-<name>` (`pulumi config set
// emailFrom-next ...`), never shared with production's. The JSON ones are
// objects. Each service gets them at runtime and each GitHub environment's
// image build through its WEB_BUILD_ENV variable.
const appSettings = (name?: "dev" | "next") => {
  const key = (base: string) => (name === undefined ? base : `${base}-${name}`);
  const plain = Object.fromEntries(
    Object.entries({
      DOCS_URL: "docsUrl",
      EMAIL_FROM: "emailFrom",
      FAL_MCP_URL: "falMcpUrl",
      FOURTHWALL_DEFAULT_PRODUCT_ID: "fourthwallDefaultProductId",
      FOURTHWALL_MCP_URL: "fourthwallMcpUrl",
      GUARDRAIL_INJECTION_THRESHOLD: "guardrailInjectionThreshold",
      GUARDRAIL_MODERATION_THRESHOLD: "guardrailModerationThreshold",
      GUARDRAIL_PII_THRESHOLD: "guardrailPiiThreshold",
      META_MCP_SCOPE: "metaMcpScope",
      META_MCP_URL: "metaMcpUrl",
      NEMOTRON_INPUT_PRICE: "nemotronInputPrice",
      NEMOTRON_OUTPUT_PRICE: "nemotronOutputPrice",
      PRIVACY_EMAIL: "privacyEmail",
      SUPPORT_EMAIL: "supportEmail",
    }).map(([env, base]) => [env, config.require(key(base))])
  );
  return {
    ...plain,
    BILLING_CATALOG: JSON.stringify(
      config.requireObject(key("billingCatalog"))
    ),
    MCP_WIDGET_RESOURCE_DOMAINS: config
      .requireObject<string[]>(key("mcpWidgetResourceDomains"))
      .join(","),
    PRICING_RULES: JSON.stringify(config.requireObject(key("pricingRules"))),
  } as Record<string, string>;
};
const settingEnvs = (settings: Record<string, string>) =>
  Object.entries(settings).map(([name, value]) => ({ name, value }));
// An image build's env file (.github/workflows/deploy.yml): Varlock reads
// backquoted values as is, apart from escapes, so none may hold a backquote
// or a backslash.
const buildEnv = (settings: Record<string, string>, mcp: string) =>
  Object.entries({ ...settings, MCP_URL: mcp })
    .map(([name, value]) => {
      if (/[`\\]/u.test(value)) {
        throw new Error(`${name} can't hold a backquote or a backslash`);
      }
      return `${name}=\`${value}\``;
    })
    .join("\n");
const prodSettings = appSettings();
const devSettings = appSettings("dev");
const nextSettings = appSettings("next");

// PostHog product analytics (apps/web/.env.schema, which has no default):
// production's public project token (`pulumi config set posthogKey phc_...`),
// at runtime and, through the `Production` environment's
// NEXT_PUBLIC_POSTHOG_KEY Actions variable below, in the image build. dev and
// next each have their own project (posthog/program.ts). Optional.
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
const polarEnvironment = config.require("polarEnvironment");

// Production runs release/transcend (docs/adr/0004-release-branch.md), the
// build judges saw at the Transcend deadline, until winners are announced
// (about 2026-11-16). Until then no `pulumi up` from main may roll a new
// production revision: wovain-web and wovain-docs keep their live template
// (image, env, secrets, scaling), and only an approved deploy from the
// release branch changes them. The live revision still reads
// GITLAB_FEATURE_FLAGS_* and the GitLab OTLP settings, which the template
// below no longer has. Set `wovain:freezeProduction false` (or delete this)
// when main converges onto production.
const productionFrozen = config.getBoolean("freezeProduction") ?? true;

// The image's own port (apps/web/Dockerfile).
const service = cloudRunService("web", {
  cloudSqlInstance: sql.connectionName,
  dependsOn: [...populated.values()],
  envs: [
    { name: "APP_ENV", value: "production" },
    { name: "BETTER_AUTH_URL", value: siteUrl },
    ...settingEnvs(prodSettings),
    { name: "INNGEST_APP_ID", value: "wovain" },
    { name: "NEBIUS_BASE_URL", value: sharedEnvs.NEBIUS_BASE_URL },
    { name: "NEMOTRON_MODEL", value: sharedEnvs.NEMOTRON_MODEL },
    {
      name: "NEMOTRON_VISION_MODEL",
      value: sharedEnvs.NEMOTRON_VISION_MODEL,
    },
    { name: "FAL_IMAGE_MODEL", value: sharedEnvs.FAL_IMAGE_MODEL },
    { name: "MCP_URL", value: mcpUrl },
    { name: "POLAR_ENVIRONMENT", value: polarEnvironment },
    ...googleEnv,
    ...posthogEnv,
    { name: "QLOO_API_URL", value: sharedEnvs.QLOO_API_URL },
    { name: "WOVAIN_BUCKET", value: media.name },
    { name: "WOVAIN_KMS_KEY", value: connectionsKey.id },
    ...mountedSecretIds.map((id) => secretEnv(id)),
  ],
  frozen: productionFrozen,
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
// The docs chat's Nebius model, its reasoning effort and its answer cap
// (`pulumi config set docsChatModel <id>`, docsChatReasoningEffort,
// docsChatMaxOutputTokens).
const docsChat = Object.entries({
  DOCS_CHAT_MAX_OUTPUT_TOKENS: "docsChatMaxOutputTokens",
  DOCS_CHAT_MODEL: "docsChatModel",
  DOCS_CHAT_REASONING_EFFORT: "docsChatReasoningEffort",
}).map(([name, key]) => ({ name, value: config.require(key) }));
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
    ...docsChat,
    ...(nebiusVersion === undefined ? [] : [secretEnv("nebius-api-key")]),
  ],
  frozen: productionFrozen,
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
        region: config.require("resendRegion"),
      });

// The provider secrets every other environment holds its own of
// (`<id>-<name>`, dev.ts), never production's. fal-key and
// wovain-allowed-emails are no longer read. A value comes from the
// `<id>-<name>` stack secret (`pulumi config set --secret
// inngest-event-key-next ...`), except Resend's key, which Pulumi creates.
// infra/README.md lists where each one comes from.
const environmentSecretIds = [
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
] as const;
const environmentSecrets = (name: string) => {
  const values: Record<string, pulumi.Input<string> | undefined> =
    Object.fromEntries(
      environmentSecretIds.map((id) => [id, config.getSecret(`${id}-${name}`)])
    );
  // As production's: a placeholder until `pnpm polar:seed` writes the
  // endpoint's secret (POLAR_WEBHOOK_SECRET_ID=polar-webhook-secret-<name>).
  if (values["polar-access-token"] !== undefined) {
    values["polar-webhook-secret"] ??= pulumi.output("pending-polar-seed");
  }
  // A sending-only key for the same domain, made with production's
  // full-access key (resend.ts).
  if (resendDomain !== undefined && resendApiKey !== undefined) {
    values["resend-api-key"] ??= new ResendApiKey(`resend-${name}`, {
      apiKey: resendApiKey,
      domainId: resendDomain.id,
      name: `wovain ${name}`,
    }).token;
  }
  return values;
};
// An environment's plain settings: the shared provider URLs; its APP_ENV
// and Inngest app id; its own PostHog project's token; and its own Google
// OAuth client (`pulumi config set googleClientId-<name> ...`) next to its
// google-client-secret-<name>, without which the Google button is hidden.
const environmentEnvs = (
  name: string,
  appEnv: "development" | "next",
  posthogToken: pulumi.Input<string>
) => {
  const clientId = config.get(`googleClientId-${name}`);
  return [
    ...Object.entries(sharedEnvs).map(([key, value]) => ({
      name: key,
      value,
    })),
    { name: "APP_ENV", value: appEnv },
    { name: "INNGEST_APP_ID", value: `wovain-${name}` },
    { name: "NEXT_PUBLIC_POSTHOG_KEY", value: posthogToken },
    ...(clientId === undefined
      ? []
      : [{ name: "GOOGLE_CLIENT_ID", value: clientId }]),
  ];
};

// dev.wovain.com (dev.ts), rolled out by hand or from the `dev` GitHub
// environment, as its own deploy account. Its database stays on
// production's instance.
export const devUrl = `https://dev.${domain}`;
const devPostHog = environmentProject("dev");
const dev = appEnvironment({
  afterApis,
  deploy: { githubEnvironment: "dev", pool },
  envs: [
    ...environmentEnvs("dev", "development", devPostHog.apiToken),
    ...settingEnvs(devSettings),
  ],
  kept,
  name: "dev",
  project,
  providerSecrets: environmentSecrets("dev"),
  region,
  sql,
  url: devUrl,
});

// next.wovain.com (dev.ts): where main deploys while production is frozen,
// for the Qloo and Nebius judges and every fix that isn't a production
// emergency (docs/adr/0004-release-branch.md). Its own Cloud SQL instance,
// secrets, deploy account and image repository.
export const nextUrl = `https://next.${domain}`;
const nextPostHog = environmentProject("next");
const next = appEnvironment({
  afterApis,
  deploy: { githubEnvironment: "next", pool },
  envs: [
    ...environmentEnvs("next", "next", nextPostHog.apiToken),
    ...settingEnvs(nextSettings),
  ],
  kept,
  name: "next",
  project,
  providerSecrets: environmentSecrets("next"),
  region,
  url: nextUrl,
});
const devDeploy = dev.deploy;
const nextDeploy = next.deploy;
if (devDeploy === undefined || nextDeploy === undefined) {
  throw new Error("dev and next each need their deploy account");
}

// wovain.com end to end (domains.ts). The few values no API hands out are
// plain stack config keys: `pulumi config set <key> <value>` in infra/.
const site = configureDomain({
  // Only the APIs it calls: its lookups wait on these, and a lookup that waits
  // on a resource with pending changes is unknown in a preview, which would
  // show every record it feeds as changed (adding an unrelated API did).
  after: [api.dns, api.run, api.siteverification],
  apex: domain,
  caaIssuers: config.requireObject<string[]>("caaIssuers"),
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
    { host: `next.${domain}`, service: next.service.name },
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

retainLegacy({ project });
polarPromoSecrets(project, kept);
// Who approves a pull request's infra preview (GitHub user ids): the owner,
// sami-m-g (`gh api users/sami-m-g --jq .id`), by default.
previewEnvironment(
  config.getObject<number[]>("previewReviewerIds") ?? [106_979_416]
);

export const bucket = media.name;
export const connectionsKeyName = connectionsKey.id;
export const sqlConnectionName = sql.connectionName;

// What the workflows read (`vars.<NAME>`), so nothing is set by hand. None is
// a secret: deploy.yml gets Google credentials through Workload Identity
// Federation and reads DATABASE_URL from Secret Manager. The repository's
// variables are shared; each environment's say where it deploys, as whom.
githubRepository({
  environments: {
    // No workflow deploys dev yet; a dispatch from main in `dev` would.
    dev: {
      DATABASE_URL_SECRET: dev.databaseUrl.secretId,
      GCP_DEPLOY_SERVICE_ACCOUNT: devDeploy.deployer.email,
      GCP_IMAGE_REPOSITORY: devDeploy.imageRepository,
      GCP_SQL_INSTANCE: dev.sql.connectionName,
      NEXT_PUBLIC_POSTHOG_KEY: devPostHog.apiToken,
      SITE_URL: devUrl,
      WEB_BUILD_ENV: buildEnv(devSettings, `${devUrl}/api/mcp`),
      WEB_SERVICE: dev.service.name,
    },
    next: {
      DATABASE_URL_SECRET: next.databaseUrl.secretId,
      GCP_DEPLOY_SERVICE_ACCOUNT: nextDeploy.deployer.email,
      GCP_IMAGE_REPOSITORY: nextDeploy.imageRepository,
      GCP_SQL_INSTANCE: next.sql.connectionName,
      NEXT_PUBLIC_POSTHOG_KEY: nextPostHog.apiToken,
      SITE_URL: nextUrl,
      WEB_BUILD_ENV: buildEnv(nextSettings, `${nextUrl}/api/mcp`),
      WEB_SERVICE: next.service.name,
    },
    production: {
      DATABASE_URL_SECRET: databaseUrl.secretId,
      DOCS_SERVICE: docsService.name,
      GCP_DEPLOY_SERVICE_ACCOUNT: deployer.email,
      GCP_IMAGE_REPOSITORY: imageRepository,
      GCP_SQL_INSTANCE: sql.connectionName,
      SITE_URL: siteUrl,
      WEB_BUILD_ENV: buildEnv(prodSettings, mcpUrl),
      WEB_SERVICE: service.name,
      ...(posthogKey === undefined
        ? {}
        : { NEXT_PUBLIC_POSTHOG_KEY: posthogKey }),
    },
  },
  releaseBranch: config.get("releaseBranch") ?? "release/transcend",
  // Who approves a production deploy (GitHub user ids): the owner by default.
  releaseReviewerIds: config.getObject<number[]>("releaseReviewerIds") ?? [
    OWNER_GITHUB_ID,
  ],
  variables: {
    DOCS_SITE_URL: docsUrl,
    GCP_PROJECT_ID: project,
    GCP_REGION: region,
    GCP_WORKLOAD_IDENTITY_PROVIDER: `${pool}/providers/github`,
  },
});

// The PostHog project: KPIs and alerts, dashboards, the run-rating survey,
// project settings and the app's feature flags (posthog/program.ts).
export const posthogDashboardUrl = configurePostHog();
