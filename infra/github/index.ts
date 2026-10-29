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
  gitguardianApiKey: config.getSecret("gitguardian-api-key"),
  releaseBranch: config.require("releaseBranch"),
});
// Google trusts infra-github only from jobs in this environment, on main.
mainOnlyEnvironment("github-infrastructure", REPOSITORY);
