// next.wovain.com, where main deploys while production is frozen for the
// Transcend judging (docs/adr/0004-release-branch.md): its own stack, so
// applying it can't plan a change to production. It owns every resource it
// declares (dev.ts appEnvironment): its Cloud SQL instance, database and
// user, an `<id>-next` secret for every key the app reads, bucket, runtime
// and deploy accounts, image repository, Cloud Run service, domain mapping
// and DNS record, PostHog project, Resend sending key, and the `next` GitHub
// environment with the Actions variables deploy.yml reads.
//
// What it uses of the shared project and never changes: the enabled APIs,
// the `wovain-com` DNS zone (it adds only next.wovain.com's record), the
// `github` workload identity pool (infra/bootstrap), Search Console's
// verification of wovain.com (whoever applies must be a verified owner),
// and the Resend domain wovain.com, for which it makes its own sending-only
// key.
//
// It holds no credential of production's. Its three provider credentials
// are its own stack secrets, which the owner creates for next
// (infra/README.md): `resendAdminKey`, `github:token` and `posthog:apiKey`.
// A preview without one of them fails, naming it.
import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";

import { appEnvironment } from "../dev.ts";
import { mappedHost } from "../domains.ts";
import { environmentVariables, mainOnlyEnvironment } from "../github.ts";
import { environmentProject } from "../posthog/program.ts";
import { secretWithValue } from "../resources.ts";
import {
  appSettings,
  buildEnv,
  environmentEnvs,
  environmentSecrets,
  settingEnvs,
  sharedSettings,
} from "../settings.ts";

const NAME = "next";
const APEX = "wovain.com";

const config = new pulumi.Config();
const gcpConfig = new pulumi.Config("gcp");
const project = gcpConfig.require("project");
const region = gcpConfig.require("region");
const { number: projectNumber } = await gcp.organizations.getProject({
  projectId: project,
});
const pool = `projects/${projectNumber}/locations/global/workloadIdentityPools/github`;

// This stack's own config: every key plain (`pulumi config set --stack next
// emailFrom ...`, `pulumi config set --secret --stack next
// inngest-event-key ...`), none of them production's.
const plain = (key: string) => key;
const url = `https://${NAME}.${APEX}`;
const mcpUrl = `${url}/api/mcp`;
const settings = appSettings(config, plain);

// next's own full-access Resend key: Resend makes an API key only with a
// full-access one, and the key it makes here can only send.
const resendAdminKey = config.requireSecret("resendAdminKey");
const resendDomainId = config.require("resendDomainId");
// The providers read these themselves; required here so a missing one fails
// the preview by name instead of in the provider.
new pulumi.Config("github").requireSecret("token");
new pulumi.Config("posthog").requireSecret("apiKey");

const posthog = environmentProject(NAME);
const environment = appEnvironment({
  afterApis: {},
  deploy: { githubEnvironment: NAME, pool },
  envs: [
    ...environmentEnvs({
      appEnv: "next",
      googleClientId: config.get("googleClientId"),
      name: NAME,
      posthogToken: posthog.apiToken,
      shared: sharedSettings(config, "v26.0"),
    }),
    ...settingEnvs(settings),
    // next shares production's Polar sandbox organization, so its catalog
    // carries its own metadata key (packages/billing/src/plans.ts).
    { name: "POLAR_METADATA_KEY", value: "wovain:next" },
  ],
  kept: { protect: true },
  name: NAME,
  project,
  providerSecrets: environmentSecrets(config, plain, NAME, {
    apiKey: resendAdminKey,
    domainId: resendDomainId,
  }),
  region,
  url,
});
const { deploy } = environment;
if (deploy === undefined) {
  throw new Error("next needs its deploy account");
}

// The post-deploy smoke suite's account (apps/e2e/src/seed-smoke.ts): its
// password, generated here and kept only in Secret Manager. deploy.yml
// reads it as next's deploy account, seeds the account and signs in with it.
const smokePassword = secretWithValue(
  "e2e-smoke-password-next",
  new random.RandomPassword("e2e-smoke-password-next", {
    length: 32,
    special: false,
  }).result,
  { protect: true }
);
new gcp.secretmanager.SecretIamMember("deploy-next-e2e-smoke-password", {
  member: deploy.deployer.member,
  role: "roles/secretmanager.secretAccessor",
  secretId: smokePassword.secret.id,
});

mappedHost({
  apex: APEX,
  dependsOn: [],
  host: `${NAME}.${APEX}`,
  project,
  recordsDependOn: [],
  region,
  service: environment.service.name,
  zone: "wovain-com",
});

// The repository itself and its rulesets are the `wovain` stack's
// (infra/github.ts); this stack owns only its environment. The repository's
// shared variables are the `wovain` stack's too, but it is not applied while
// production is frozen, so next also sets them on its own environment (an
// environment variable wins over a repository one, with the same value).
// Where CI applies this stack on every push to main (.github/workflows/
// infra.yml, `up-next`): Google trusts infra-next only from jobs in it
// (infra/bootstrap/next.ts). The job's first run creates it on GitHub, with
// no branch policy, and its `up` adopts it with this one.
mainOnlyEnvironment("next-infrastructure", "wovain");

environmentVariables(NAME, mainOnlyEnvironment(NAME, "wovain"), {
  DATABASE_URL_SECRET: environment.databaseUrl.secretId,
  DOCS_SITE_URL: `https://docs.${APEX}`,
  E2E_SMOKE_PASSWORD_SECRET: smokePassword.secret.secretId,
  GCP_DEPLOY_SERVICE_ACCOUNT: deploy.deployer.email,
  GCP_IMAGE_REPOSITORY: deploy.imageRepository,
  GCP_PROJECT_ID: project,
  GCP_REGION: region,
  GCP_SQL_INSTANCE: environment.sql.connectionName,
  GCP_WORKLOAD_IDENTITY_PROVIDER: `${pool}/providers/github`,
  NEXT_PUBLIC_POSTHOG_KEY: posthog.apiToken,
  SITE_URL: url,
  WEB_BUILD_ENV: buildEnv(settings, mcpUrl),
  WEB_SERVICE: environment.service.name,
});

export const siteUrl = url;
export const serviceUri = environment.service.uri;
export const { imageRepository } = deploy;
export const sqlConnectionName = environment.sql.connectionName;
