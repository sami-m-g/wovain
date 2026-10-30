// wovain's repository, github.com/sami-m-g/wovain: where the code lives and
// GitHub Actions runs CI (.github/workflows). main and the release branch
// change only through a pull request whose checks pass (ci.yml), and
// deploy.yml reaches Google Cloud through Workload Identity Federation as the
// accounts in the Actions variables below: production from the `Production`
// environment on the release branch, after approval; next.wovain.com from the
// `next` environment on main (docs/adr/0004-release-branch.md); dev.wovain.com
// from `dev`, and infra from `infrastructure`, both on main only.
//
// Two stacks declare it. The repository itself (its settings, rulesets,
// label and repository secret) is the `github` stack's (infra/github,
// repositorySettings below), applied on every push to main with only a
// GitHub token. The deploy environments and the Actions variables, which
// name production's Google resources, stay in production's stack
// (deployEnvironments below). Each provider authenticates with its stack's
// `github:token` secret and `github:owner`.
import * as github from "@pulumi/github";
import type * as pulumi from "@pulumi/pulumi";

// GitHub Actions' app id: a required check must come from Actions, not from
// any app that reports a status of the same name.
const GITHUB_ACTIONS_APP_ID = 15_368;

type Variables = Record<string, pulumi.Input<string>>;

// An environment only main may use. Google trusts each deploy account only
// from its own environment (infra/dev.ts). With reviewerIds, a job in it
// also waits until one of those GitHub users approves the run.
export const mainOnlyEnvironment = (
  name: string,
  repository: pulumi.Input<string>,
  reviewerIds?: number[]
) => {
  const environment = new github.RepositoryEnvironment(name, {
    deploymentBranchPolicy: {
      customBranchPolicies: true,
      protectedBranches: false,
    },
    environment: name,
    repository,
    ...(reviewerIds === undefined
      ? {}
      : {
          // The owner approves their own runs: the approval is the gate.
          preventSelfReview: false,
          reviewers: [{ users: reviewerIds }],
        }),
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

// The repository both stacks address by name.
export const REPOSITORY = "wovain";

interface SettingsArgs {
  // The branch production deploys from, e.g. `release/transcend`.
  releaseBranch: string;
  // GitGuardian's incidents:write token (.github/workflows/gitguardian-ignore.yml),
  // from the `gitguardian-api-key` stack secret. Left out, no secret is declared.
  gitguardianApiKey?: pulumi.Input<string> | undefined;
  // The token release-please opens its pull request and tags with, from the
  // `release-please-token` stack secret (.github/workflows/release.yml). Left
  // out, no secret is declared and release-please uses the default token.
  releasePleaseToken?: pulumi.Input<string> | undefined;
  // The founder's Claude subscription token (`claude setup-token`) that
  // .github/workflows/claude-review.yml signs in with, from the
  // `claude-code-oauth-token` stack secret. Left out, no secret is declared.
  claudeCodeOauthToken?: pulumi.Input<string> | undefined;
}

interface EnvironmentArgs {
  // Shared by every workflow and environment.
  variables: Variables;
  // Each deploy environment's own: where it deploys, and as whom.
  // next.wovain.com's `next` environment is its own stack's (infra/next).
  environments: { production: Variables; dev: Variables };
  // The branch production deploys from, e.g. `release/transcend`.
  releaseBranch: string;
  // GitHub user ids who may approve a production deploy.
  releaseReviewerIds: number[];
}

// The repository, its default branch's and release branch's rulesets, the
// Dependabot label and the repository secret: the `github` stack's.
export const repositorySettings = ({
  claudeCodeOauthToken,
  gitguardianApiKey,
  releasePleaseToken,
  releaseBranch,
}: SettingsArgs) => {
  // Adopted with `pulumi import` (infra/README.md), never deleted: protected
  // and retained, so removing it from the program or `pulumi up` can't
  // remove the repository.
  const repository = new github.Repository(
    "wovain",
    {
      // `gh pr merge --squash --auto`: a pull request merges itself once the
      // main ruleset below is met (CodeRabbit's approval and green checks),
      // and its branch is deleted.
      allowAutoMerge: true,
      deleteBranchOnMerge: true,
      // What GitHub shows today (set for the hackathon judges, who use
      // next.wovain.com); the first `up` keeps it rather than reverting it.
      description:
        "Qloo-powered agentic print-on-demand: Qloo's taste graph picks who a drop is for and what they love; Nemotron on Nebius designs and judges; Tavily checks the evidence; you approve Fourthwall products and a paused Meta campaign.",
      hasIssues: true,
      hasProjects: false,
      hasWiki: false,
      homepageUrl: "https://next.wovain.com",
      name: REPOSITORY,
      topics: [
        "devpost",
        "fal-ai",
        "firebase",
        "fourthwall",
        "mcp",
        "mcp-apps",
        "meta-ads",
        "print-on-demand",
        "typescript",
      ],
      visibility: "public",
      // Dependabot alerts; security updates below need them on.
      vulnerabilityAlerts: true,
    },
    { protect: true, retainOnDelete: true }
  );
  new github.RepositoryDependabotSecurityUpdates(
    "wovain",
    { enabled: true, repository: repository.name },
    { dependsOn: [repository] }
  );

  // CodeRabbit reviews this repository through its GitHub App, installed by
  // hand with "Only select repositories" (infra/README.md): GitHub has no API
  // to install an app, and a fine-grained token can't read an
  // installation's repositories, so its access isn't declared here.

  // The default branch: no deletion, no force-push, and every change through
  // a pull request whose CI passed: the tests (`verify`), `infra`, CodeQL,
  // the dependency review and the full OSV scan (.github/workflows), with one
  // approval that a new push dismisses. The maintainer works alone, so the
  // approval comes from CodeRabbit (.coderabbit.yaml: it requests changes on
  // blocking findings and approves once they are resolved) or from Claude
  // (.github/workflows/claude-review.yml), whichever answers first. No one may
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

  // Claude's review (.github/workflows/claude-review.yml) is the job token's
  // approval, github-actions[bot], which counts toward the ruleset's one
  // approval only while Actions may approve pull requests. Workflows still
  // get a read-only token by default; each job asks for what it needs.
  new github.WorkflowRepositoryPermissions("wovain", {
    canApprovePullRequestReviews: true,
    defaultWorkflowPermissions: "read",
    repository: repository.name,
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

  // The label .github/dependabot.yml puts on every update pull request;
  // Dependabot doesn't create it, and a missing label is an error there.
  new github.IssueLabel("dependencies", {
    color: "0366d6",
    description: "Pull requests that update a dependency",
    name: "dependencies",
    repository: repository.name,
  });

  // The PR shepherd's labels (.github/workflows/shepherd*.yml): `needs-human`
  // when it stops, `shepherd` on a pull request it worked on, `autofix` on
  // one that Claude's cloud Auto-fix watches instead (the shepherd leaves it
  // alone, so the two never push to one pull request), and `claude`, which
  // hands an issue or pull request to Claude.
  for (const [name, color, description] of [
    ["needs-human", "d93f0b", "The shepherd stopped: a person decides"],
    ["shepherd", "5319e7", "The shepherd worked on this pull request"],
    ["autofix", "0e8a16", "Claude's cloud Auto-fix watches this pull request"],
    ["claude", "d4a373", "Hand this to Claude"],
  ] as const) {
    new github.IssueLabel(name, {
      color,
      description,
      name,
      repository: repository.name,
    });
  }

  // The one repository secret: GitGuardian's token. It is a stack secret, so
  // Pulumi keeps it encrypted in state; only gitguardian-ignore reads it.
  if (gitguardianApiKey !== undefined) {
    new github.ActionsSecret("GITGUARDIAN_API_KEY", {
      plaintextValue: gitguardianApiKey,
      repository: repository.name,
      secretName: "GITGUARDIAN_API_KEY",
    });
  }
  // A pull request or tag made with the default token starts no workflow, so
  // the release pull request would never get its `verify` check.
  if (releasePleaseToken !== undefined) {
    new github.ActionsSecret("RELEASE_PLEASE_TOKEN", {
      plaintextValue: releasePleaseToken,
      repository: repository.name,
      secretName: "RELEASE_PLEASE_TOKEN",
    });
  }
  if (claudeCodeOauthToken !== undefined) {
    new github.ActionsSecret("CLAUDE_CODE_OAUTH_TOKEN", {
      plaintextValue: claudeCodeOauthToken,
      repository: repository.name,
      secretName: "CLAUDE_CODE_OAUTH_TOKEN",
    });
  }
  return repository;
};

// The deploy environments and Actions variables: production's stack's,
// since they name its Google resources.
export const deployEnvironments = ({
  environments,
  releaseBranch,
  releaseReviewerIds,
  variables,
}: EnvironmentArgs) => {
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
      repository: REPOSITORY,
      reviewers: [{ users: releaseReviewerIds }],
    },
    { retainOnDelete: true }
  );
  new github.RepositoryEnvironmentDeploymentPolicy("production-release", {
    branchPattern: releaseBranch,
    environment: production.environment,
    repository: REPOSITORY,
  });

  // dev.wovain.com's environment: only main may use it, with no approval.
  // `infrastructure`, where production's `pulumi up` runs, is the `github`
  // stack's (infra/github), so its approval gate exists before production's
  // stack is ever applied.
  const dev = mainOnlyEnvironment("dev", REPOSITORY);
  // What the workflows read as `vars.<NAME>`; none is a secret.
  for (const [variableName, value] of Object.entries(variables)) {
    new github.ActionsVariable(variableName, {
      repository: REPOSITORY,
      value,
      variableName,
    });
  }
  environmentVariables("production", production, environments.production);
  environmentVariables("dev", dev, environments.dev);
};
