// `pulumi up` of the github stack (infra/github) from GitHub Actions, on
// every push to main (.github/workflows/infra.yml, `up-github`). That stack
// holds only GitHub resources, so its account gets no Google role at all:
//
// - Google trusts it only from jobs in the `github-infrastructure` GitHub
//   environment, through the `github` pool, which accepts only main
//   (index.ts). infra/github declares that environment with a main-only
//   branch policy.
// - It encrypts and decrypts only the github stack's secrets (its GitHub
//   token), with their own key, and reads and writes only that stack's
//   objects in the state bucket (stack-access.ts).
import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";

import { stackAccess } from "./stack-access.ts";

const ENVIRONMENT = "github-infrastructure";
const NAME = "github";

interface GithubArgs {
  githubPool: pulumi.Input<string>;
  keyRing: pulumi.Input<string>;
  // Its name, as fixed in state.ts.
  stateBucket: string;
}

export const githubInfrastructure = (args: GithubArgs) => {
  const account = new gcp.serviceaccount.Account(
    "infra-github",
    {
      accountId: "infra-github",
      displayName: "CI infrastructure for the GitHub repository (Pulumi)",
    },
    { protect: true }
  );
  new gcp.serviceaccount.IAMMember("infra-github-from-github", {
    member: pulumi.interpolate`principalSet://iam.googleapis.com/${args.githubPool}/attribute.environment/${ENVIRONMENT}`,
    role: "roles/iam.workloadIdentityUser",
    serviceAccountId: account.name,
  });
  const stackSecrets = stackAccess({
    account,
    keyName: `${NAME}-stack-secrets`,
    keyRing: args.keyRing,
    prefix: "infra-github",
    project: `wovain-${NAME}`,
    stateBucket: args.stateBucket,
  });
  return { account: account.email, stackSecrets };
};
