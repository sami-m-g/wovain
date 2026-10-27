// wovain's repository, github.com/sami-m-g/wovain: where the code lives and
// GitHub Actions runs CI (.github/workflows). main changes only through a
// pull request whose `verify` and `infra` checks pass (ci.yml), and
// deploy.yml reaches Google Cloud through Workload Identity Federation as the
// accounts in the Actions variables below, from the `Production` environment
// on main only. The provider authenticates with the `github:token` stack
// secret and `github:owner`.
import * as github from "@pulumi/github";
import type * as pulumi from "@pulumi/pulumi";

// GitHub Actions' app id: a required check must come from Actions, not from
// any app that reports a status of the same name.
const GITHUB_ACTIONS_APP_ID = 15_368;

export const githubRepository = (
  variables: Record<string, pulumi.Input<string>>
) => {
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
  // a pull request whose CI passed. No required approval: the maintainer
  // merges their own pull requests.
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
        dismissStaleReviewsOnPush: false,
        requireCodeOwnerReview: false,
        requireLastPushApproval: false,
        requiredApprovingReviewCount: 0,
        requiredReviewThreadResolution: false,
      },
      requiredStatusChecks: {
        requiredChecks: ["verify", "infra"].map((context) => ({
          context,
          integrationId: GITHUB_ACTIONS_APP_ID,
        })),
        strictRequiredStatusChecksPolicy: false,
      },
    },
    target: "branch",
  });

  // Google trusts the deploy account only from jobs in this environment
  // (infra/index.ts), and the environment only deploys main. It already
  // exists, as `Production` (Vercel's integration made it), and GitHub
  // matches environment names without case, so it keeps that spelling: the
  // name is what reaches Google in the OIDC token's `environment` claim.
  // Retained: deleting it would delete Vercel's deployment history too.
  const production = new github.RepositoryEnvironment(
    "production",
    {
      deploymentBranchPolicy: {
        customBranchPolicies: true,
        protectedBranches: false,
      },
      environment: "Production",
      repository: repository.name,
    },
    { retainOnDelete: true }
  );
  new github.RepositoryEnvironmentDeploymentPolicy("production-main", {
    branchPattern: "main",
    environment: production.environment,
    repository: repository.name,
  });

  // What the workflows read as `vars.<NAME>`; none is a secret.
  for (const [variableName, value] of Object.entries(variables)) {
    new github.ActionsVariable(variableName, {
      repository: repository.name,
      value,
      variableName,
    });
  }
};
