// apps/web's non-production environments, in the same project and stack as
// production, so they ship through the same preview and policy gate. Each
// owns its resources and holds nothing of production's: its own database
// and user, its own `<id>-<name>` secret for every key the app reads (none
// of production's secrets is mounted), its own bucket and runtime account,
// and it scales to zero. What they share with production is the project,
// the DNS zone and the PostHog project (events carry their environment).
//
// - dev.wovain.com (`dev`): rolled out by hand (`gcloud run deploy
//   wovain-web-dev`); no workflow deploys it. Its database stays on
//   production's instance: moving it would replace a protected database.
// - next.wovain.com (`next`): where main deploys while production is frozen
//   (docs/adr/0004-release-branch.md). Its own Cloud SQL instance, image
//   repository and deploy account, which can roll out only this service and
//   read only this environment's database URL.
import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";

import {
  cloudRunService,
  postgresInstance,
  secretEnv,
  secretWithValue,
} from "./resources.ts";

// Who may deploy an environment from GitHub Actions.
interface Deploy {
  // The GitHub environment whose jobs may deploy it (infra/github.ts).
  githubEnvironment: string;
  // The workload identity pool that trusts GitHub Actions (infra/bootstrap).
  pool: string;
}

interface EnvironmentArgs {
  // Short name: the suffix of every resource name, e.g. `dev`.
  name: string;
  project: string;
  region: string;
  url: string;
  // The instance its database lives on; its own instance if unset.
  sql?: gcp.sql.DatabaseInstance;
  // Plain env values (name to value), none of them a secret.
  envs: { name: string; value: pulumi.Input<string> }[];
  // This environment's value for each provider secret, by production's id
  // (the env variable stays the same). Each is created as `<id>-<name>`; one
  // without a value stays empty and unmounted, since Cloud Run won't start
  // a revision on a secret with no version.
  providerSecrets: Record<string, pulumi.Input<string> | undefined>;
  // Data and identity options (protect), as in index.ts.
  kept: pulumi.CustomResourceOptions;
  afterApis: pulumi.CustomResourceOptions;
  deploy?: Deploy;
}

// The deploy account and image repository of an environment main deploys.
const deployAccess = (
  args: EnvironmentArgs & { deploy: Deploy },
  runner: gcp.serviceaccount.Account,
  service: gcp.cloudrunv2.Service,
  databaseUrl: gcp.secretmanager.Secret
) => {
  const { afterApis, deploy, kept, name, project, region } = args;
  // Apart from production's repository: these builds never push
  // production's live image out of its cleanup policy, and this deploy
  // account can't write production's tags.
  const images = new gcp.artifactregistry.Repository(
    `images-${name}`,
    {
      cleanupPolicies: [
        {
          action: "KEEP",
          id: "keep-recent",
          mostRecentVersions: { keepCount: 5 },
        },
        {
          action: "DELETE",
          condition: { tagState: "ANY" },
          id: "delete-rest",
        },
      ],
      format: "DOCKER",
      location: region,
      repositoryId: `wovain-${name}`,
    },
    kept
  );
  const deployer = new gcp.serviceaccount.Account(
    `deploy-${name}`,
    {
      accountId: `wovain-deploy-${name}`,
      displayName: `CI deploys main to ${name} (GitHub Actions)`,
    },
    kept
  );
  new gcp.serviceaccount.IAMMember(`deploy-${name}-from-github`, {
    member: `principalSet://iam.googleapis.com/${deploy.pool}/attribute.environment/${deploy.githubEnvironment}`,
    role: "roles/iam.workloadIdentityUser",
    serviceAccountId: deployer.name,
  });
  // cloudsql.client lets the migrate step reach the instance; it can log in
  // only as this environment's user, the one password it can read.
  for (const role of [
    "roles/cloudsql.client",
    "roles/serviceusage.serviceUsageConsumer",
  ]) {
    new gcp.projects.IAMMember(`deploy-${name}-${role.split("/")[1]}`, {
      member: deployer.member,
      project,
      role,
    });
  }
  // On this service only, not the project.
  new gcp.cloudrunv2.ServiceIamMember(`deploy-${name}-run-developer`, {
    location: region,
    member: deployer.member,
    name: service.name,
    role: "roles/run.developer",
  });
  new gcp.artifactregistry.RepositoryIamMember(
    `deploy-${name}-images`,
    {
      location: images.location,
      member: deployer.member,
      repository: images.name,
      role: "roles/artifactregistry.writer",
    },
    afterApis
  );
  new gcp.secretmanager.SecretIamMember(`deploy-${name}-database-url`, {
    member: deployer.member,
    role: "roles/secretmanager.secretAccessor",
    secretId: databaseUrl.id,
  });
  new gcp.serviceaccount.IAMMember(`deploy-${name}-acts-as-runner`, {
    member: deployer.member,
    role: "roles/iam.serviceAccountUser",
    serviceAccountId: runner.name,
  });
  return {
    deployer,
    imageRepository: pulumi.interpolate`${region}-docker.pkg.dev/${project}/${images.repositoryId}`,
  };
};

export const appEnvironment = (args: EnvironmentArgs) => {
  const { kept, name, region } = args;
  const sql =
    args.sql ??
    postgresInstance(`postgres-${name}`, `wovain-${name}`, region, kept);
  const database = new gcp.sql.Database(
    `wovain-${name}`,
    { instance: sql.name, name: `wovain_${name}` },
    kept
  );
  const password = new random.RandomPassword(`postgres-wovain-${name}`, {
    length: 32,
    special: false,
  });
  const user = new gcp.sql.User(`wovain-${name}`, {
    instance: sql.name,
    name: `wovain_${name}`,
    password: password.result,
  });
  // Generated here; the provider secrets come from the caller.
  const values: Record<string, pulumi.Input<string> | undefined> = {
    "better-auth-secret": new random.RandomPassword(
      `better-auth-secret-${name}`,
      { length: 48, special: false }
    ).result,
    "database-url": pulumi.interpolate`postgresql://${user.name}:${password.result}@localhost/${database.name}?host=/cloudsql/${sql.connectionName}`,
    "token-encryption-key": new random.RandomBytes(
      `token-encryption-key-${name}`,
      { length: 32 }
    ).base64,
    ...args.providerSecrets,
  };

  const runner = new gcp.serviceaccount.Account(
    `web-runner-${name}`,
    {
      accountId: `wovain-web-${name}`,
      displayName: `wovain web ${name} (Cloud Run)`,
    },
    kept
  );
  for (const role of ["roles/cloudsql.client", "roles/logging.logWriter"]) {
    new gcp.projects.IAMMember(`runner-${name}-${role.split("/")[1]}`, {
      member: runner.member,
      project: args.project,
      role,
    });
  }
  const bucket = new gcp.storage.Bucket(
    `media-${name}`,
    {
      location: region.toUpperCase(),
      name: `${args.project}-media-${name}`,
      publicAccessPrevention: "enforced",
      uniformBucketLevelAccess: true,
    },
    kept
  );
  new gcp.storage.BucketIAMMember(`runner-${name}-media`, {
    bucket: bucket.name,
    member: runner.member,
    role: "roles/storage.objectAdmin",
  });

  // Every secret is `<id>-<name>`; only those with a value are mounted.
  const versions: pulumi.Resource[] = [];
  const mounted = new Map<string, gcp.secretmanager.Secret>();
  let databaseUrl: gcp.secretmanager.Secret | undefined;
  for (const [id, value] of Object.entries(values)) {
    const { secret, version } = secretWithValue(`${id}-${name}`, value, kept);
    if (id === "database-url") {
      databaseUrl = secret;
    }
    if (version !== undefined) {
      versions.push(version);
      mounted.set(id, secret);
    }
  }
  if (databaseUrl === undefined) {
    throw new Error(`${name} has no database-url secret`);
  }
  // The service waits for these: Cloud Run checks access to every mounted
  // secret when it rolls out a revision.
  const access = [...mounted].map(
    ([id, secret]) =>
      new gcp.secretmanager.SecretIamMember(`runner-${name}-${id}`, {
        member: runner.member,
        role: "roles/secretmanager.secretAccessor",
        secretId: secret.id,
      })
  );

  const service = cloudRunService(`web-${name}`, {
    cloudSqlInstance: sql.connectionName,
    dependsOn: [...versions, ...access],
    envs: [
      ...args.envs,
      { name: "BETTER_AUTH_URL", value: args.url },
      { name: "MCP_URL", value: `${args.url}/api/mcp` },
      { name: "WOVAIN_BUCKET", value: bucket.name },
      ...[...mounted].map(([id, secret]) => secretEnv(id, secret.secretId)),
    ],
    location: region,
    // One instance answered 429 ("no available instance") to page loads
    // while a deploy or a scale event replaced it (QA 2026-10-29): a second
    // one serves in the meantime, as production's does.
    maxInstances: 2,
    // The same app as production's, with Mastra's agents in-process.
    memory: "1Gi",
    name: `wovain-web-${name}`,
    port: 3001,
    serviceAccount: runner.email,
  });
  const deploy =
    args.deploy === undefined
      ? undefined
      : deployAccess(
          { ...args, deploy: args.deploy },
          runner,
          service,
          databaseUrl
        );
  return { databaseUrl, deploy, runner, service, sql };
};
