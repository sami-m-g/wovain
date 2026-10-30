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
//   `wovain-next` Cloud SQL instance, `wovain-next` image repository,
//   `wovain-media-next` bucket and the `<id>-next` secrets. Cloud Run's
//   conditions can't test a resource name, so `run.admin` is granted on
//   the `wovain-web-next` service itself. It can grant only the project
//   roles next's own accounts hold, and administer only those two accounts.
//
// What it still shares with production: the `wovain-com` DNS zone (next adds
// next.wovain.com's records), and Search Console, where next's domain
// mapping needs a verified owner: infra-next isn't one, so a change that
// replaces that mapping is applied from a laptop (infra/README.md).
import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";

import { stackAccess } from "./stack-access.ts";

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
// Cloud Run isn't among the services whose resource names IAM Conditions
// can test (cloud.google.com/iam/docs/conditions-resource-attributes): a
// project role conditioned on the service's name never grants anything, so
// its role is granted on the service itself (nextInfrastructure below). The
// same holds for Artifact Registry: Cloud Run checks downloadArtifacts on
// the image repository when it updates the service, and a project role
// conditioned on the repository's name was denied, so that role is granted
// on the repository itself.
const conditional = (project: string, projectNumber: string) => [
  {
    expression: `resource.name.startsWith("projects/${project}/instances/wovain-${NAME}")`,
    role: "roles/cloudsql.admin",
    title: "next's Cloud SQL instance",
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

  // next's own stack secrets key (`pulumi stack change-secrets-provider`
  // moved the next stack onto it, infra/README.md) and next's objects in the
  // state bucket.
  const stackSecrets = stackAccess({
    account,
    keyName: `${NAME}-stack-secrets`,
    keyRing: args.keyRing,
    prefix: "infra-next",
    project: `wovain-${NAME}`,
    stateBucket: args.stateBucket,
  });

  // Reading the project (getProject), billing API calls to it
  // (gcp:userProjectOverride) and, for `run.viewer`, polling Cloud Run's
  // long-running operations: `run.operations.get` is checked on the
  // project's location, not on the service, so `run.admin` on the service
  // never covers it and an update failed with a 403 after it had started.
  // Read-only; it also lets this account read production's Cloud Run
  // configuration, which it can't change.
  for (const role of [
    "roles/browser",
    "roles/run.viewer",
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
    projectNumber
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

  // next's Cloud Run service, on the service: it exists already (next's
  // stack made it), and infra-next can't create another one.
  new gcp.cloudrunv2.ServiceIamMember("infra-next-run-admin", {
    location: region,
    member: account.member,
    name: `wovain-web-${NAME}`,
    project,
    role: "roles/run.admin",
  });

  // next's image repository, on the repository (see `conditional`).
  new gcp.artifactregistry.RepositoryIamMember("infra-next-artifact-admin", {
    location: region,
    member: account.member,
    project,
    repository: `wovain-${NAME}`,
    role: "roles/artifactregistry.admin",
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
