import * as gcp from "@pulumi/gcp";

// Background work for the optimizer (docs/changes/25-optimizer/spec.md,
// section 6): the `optimizer` Cloud Tasks queue, and the tasks-invoker
// account whose OIDC token every task carries to /tasks/*. The server (the
// App Hosting runner) enqueues tasks and acts as tasks-invoker to sign them.
// The scheduler jobs that poll merchants come with the poll (plan MR 4).
export const optimizerTasks = ({
  region,
  runner,
}: {
  region: string;
  runner: gcp.serviceaccount.Account;
}) => {
  const apis = ["cloudtasks", "cloudscheduler"].map(
    (api) =>
      new gcp.projects.Service(api, {
        disableOnDestroy: false,
        service: `${api}.googleapis.com`,
      })
  );

  // 3 attempts 30 s apart at least; 2 at a time, as App Hosting runs at
  // most 2 instances (apphosting.yaml).
  const queue = new gcp.cloudtasks.Queue(
    "optimizer",
    {
      location: region,
      name: "optimizer",
      rateLimits: { maxConcurrentDispatches: 2, maxDispatchesPerSecond: 5 },
      retryConfig: { maxAttempts: 3, minBackoff: "30s" },
    },
    { dependsOn: apis }
  );

  const invoker = new gcp.serviceaccount.Account("tasks-invoker", {
    accountId: "tasks-invoker",
    displayName: "wovain Cloud Tasks and Scheduler caller",
  });

  new gcp.cloudtasks.QueueIamMember("runner-enqueues-optimizer", {
    location: region,
    member: runner.member,
    name: queue.name,
    role: "roles/cloudtasks.enqueuer",
  });
  // Creating a task with an OIDC token for tasks-invoker needs actAs on it.
  new gcp.serviceaccount.IAMMember("runner-acts-as-tasks-invoker", {
    member: runner.member,
    role: "roles/iam.serviceAccountUser",
    serviceAccountId: invoker.name,
  });

  return { invoker, queue };
};
