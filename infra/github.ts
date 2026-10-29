// wovain's repository, github.com/sami-m-g/wovain: where the code lives and
// GitHub Actions runs CI (.github/workflows). main and the release branch
// change only through a pull request whose checks pass (ci.yml), and
// deploy.yml reaches Google Cloud through Workload Identity Federation as the
// accounts in the Actions variables below: production from the `Production`
// environment on the release branch, after approval; next.wovain.com from the
// `next` environment on main (docs/adr/0004-release-branch.md); dev.wovain.com
// from `dev`, and infra from `infrastructure`, both on main only. The provider
// authenticates with the `github:token` stack secret and `github:owner`.
import * as github from "@pulumi/github";
import type * as pulumi from "@pulumi/pulumi";

// GitHub Actions' app id: a required check must come from Actions, not from
// any app that reports a status of the same name.
const GITHUB_ACTIONS_APP_ID = 15_368;

type Variables = Record<string, pulumi.Input<string>>;

// An environment only main may use, with no approval. Google trusts each
// deploy account only from its own environment (infra/dev.ts).
export const mainOnlyEnvironment = (
  name: string,
  repository: pulumi.Input<string>
) => {
  const environment = new github.RepositoryEnvironment(name, {
    deploymentBranchPolicy: {
      customBranchPolicies: true,
      protectedBranches: false,
    },
    environment: name,
    repository,
  });
  new github.RepositoryEnvironmentDeploymentPolicy(`${name}-main`, {
    branchPattern: "main",
    environment: environment.environment,
    repository,
  });
  return environment;
};

// What a deploy environment's jobs read as `vars.<NAME>`; none is a secret.
export const environmentVariables = (
  key: string,
  environment: github.RepositoryEnvironment,
  values: Variables
) => {
  for (const [variableName, value] of Object.entries(values)) {
    new github.ActionsEnvironmentVariable(`${key}-${variableName}`, {
      environment: environment.environment,
      repository: environment.repository,
      value,
      variableName,
    });
  }
};

interface RepositoryArgs {
  // Shared by every workflow and environment.
  variables: Variables;
  // Each deploy environment's own: where it deploys, and as whom.
  // next.wovain.com's `next` environment is its own stack's (infra/next).
  environments: { production: Variables; dev: Variables };
  // The branch production deploys from, e.g. `release/transcend`.
  releaseBranch: string;
  // GitHub user ids who may approve a production deploy.
  releaseReviewerIds: number[];
  // ggshield's API key (.github/workflows/supply-chain.yml), from the
  // `gitguardian-api-key` stack secret. Left out, no secret is declared.
  gitguardianApiKey?: pulumi.Input<string> | undefined;
}

export const githubRepository = ({
  environments,
  gitguardianApiKey,
  releaseBranch,
  releaseReviewerIds,
  variables,
}: RepositoryArgs) => {
  // Adopted, never deleted: protected and retained, so removing it from the
  // program or `pulumi up` can't remove the repository.
  const repository = new github.Repository(
    "wovain",
    {
      allowAutoMerge: false,
      deleteBranchOnMerge: true,
      description:
        "wovain: an MCP server for print-on-demand sellers (product idea → Fourthwall product → Meta Advantage+ campaign).",
      hasIssues: true,
      hasProjects: false,
      hasWiki: false,
      homepageUrl: "https://wovain.com",
      name: "wovain",
      topics: [
        "fal-ai",
        "fourthwall",
        "google-cloud",
        "mcp",
        "mcp-apps",
        "meta-ads",
        "nextjs",
        "print-on-demand",
        "typescript",
      ],
      visibility: "public",
      // Dependabot alerts; security updates below need them on.
      vulnerabilityAlerts: true,
    },
    { import: "wovain", protect: true, retainOnDelete: true }
  );
  new github.RepositoryDependabotSecurityUpdates(
    "wovain",
    { enabled: true, repository: repository.name },
    { dependsOn: [repository] }
  );

  // The default branch: no deletion, no force-push, and every change through
  // a pull request whose CI passed: the tests (`verify`), `infra`, CodeQL,
  // the dependency review and the full OSV scan (.github/workflows), with one
  // approval that a new push dismisses. The maintainer works alone, so the
  // approval comes from CodeRabbit (.coderabbit.yaml: it requests changes on
  // blocking findings and approves once they are resolved). No one may
  // bypass the rules. CodeRabbit is not a required check: its review runs
  // beside CI, and its approval is what counts.
  new github.RepositoryRuleset("main", {
    conditions: {
      refName: { excludes: [], includes: ["~DEFAULT_BRANCH"] },
    },
    enforcement: "active",
    name: "main",
    repository: repository.name,
    rules: {
      deletion: true,
      nonFastForward: true,
      pullRequest: {
        dismissStaleReviewsOnPush: true,
        requireCodeOwnerReview: false,
        requireLastPushApproval: false,
        requiredApprovingReviewCount: 1,
        requiredReviewThreadResolution: false,
      },
      requiredStatusChecks: {
        requiredChecks: [
          "verify",
          "infra",
          "codeql",
          "dependency-review",
          // A reusable workflow's check is `<calling job> / <its job>`.
          "osv / osv-scan",
        ].map((context) => ({
          context,
          integrationId: GITHUB_ACTIONS_APP_ID,
        })),
        strictRequiredStatusChecksPolicy: false,
      },
    },
    target: "branch",
  });

  // The release branch production deploys from (docs/adr/0004-release-branch.md):
  // the same protection as main, with only `verify` required (infra/ is
  // applied from main, so the release branch's `infra` check means nothing).
  new github.RepositoryRuleset("release", {
    conditions: {
      refName: { excludes: [], includes: [`refs/heads/${releaseBranch}`] },
    },
    enforcement: "active",
    name: "release",
    repository: repository.name,
    rules: {
      deletion: true,
      nonFastForward: true,
      pullRequest: {
        dismissStaleReviewsOnPush: false,
        requireCodeOwnerReview: false,
        requireLastPushApproval: false,
        requiredApprovingReviewCount: 0,
        requiredReviewThreadResolution: false,
      },
      requiredStatusChecks: {
        requiredChecks: [
          { context: "verify", integrationId: GITHUB_ACTIONS_APP_ID },
        ],
        strictRequiredStatusChecksPolicy: false,
      },
    },
    target: "branch",
  });

  // Google trusts the production deploy account only from jobs in this
  // environment (infra/index.ts), and the environment only deploys the
  // release branch, after a reviewer approves the run. It already exists, as
  // `Production` (Vercel's integration made it), and GitHub matches
  // environment names without case, so it keeps that spelling: the name is
  // what reaches Google in the OIDC token's `environment` claim. Retained:
  // deleting it would delete Vercel's deployment history too.
  const production = new github.RepositoryEnvironment(
    "production",
    {
      deploymentBranchPolicy: {
        customBranchPolicies: true,
        protectedBranches: false,
      },
      environment: "Production",
      // The owner approves their own deploys: one reviewer is the gate, not
      // a second person.
      preventSelfReview: false,
      repository: repository.name,
      reviewers: [{ users: releaseReviewerIds }],
    },
    { retainOnDelete: true }
  );
  new github.RepositoryEnvironmentDeploymentPolicy("production-release", {
    branchPattern: releaseBranch,
    environment: production.environment,
    repository: repository.name,
  });

  // Environments that only main may use, with no approval: dev.wovain.com,
  // and `infrastructure`, the one Google trusts as the infrastructure
  // account (infra/bootstrap), for when a workflow runs `pulumi up`.
  const dev = mainOnlyEnvironment("dev", repository.name);
  mainOnlyEnvironment("infrastructure", repository.name);
  // The label .github/dependabot.yml puts on every update pull request;
  // Dependabot doesn't create it, and a missing label is an error there.
  new github.IssueLabel("dependencies", {
    color: "0366d6",
    description: "Pull requests that update a dependency",
    name: "dependencies",
    repository: repository.name,
  });

  // The one repository secret: ggshield's key. It is a stack secret, so
  // Pulumi keeps it encrypted in state; only the ggshield job reads it.
  if (gitguardianApiKey !== undefined) {
    new github.ActionsSecret("GITGUARDIAN_API_KEY", {
      plaintextValue: gitguardianApiKey,
      repository: repository.name,
      secretName: "GITGUARDIAN_API_KEY",
    });
  }

  // What the workflows read as `vars.<NAME>`; none is a secret.
  for (const [variableName, value] of Object.entries(variables)) {
    new github.ActionsVariable(variableName, {
      repository: repository.name,
      value,
      variableName,
    });
  }
  environmentVariables("production", production, environments.production);
  environmentVariables("dev", dev, environments.dev);
};
