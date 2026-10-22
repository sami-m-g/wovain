import { z } from "zod";

import type { GitLab } from "./gitlab.ts";

// The CI and Duo-flow calls red-main.ts needs on top of gitlab.ts: a
// pipeline's job attempts, a job's log tail, a retry, the JUnit report, and
// starting a built-in Duo flow. Same token, same error shape (status and
// path, never the body).

// A job attempt, with GitLab's structured failure reason.
const jobAttemptSchema = z.object({
  allow_failure: z.boolean().default(false),
  failure_reason: z.string().nullable().optional(),
  id: z.int(),
  name: z.string(),
  status: z.string(),
});
export type JobAttempt = z.infer<typeof jobAttemptSchema>;

// The pipeline's JUnit test report: GitLab names each suite after its job.
const testReportSchema = z.object({
  test_suites: z.array(
    z.object({
      name: z.string(),
      test_cases: z
        .array(
          z.object({
            classname: z.string().nullable().optional(),
            file: z.string().nullable().optional(),
            name: z.string(),
            status: z.string(),
          })
        )
        .default([]),
    })
  ),
});
export type TestReport = z.infer<typeof testReportSchema>;

const configuredSchema = z.object({
  data: z.object({
    aiCatalogConfiguredItems: z.object({
      nodes: z.array(
        z.object({
          id: z.string(),
          item: z.object({ foundationalFlowReference: z.string().nullable() }),
        })
      ),
    }),
  }),
});
const CONFIGURED = `query($id: ProjectID!) { aiCatalogConfiguredItems(projectId: $id, includeInherited: true, includeFoundationalConsumers: true) { nodes { id item { foundationalFlowReference } } } }`;

export const createCiApi = (
  gitlab: Pick<GitLab, "inProject">,
  env: { api: string; project: string; token: string }
) => {
  // A call outside the project's JSON endpoints: the log (text), GraphQL
  // and the Duo workflows API. A body makes it a POST.
  const request = async (url: string, body?: unknown) => {
    const response = await fetch(url, {
      headers: {
        authorization: `Bearer ${env.token}`,
        "content-type": "application/json",
      },
      ...(body === undefined
        ? {}
        : { body: JSON.stringify(body), method: "POST" }),
    });
    if (!response.ok) {
      const method = body === undefined ? "GET" : "POST";
      throw new Error(
        `GitLab ${method} ${new URL(url).pathname}: ${response.status}`
      );
    }
    return response;
  };

  return {
    // Every attempt of every job in a pipeline, retried ones included (one
    // page of 100: a main pipeline has about 20 jobs).
    jobAttempts: async (pipeline: number) =>
      await gitlab.inProject(
        z.array(jobAttemptSchema),
        "GET",
        `pipelines/${pipeline}/jobs`,
        { include_retried: true, per_page: 100 }
      ),
    // The last bytes of a job's log. Callers only match it against fixed
    // patterns (gates.ts); it's never stored, posted or sent anywhere.
    jobLogTail: async (job: number, bytes = 65_536) => {
      const response = await request(
        `${env.api}/projects/${encodeURIComponent(env.project)}/jobs/${job}/trace`
      );
      const text = await response.text();
      return text.slice(-bytes);
    },
    // Runs a finished job again (the same commit and variables).
    retryJob: async (job: number) =>
      await gitlab.inProject(z.unknown(), "POST", `jobs/${job}/retry`),
    // Starts a built-in flow enabled in the project the way its UI button
    // does (POST /ai/duo_workflows/workflows, docs.gitlab.com
    // api/duo_agent_platform_flows): the flow's catalog consumer, a goal (for
    // Fix CI/CD, the pipeline's URL) and start_workflow. It runs as the
    // flow's service account for the token's owner, who is billed.
    startFlow: async (flow: string, goal: string, source: string) => {
      const items = await request(env.api.replace(/\/v4$/u, "/graphql"), {
        query: CONFIGURED,
        variables: { id: `gid://gitlab/Project/${env.project}` },
      });
      const configured = configuredSchema.parse(await items.json());
      const consumer = configured.data.aiCatalogConfiguredItems.nodes.find(
        (n) => n.item.foundationalFlowReference === flow
      );
      const consumerId = Number(consumer?.id.split("/").at(-1));
      if (!Number.isInteger(consumerId) || consumerId <= 0) {
        throw new Error(`Duo flow ${flow} isn't enabled in the project`);
      }
      const started = await request(`${env.api}/ai/duo_workflows/workflows`, {
        ai_catalog_item_consumer_id: consumerId,
        environment: "web",
        goal,
        project_id: Number(env.project),
        source,
        start_workflow: true,
      });
      return z.object({ id: z.int() }).parse(await started.json());
    },
    // The pipeline's JUnit report (the jobs' artifacts:reports:junit).
    testReport: async (pipeline: number) =>
      await gitlab.inProject(
        testReportSchema,
        "GET",
        `pipelines/${pipeline}/test_report`
      ),
  };
};
export type CiApi = ReturnType<typeof createCiApi>;
