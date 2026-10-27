// Resource shapes index.ts, dev.ts and legacy.ts declare more than once.
// Plain functions, not components: each resource keeps its logical name and
// parent, so its URN is unchanged.
import * as gcp from "@pulumi/gcp";
import type * as pulumi from "@pulumi/pulumi";

type Env = gcp.types.input.cloudrunv2.ServiceTemplateContainerEnv;

// A secret's env variable is its Secret Manager id in upper snake case.
export const toEnvName = (id: string) => id.toUpperCase().replaceAll("-", "_");

// Mounts a secret's latest version as the env variable named after `id`.
export const secretEnv = (
  id: string,
  secret: pulumi.Input<string> = id
): Env => ({
  name: toEnvName(id),
  valueSource: { secretKeyRef: { secret, version: "latest" } },
});

// A secret, named by its id, and a version with `value` when there is one.
export const secretWithValue = (
  id: string,
  value: pulumi.Input<string> | undefined,
  secretOpts: pulumi.CustomResourceOptions,
  versionOpts?: pulumi.CustomResourceOptions
) => {
  const secret = new gcp.secretmanager.Secret(
    id,
    { replication: { auto: {} }, secretId: id },
    secretOpts
  );
  const version =
    value === undefined
      ? undefined
      : new gcp.secretmanager.SecretVersion(
          id,
          { secret: secret.id, secretData: value },
          versionOpts
        );
  return { secret, version };
};

interface ServiceArgs {
  // The Cloud Run service's own name.
  name: string;
  location: string;
  envs: pulumi.Input<Env>[];
  // The image's own port (its Dockerfile).
  port: number;
  maxInstances: number;
  serviceAccount: pulumi.Input<string>;
  // Mounts the instance's Auth Proxy socket under /cloudsql.
  cloudSqlInstance?: pulumi.Input<string>;
  // What the revision needs first, such as the secret versions it mounts.
  dependsOn: pulumi.Input<pulumi.Resource>[];
  // The longest a request may take ("900s"); Cloud Run's 300 s if unset.
  timeout?: string;
  // The instance's memory limit; 512Mi if unset. One vCPU allows up to 4Gi.
  memory?: string;
  // Extra CPU while an instance starts, for shorter cold starts.
  startupCpuBoost?: boolean;
}

// Pulumi owns a service's settings; CI rolls out each image with `gcloud run
// deploy --image` (.github/workflows/deploy.yml), so the image is ignored
// here. `pulumi up --refresh` reads the live image first, so a settings
// change keeps it. Traffic is CI's too, so a `pulumi up` never moves it.
// Public: the apps guard themselves (Better Auth).
export const cloudRunService = (logicalName: string, args: ServiceArgs) => {
  const sql = args.cloudSqlInstance;
  return new gcp.cloudrunv2.Service(
    logicalName,
    {
      deletionProtection: false,
      ingress: "INGRESS_TRAFFIC_ALL",
      invokerIamDisabled: true,
      location: args.location,
      name: args.name,
      template: {
        containers: [
          {
            envs: args.envs,
            image: "us-docker.pkg.dev/cloudrun/container/hello",
            ports: { containerPort: args.port },
            resources: {
              cpuIdle: true,
              limits: { cpu: "1", memory: args.memory ?? "512Mi" },
              startupCpuBoost: args.startupCpuBoost,
            },
            volumeMounts:
              sql === undefined
                ? undefined
                : [{ mountPath: "/cloudsql", name: "cloudsql" }],
          },
        ],
        scaling: { maxInstanceCount: args.maxInstances, minInstanceCount: 0 },
        serviceAccount: args.serviceAccount,
        timeout: args.timeout,
        volumes:
          sql === undefined
            ? undefined
            : [{ cloudSqlInstance: { instances: [sql] }, name: "cloudsql" }],
      },
    },
    {
      dependsOn: args.dependsOn,
      ignoreChanges: [
        "client",
        "clientVersion",
        "template.containers[0].image",
        "traffics",
      ],
    }
  );
};
