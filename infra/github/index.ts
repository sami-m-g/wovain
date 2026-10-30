// The GitHub repository sami-m-g/wovain (../github.ts, repositorySettings):
// its merge settings (auto-merge, branch deleted on merge), the main and
// release rulesets, the Dependabot label and the GitGuardian secret, plus
// the `github-infrastructure` environment this stack's own CI job runs in
// (infra/bootstrap/github.ts).
//
// Production's stack held the repository before; it forgot it with
// `pulumi state delete` (policy/retired.ts, "moved") and this stack adopted
// it with `pulumi import`, along with the GitLab mirror's disabled ruleset
// and deploy key, which this program doesn't declare, so its first `up`
// deletes them (infra/README.md, "The github stack").
//
// Its one credential is its own `github:token` stack secret: a fine-grained
// token for sami-m-g/wovain with Administration, Secrets and Issues
// (infra/README.md).
import * as pulumi from "@pulumi/pulumi";

import {
  REPOSITORY,
  mainOnlyEnvironment,
  repositorySettings,
} from "../github.ts";

const config = new pulumi.Config();

repositorySettings({
  claudeCodeOauthToken: config.getSecret("claude-code-oauth-token"),
  gitguardianApiKey: config.getSecret("gitguardian-api-key"),
  releaseBranch: config.require("releaseBranch"),
  releasePleaseToken: config.getSecret("release-please-token"),
});
// Google trusts infra-github only from jobs in this environment, on main.
mainOnlyEnvironment("github-infrastructure", REPOSITORY);
// Production's `pulumi up` (.github/workflows/infra.yml, `up`): Google trusts
// gitlab-infra only from jobs in this environment (infra/bootstrap), and each
// run waits for the owner's approval. Declared here, not in production's
// stack: production's stack is frozen, and a job that names an environment
// GitHub doesn't have yet creates it with no protection at all.
mainOnlyEnvironment(
  "infrastructure",
  REPOSITORY,
  // sami-m-g (`gh api users/sami-m-g --jq .id`) by default.
  config.getObject<number[]>("infrastructureReviewerIds") ?? [106_979_416]
);
