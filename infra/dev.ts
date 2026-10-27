// dev.wovain.com: apps/web's development environment, in the same project
// and stack as production, so it ships through the same preview and policy
// gate and shares what costs money or can't be duplicated: the Cloud SQL
// instance (its own database and user), the DNS zone, the provider API keys.
// It gets its own auth secret, token key, database URL, bucket and runtime
// account, and scales to zero. CI rolls images out to it from main by hand
// (.gitlab/ci/deploy.yml, deploy:development).
import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";

import { cloudRunService, secretEnv, secretWithValue } from "./resources.ts";

interface DevArgs {
  project: string;
  region: string;
  url: string;
  sql: gcp.sql.DatabaseInstance;
  connectionsKey: gcp.kms.CryptoKey;
  // Production's secrets by id, and the ids that have a value.
  secrets: Map<string, gcp.secretmanager.Secret>;
  populated: string[];
  // Shared env values (name to value), from production's service.
  envs: { name: string; value: pulumi.Input<string> }[];
  // Data and identity options (protect), as in index.ts.
  kept: pulumi.CustomResourceOptions;
}

export const devEnvironment = (args: DevArgs) => {
  const { kept, region, sql } = args;
  const database = new gcp.sql.Database(
    "wovain-dev",
    { instance: sql.name, name: "wovain_dev" },
    kept
  );
  const password = new random.RandomPassword("postgres-wovain-dev", {
    length: 32,
    special: false,
  });
  const user = new gcp.sql.User("wovain-dev", {
    instance: sql.name,
    name: "wovain_dev",
    password: password.result,
  });
  // Dev's own secrets, by production's id (the env variable stays the same).
  const values: Record<string, pulumi.Input<string>> = {
    "better-auth-secret": new random.RandomPassword("better-auth-secret-dev", {
      length: 48,
      special: false,
    }).result,
    "database-url": pulumi.interpolate`postgresql://${user.name}:${password.result}@localhost/${database.name}?host=/cloudsql/${sql.connectionName}`,
    "token-encryption-key": new random.RandomBytes("token-encryption-key-dev", {
      length: 32,
    }).base64,
  };

  const runner = new gcp.serviceaccount.Account(
    "web-runner-dev",
    { accountId: "wovain-web-dev", displayName: "wovain web dev (Cloud Run)" },
    kept
  );
  for (const role of ["roles/cloudsql.client", "roles/logging.logWriter"]) {
    new gcp.projects.IAMMember(`runner-dev-${role.split("/")[1]}`, {
      member: runner.member,
      project: args.project,
      role,
    });
  }
  new gcp.kms.CryptoKeyIAMMember("runner-dev-connections", {
    cryptoKeyId: args.connectionsKey.id,
    member: runner.member,
    role: "roles/cloudkms.cryptoKeyEncrypterDecrypter",
  });
  const bucket = new gcp.storage.Bucket(
    "media-dev",
    {
      location: region.toUpperCase(),
      name: `${args.project}-media-dev`,
      publicAccessPrevention: "enforced",
      uniformBucketLevelAccess: true,
    },
    kept
  );
  new gcp.storage.BucketIAMMember("runner-dev-media", {
    bucket: bucket.name,
    member: runner.member,
    role: "roles/storage.objectAdmin",
  });

  // `<id>-dev` for its own secrets, production's for the shared API keys.
  const versions: pulumi.Resource[] = [];
  const mounted = new Map<string, gcp.secretmanager.Secret>();
  for (const [id, value] of Object.entries(values)) {
    const { secret, version } = secretWithValue(`${id}-dev`, value, kept);
    if (version !== undefined) {
      versions.push(version);
    }
    mounted.set(id, secret);
  }
  const databaseUrl = mounted.get("database-url");
  if (databaseUrl === undefined) {
    throw new Error("dev has no database-url secret");
  }
  for (const id of args.populated.filter((i) => !(i in values))) {
    const secret = args.secrets.get(id);
    if (secret !== undefined) {
      mounted.set(id, secret);
    }
  }
  // The service waits for these: Cloud Run checks access to every mounted
  // secret when it rolls out a revision.
  const access = [...mounted].map(
    ([id, secret]) =>
      new gcp.secretmanager.SecretIamMember(`runner-dev-${id}`, {
        member: runner.member,
        role: "roles/secretmanager.secretAccessor",
        secretId: secret.id,
      })
  );

  const service = cloudRunService("web-dev", {
    cloudSqlInstance: sql.connectionName,
    dependsOn: [...versions, ...access],
    envs: [
      ...args.envs,
      { name: "BETTER_AUTH_URL", value: args.url },
      { name: "GITLAB_FEATURE_FLAGS_ENVIRONMENT", value: "development" },
      { name: "MCP_URL", value: `${args.url}/api/mcp` },
      { name: "WOVAIN_BUCKET", value: bucket.name },
      ...[...mounted].map(([id, secret]) => secretEnv(id, secret.secretId)),
    ],
    location: region,
    maxInstances: 1,
    // The same app as production's, with Mastra's agents in-process.
    memory: "1Gi",
    name: "wovain-web-dev",
    port: 3001,
    serviceAccount: runner.email,
  });
  return { databaseUrl, runner, service };
};
