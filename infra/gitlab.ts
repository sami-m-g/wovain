// wovain's GitLab project settings that the hackathon's Developer+ role can
// manage: CI/CD variables, environments and the Renovate schedule. Branch and
// environment protection, deploy keys, merge request settings and the other
// general settings need Maintainer, so they stay in the project UI (README).
// The provider authenticates with the `gitlab:token` stack secret.
import * as gitlab from "@pulumi/gitlab";
import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();
// The numeric id the provider's import ids use.
const projectId = config.require("gitlabProjectId");

// `import` adopts what was set by hand before; Pulumi then owns it.
const adopt = (id: string) => ({ import: `${projectId}:${id}` });

export type CiVariables = Record<
  string,
  {
    value: pulumi.Input<string>;
    // Only pipelines on protected refs (main) get it.
    protected: boolean;
    masked?: boolean;
  }
>;

// Every variable the pipeline reads (.gitlab-ci.yml lists them).
export const ciVariables = (variables: CiVariables) => {
  for (const [key, v] of Object.entries(variables)) {
    new gitlab.ProjectVariable(
      key,
      {
        key,
        masked: v.masked ?? false,
        project: projectId,
        protected: v.protected,
        value: v.value,
      },
      // Secret in state and diffs, including the value read on import.
      { ...adopt(`${key}:*`), additionalSecretOutputs: ["value"] }
    );
  }
};

// The deploy jobs' environments: Google trusts each CI account only from its
// own (infra/index.ts).
export const environments = (siteUrl: pulumi.Input<string>) => {
  new gitlab.ProjectEnvironment(
    "production",
    {
      externalUrl: siteUrl,
      name: "production",
      project: projectId,
      tier: "production",
    },
    adopt("41738026")
  );
  new gitlab.ProjectEnvironment(
    "infrastructure",
    { name: "infrastructure", project: projectId, tier: "other" },
    adopt("41825171")
  );
};

// The renovate job runs only on this schedule (.gitlab/ci/verify.yml matches
// its description).
new gitlab.PipelineSchedule(
  "renovate",
  {
    active: true,
    cron: "0 6 * * 1",
    cronTimezone: "UTC",
    description: "Renovate dependency updates",
    project: projectId,
    ref: "refs/heads/main",
  },
  adopt("4502115")
);
