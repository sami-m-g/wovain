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
    // A variable Pulumi creates; the others were made by hand and adopted.
    created?: boolean;
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
      {
        ...(v.created === true ? {} : adopt(`${key}:*`)),
        additionalSecretOutputs: ["value"],
      }
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
  // The self-healing loop's job (.gitlab/ci/loop.yml): it deploys nothing
  // (action: verify), and Google trusts gitlab-ops only from here.
  new gitlab.ProjectEnvironment("operations", {
    name: "operations",
    project: projectId,
    tier: "other",
  });
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

// The self-healing loop (.gitlab/ci/loop.yml), hourly. Its pipeline runs only
// the loop job, so the scanners are off for it: main's own pipelines scan
// every change already.
const loop = new gitlab.PipelineSchedule("loop", {
  active: true,
  cron: "17 * * * *",
  cronTimezone: "UTC",
  description: "wovain loop",
  project: projectId,
  ref: "refs/heads/main",
});
for (const key of [
  "SAST_DISABLED",
  "SECRET_DETECTION_DISABLED",
  "DEPENDENCY_SCANNING_DISABLED",
]) {
  new gitlab.PipelineScheduleVariable(`loop-${key.toLowerCase()}`, {
    key,
    pipelineScheduleId: loop.pipelineScheduleId,
    project: projectId,
    value: "true",
  });
}

// Issue labels: status drives the Workflow board, agent says who works it,
// scout and digest are the self-healing loop's (apps/ops), and verified marks
// a scout issue whose fix production confirmed.
// An id adopts a label made by hand before.
const labels: Record<
  string,
  { color: string; description: string; id?: number }
> = {
  "agent::claude": {
    color: "#d97757",
    description: "Worked by Claude Code (the /issue skill)",
    id: 54_839_408,
  },
  "agent::duo": {
    color: "#fc6d26",
    description: "Work done or driven by a GitLab Duo agent or flow",
    id: 54_770_224,
  },
  digest: { color: "#6c757d", description: "The scout's daily digest issue" },
  "priority::1": { color: "#c0392b", description: "Do now", id: 54_770_190 },
  "priority::2": { color: "#e67e22", description: "Do soon", id: 54_770_191 },
  "priority::3": {
    color: "#f1c40f",
    description: "When there's time",
    id: 54_770_193,
  },
  scout: {
    color: "#fd7e14",
    description: "A production problem the scout flow found",
  },
  "stage::configure": {
    color: "#20c997",
    description: "DevSecOps stage: configure",
    id: 54_770_221,
  },
  "stage::create": {
    color: "#5b4bc4",
    description: "DevSecOps stage: create",
    id: 54_770_198,
  },
  "stage::govern": {
    color: "#343a40",
    description: "DevSecOps stage: govern",
    id: 54_770_223,
  },
  "stage::monitor": {
    color: "#fd7e14",
    description: "DevSecOps stage: monitor",
    id: 54_770_222,
  },
  "stage::package": {
    color: "#17a2b8",
    description: "DevSecOps stage: package",
    id: 54_770_213,
  },
  "stage::plan": {
    color: "#6f42c1",
    description: "DevSecOps stage: plan",
    id: 54_770_195,
  },
  "stage::release": {
    color: "#28a745",
    description: "DevSecOps stage: release",
    id: 54_770_220,
  },
  "stage::secure": {
    color: "#c0392b",
    description: "DevSecOps stage: secure",
    id: 54_770_217,
  },
  "stage::verify": {
    color: "#2c7be5",
    description: "DevSecOps stage: verify",
    id: 54_770_210,
  },
  "status::doing": {
    color: "#F0AD4E",
    description: "An agent or person is on it",
    id: 54_799_201,
  },
  "status::intent": {
    color: "#7f8c8d",
    description: "Proposed, waiting for a human to accept the intent",
  },
  "status::plan": {
    color: "#e84393",
    description: "plan.md is being written, before any code",
    id: 54_840_662,
  },
  "status::review": {
    color: "#8E44AD",
    description: "MR open, waiting for review",
    id: 54_799_202,
  },
  "status::spec": {
    color: "#00b8d9",
    description: "spec.md is being written from the accepted intent",
    id: 54_840_634,
  },
  "status::test": {
    color: "#16a085",
    description: "In the review app, waiting for a human to try it",
  },
  "status::todo": {
    color: "#428BCA",
    description: "Ready to pick up",
    id: 54_799_200,
  },
  "type::bug": {
    color: "#d9534f",
    description: "Something isn't working",
    id: 54_770_186,
  },
  "type::chore": {
    color: "#8e8e8e",
    description: "Maintenance, tooling or refactors",
    id: 54_770_188,
  },
  "type::feature": {
    color: "#428bca",
    description: "New capability or improvement",
    id: 54_770_187,
  },
  verified: {
    color: "#2da160",
    description: "The scout confirmed the fix in production",
  },
};

const labelIds = new Map(
  Object.entries(labels).map(([name, { color, description, id }]) => [
    name,
    new gitlab.ProjectLabel(
      name.replace("::", "-"),
      { color, description, name, project: projectId },
      id === undefined ? {} : adopt(String(id))
    ).labelId,
  ])
);

// The board you watch: intent (proposed) → todo (accepted) → spec → plan →
// doing → review (MR open) → test (your turn in the review app). Closed issues land in the board's built-in Closed list.
new gitlab.ProjectIssueBoard(
  "workflow",
  {
    lists: [
      "status::intent",
      "status::todo",
      "status::spec",
      "status::plan",
      "status::doing",
      "status::review",
      "status::test",
    ].map((name) => ({ labelId: labelIds.get(name) })),
    name: "Workflow",
    project: projectId,
  },
  adopt("11705998")
);
