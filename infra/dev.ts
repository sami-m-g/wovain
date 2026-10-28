// apps/web's non-production environments, in the same project and stack as
// production, so they ship through the same preview and policy gate and share
// what costs money or can't be duplicated: the Cloud SQL instance (each its
// own database and user), the DNS zone and, unless overridden, the provider
// API keys. Each gets its own auth secret, token key, database URL, bucket and
// runtime account, and scales to zero.
//
// - dev.wovain.com (`dev`): rolled out by hand (`gcloud run deploy
//   wovain-web-dev`); no workflow deploys it.
// - qloo.wovain.com (`qloo`): where main deploys while production is frozen
//   (docs/adr/0004-release-branch.md), for the Qloo and Nebius judges. It is
//   `isolated`: its own Inngest keys and Polar credentials, never
//   production's, optional keys of its own for the metered providers, its
//   own image repository and its own deploy account, which can roll out only
//   this service and read only this environment's database URL.
import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";

import { cloudRunService, secretEnv, secretWithValue } from "./resources.ts";

interface Isolation {
  // Values for the secrets that never fall back to production's, by
  // production's id; each is mounted once it has one.
  ownSecrets: Record<string, pulumi.Input<string> | undefined>;
  // Values for metered provider keys; an id without one mounts production's.
  ownKeys: Record<string, pulumi.Input<string> | undefined>;
  // The GitHub environment whose jobs may deploy it (infra/github.ts).
  githubEnvironment: string;
  // The workload identity pool that trusts GitHub Actions (infra/bootstrap).
  pool: string;
  afterApis: pulumi.CustomResourceOptions;
}

interface EnvironmentArgs {
  // Short name: the suffix of every resource name, e.g. `dev`.
  name: string;
  project: string;
  region: string;
  url: string;
  sql: gcp.sql.DatabaseInstance;
  // Production's KMS key (no longer read by the app); dev kept its grant,
  // an isolated environment gets none.
  connectionsKey?: gcp.kms.CryptoKey;
  // Production's secrets by id, and the ids that have a value.
  secrets: Map<string, gcp.secretmanager.Secret>;
  populated: string[];
  // Shared env values (name to value), from production's service.
  envs: { name: string; value: pulumi.Input<string> }[];
  // Data and identity options (protect), as in index.ts.
  kept: pulumi.CustomResourceOptions;
  isolation?: Isolation;
}

// The deploy account and image repository of an isolated environment.
const deployAccess = (
  args: EnvironmentArgs & { isolation: Isolation },
  runner: gcp.serviceaccount.Account,
  service: gcp.cloudrunv2.Service,
  databaseUrl: gcp.secretmanager.Secret
) => {
  const { isolation, kept, name, project, region } = args;
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
    member: `principalSet://iam.googleapis.com/${isolation.pool}/attribute.environment/${isolation.githubEnvironment}`,
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
    isolation.afterApis
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
  const { isolation, kept, name, region, sql } = args;
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
  // The environment's own secrets, by production's id (the env variable
  // stays the same).
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
  if (args.connectionsKey !== undefined) {
    new gcp.kms.CryptoKeyIAMMember(`runner-${name}-connections`, {
      cryptoKeyId: args.connectionsKey.id,
      member: runner.member,
      role: "roles/cloudkms.cryptoKeyEncrypterDecrypter",
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

  // `<id>-<name>` for its own secrets, production's for the shared API keys.
  const versions: pulumi.Resource[] = [];
  const mounted = new Map<string, gcp.secretmanager.Secret>();
  for (const [id, value] of Object.entries(values)) {
    const { secret, version } = secretWithValue(`${id}-${name}`, value, kept);
    if (version !== undefined) {
      versions.push(version);
    }
    mounted.set(id, secret);
  }
  // An isolated environment's own secrets and keys exist only once their
  // stack secret is set, so no empty secret is created.
  const own = isolation === undefined ? {} : isolation.ownSecrets;
  const keys = isolation === undefined ? {} : isolation.ownKeys;
  for (const [id, value] of Object.entries({ ...own, ...keys })) {
    if (value !== undefined) {
      const { secret, version } = secretWithValue(`${id}-${name}`, value, kept);
      if (version !== undefined) {
        versions.push(version);
      }
      mounted.set(id, secret);
    }
  }
  const databaseUrl = mounted.get("database-url");
  if (databaseUrl === undefined) {
    throw new Error(`${name} has no database-url secret`);
  }
  for (const id of args.populated.filter(
    (i) => !mounted.has(i) && !(i in own)
  )) {
    const secret = args.secrets.get(id);
    if (secret !== undefined) {
      mounted.set(id, secret);
    }
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
    maxInstances: 1,
    // The same app as production's, with Mastra's agents in-process.
    memory: "1Gi",
    name: `wovain-web-${name}`,
    port: 3001,
    serviceAccount: runner.email,
  });
  const deploy =
    isolation === undefined
      ? undefined
      : deployAccess({ ...args, isolation }, runner, service, databaseUrl);
  return { databaseUrl, deploy, runner, service };
};
