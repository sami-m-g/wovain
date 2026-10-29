// `pulumi up` of the next stack (infra/next) from GitHub Actions, on every
// push to main (.github/workflows/infra.yml, `up-next`). Main's code runs
// there unreviewed by a second person, so its account can change next.wovain.com
// and nothing of production's:
//
// - Google trusts it only from jobs in the `next-infrastructure` GitHub
//   environment, through the `github` pool, which accepts only main
//   (index.ts). infra/next declares that environment with a main-only
//   branch policy.
// - next's stack secrets have their own key; infra-next can't decrypt
//   production's or bootstrap's (their encrypted data keys are public in
//   the repository).
// - It reads and writes only next's objects in the state bucket.
// - Its project roles are conditioned on next's resource names: the
//   `wovain-next` Cloud SQL instance, `wovain-web-next` Cloud Run service,
//   `wovain-next` image repository, `wovain-media-next` bucket and the
//   `<id>-next` secrets. It can grant only the project roles next's own
//   accounts hold, and administer only those two accounts.
//
// What it still shares with production: the `wovain-com` DNS zone (next adds
// next.wovain.com's records), and Search Console, where next's domain
// mapping needs a verified owner: infra-next isn't one, so a change that
// replaces that mapping is applied from a laptop (infra/README.md).
import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";

const ENVIRONMENT = "next-infrastructure";
const NAME = "next";
const kept = { protect: true };

interface NextArgs {
  githubPool: pulumi.Input<string>;
  keyRing: pulumi.Input<string>;
  project: string;
  projectNumber: string;
  region: string;
  // Its name, as fixed in state.ts.
  stateBucket: string;
}

// Roles granted on the project, each only on next's resources.
const conditional = (
  project: string,
  projectNumber: string,
  region: string
) => [
  {
    expression: `resource.name.startsWith("projects/${project}/instances/wovain-${NAME}")`,
    role: "roles/cloudsql.admin",
    title: "next's Cloud SQL instance",
  },
  {
    expression: `resource.name.startsWith("projects/${project}/locations/${region}/services/wovain-web-${NAME}")`,
    role: "roles/run.admin",
    title: "next's Cloud Run service",
  },
  {
    expression: `resource.name.startsWith("projects/${project}/locations/${region}/repositories/wovain-${NAME}")`,
    role: "roles/artifactregistry.admin",
    title: "next's image repository",
  },
  {
    expression: `resource.name.startsWith("projects/_/buckets/${project}-media-${NAME}")`,
    role: "roles/storage.admin",
    title: "next's media bucket",
  },
  {
    // A secret is projects/<number>/secrets/<id>; a version adds
    // /versions/<n>.
    expression: `resource.name.startsWith("projects/${projectNumber}/secrets/") && (resource.name.endsWith("-${NAME}") || resource.name.extract("/secrets/{id}/versions/").endsWith("-${NAME}"))`,
    role: "roles/secretmanager.admin",
    title: "next's secrets",
  },
  {
    // The only project roles infra/dev.ts grants next's accounts.
    expression: `api.getAttribute("iam.googleapis.com/modifiedGrantsByRole", []).hasOnly(["roles/cloudsql.client", "roles/logging.logWriter", "roles/serviceusage.serviceUsageConsumer"])`,
    role: "roles/resourcemanager.projectIamAdmin",
    title: "next's accounts' project roles",
  },
];

export const nextInfrastructure = (args: NextArgs) => {
  const { project, projectNumber, region } = args;
  const account = new gcp.serviceaccount.Account(
    "infra-next",
    {
      accountId: "infra-next",
      displayName: "CI infrastructure for next.wovain.com (Pulumi)",
    },
    kept
  );
  new gcp.serviceaccount.IAMMember("infra-next-from-github", {
    member: pulumi.interpolate`principalSet://iam.googleapis.com/${args.githubPool}/attribute.environment/${ENVIRONMENT}`,
    role: "roles/iam.workloadIdentityUser",
    serviceAccountId: account.name,
  });

  // next's own stack secrets key: `pulumi stack change-secrets-provider`
  // moves the next stack onto it (infra/README.md).
  const stackSecrets = new gcp.kms.CryptoKey(
    "next-stack-secrets",
    {
      destroyScheduledDuration: "2592000s",
      keyRing: args.keyRing,
      name: "next-stack-secrets",
      purpose: "ENCRYPT_DECRYPT",
      versionTemplate: {
        algorithm: "GOOGLE_SYMMETRIC_ENCRYPTION",
        protectionLevel: "SOFTWARE",
      },
    },
    kept
  );
  new gcp.kms.CryptoKeyIAMMember("infra-next-stack-secrets", {
    cryptoKeyId: stackSecrets.id,
    member: account.member,
    role: "roles/cloudkms.cryptoKeyEncrypterDecrypter",
  });

  // The state bucket: it lists every object's name, and reads and writes
  // only next's stack, its locks, history and backups.
  new gcp.storage.BucketIAMMember("infra-next-state-list", {
    bucket: args.stateBucket,
    member: account.member,
    role: "roles/storage.legacyBucketReader",
  });
  // Pulumi's object layout: .pulumi/<kind>/<project>/<stack>...
  const objects = `projects/_/buckets/${args.stateBucket}/objects/.pulumi`;
  new gcp.storage.BucketIAMMember("infra-next-state", {
    bucket: args.stateBucket,
    condition: {
      expression: ["stacks", "locks", "history", "backups"]
        .map(
          (kind) =>
            `resource.name.startsWith("${objects}/${kind}/wovain-${NAME}/")`
        )
        .join(" || "),
      title: "next's state",
    },
    member: account.member,
    role: "roles/storage.objectAdmin",
  });
  new gcp.storage.BucketIAMMember("infra-next-state-meta", {
    bucket: args.stateBucket,
    condition: {
      expression: `resource.name == "${objects}/meta.yaml"`,
      title: "the backend's metadata",
    },
    member: account.member,
    role: "roles/storage.objectViewer",
  });

  // Reading the project (getProject) and billing API calls to it
  // (gcp:userProjectOverride).
  for (const role of [
    "roles/browser",
    "roles/serviceusage.serviceUsageConsumer",
  ]) {
    new gcp.projects.IAMMember(`infra-next-${role.split("/")[1]}`, {
      member: account.member,
      project,
      role,
    });
  }
  for (const { expression, role, title } of conditional(
    project,
    projectNumber,
    region
  )) {
    new gcp.projects.IAMMember(`infra-next-${role.split("/")[1]}`, {
      condition: { expression, title },
      member: account.member,
      project,
      role,
    });
  }

  // next's two accounts (infra/dev.ts): it administers them, and Cloud Run
  // runs the service as the runner, which needs actAs.
  for (const accountId of [`wovain-deploy-${NAME}`, `wovain-web-${NAME}`]) {
    new gcp.serviceaccount.IAMMember(`infra-next-admin-${accountId}`, {
      member: account.member,
      role: "roles/iam.serviceAccountAdmin",
      serviceAccountId: `projects/${project}/serviceAccounts/${accountId}@${project}.iam.gserviceaccount.com`,
    });
  }
  new gcp.serviceaccount.IAMMember("infra-next-acts-as-runner", {
    member: account.member,
    role: "roles/iam.serviceAccountUser",
    serviceAccountId: `projects/${project}/serviceAccounts/wovain-web-${NAME}@${project}.iam.gserviceaccount.com`,
  });

  // next.wovain.com's records are in production's zone.
  new gcp.dns.DnsManagedZoneIamMember("infra-next-dns", {
    managedZone: "wovain-com",
    member: account.member,
    project,
    role: "roles/dns.admin",
  });

  return { account: account.email, stackSecrets };
};
