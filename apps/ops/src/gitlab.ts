import { z } from "zod";

// GitLab's REST and GraphQL APIs with GITLAB_TOKEN, a person's access token.
// GitLab starts a Duo flow only for a human's action (docs: Duo Agent
// Platform triggers, "Restrictions"), so the ops job's assignments and
// reviewer requests are what start the Developer, heal and Code Review
// flows. Errors carry the status and path only, never the response body.

const issueSchema = z.object({
  assignees: z.array(z.object({ username: z.string() })).default([]),
  author: z.object({ username: z.string() }),
  closed_at: z.string().nullable().optional(),
  created_at: z.string(),
  description: z.string().nullable(),
  id: z.int(),
  iid: z.int(),
  issue_type: z.string().default("issue"),
  labels: z.array(z.string()),
  state: z.enum(["opened", "closed"]),
  title: z.string(),
  web_url: z.url(),
});
export type Issue = z.infer<typeof issueSchema>;

const mergeRequestSchema = z.object({
  author: z.object({ username: z.string() }),
  description: z.string().nullable().default(null),
  draft: z.boolean(),
  has_conflicts: z.boolean(),
  // Only the single-MR endpoint returns it.
  head_pipeline: z
    .object({ sha: z.string(), status: z.string() })
    .nullable()
    .optional(),
  iid: z.int(),
  merge_when_pipeline_succeeds: z.boolean(),
  merged_at: z.string().nullable().optional(),
  reviewers: z
    .array(z.object({ id: z.int(), username: z.string() }))
    .default([]),
  sha: z.string(),
  source_branch: z.string(),
  state: z.string().default("opened"),
  title: z.string(),
  updated_at: z.string(),
  web_url: z.url(),
});
export type MergeRequest = z.infer<typeof mergeRequestSchema>;

const noteSchema = z.object({
  author: z.object({ username: z.string() }),
  body: z.string(),
  created_at: z.string(),
  // Diff notes name the commit they were written on.
  position: z.object({ head_sha: z.string() }).nullable().optional(),
  system: z.boolean(),
});
export type Note = z.infer<typeof noteSchema>;

const discussionSchema = z.object({
  notes: z.array(
    z.object({
      author: z.object({ username: z.string() }),
      resolvable: z.boolean().default(false),
      resolved: z.boolean().default(false),
      system: z.boolean().default(false),
    })
  ),
});
export type Discussion = z.infer<typeof discussionSchema>;

const labelEventSchema = z
  .object({
    action: z.string(),
    created_at: z.string(),
    // null when the label has since been deleted.
    label: z.object({ name: z.string() }).nullable(),
    user: z.object({ username: z.string() }),
  })
  .transform((e) => ({
    action: e.action,
    createdAt: e.created_at,
    label: e.label?.name,
    user: e.user.username,
  }));
export type LabelEvent = z.infer<typeof labelEventSchema>;

const userSchema = z.object({ id: z.int(), username: z.string() });

// Duo sessions (GraphQL duoWorkflowWorkflows, the query the Agent sessions
// page uses).
const sessionsSchema = z.object({
  data: z.object({
    project: z.object({
      duoWorkflowWorkflows: z.object({
        nodes: z.array(
          z.object({
            createdAt: z.string(),
            workflowDefinition: z.string().nullable(),
          })
        ),
      }),
    }),
  }),
});
const SESSIONS =
  "query($path: ID!) { project(fullPath: $path) { duoWorkflowWorkflows(projectPath: $path, first: 100) { nodes { createdAt workflowDefinition } } } }";

const mutationSchema = z.object({
  data: z
    .object({
      m: z.object({ errors: z.array(z.string()).default([]) }).nullable(),
    })
    .nullable()
    .optional(),
  errors: z.array(z.object({ message: z.string() })).optional(),
});

const vulnerabilitiesSchema = z.object({
  data: z.object({
    project: z.object({
      vulnerabilities: z.object({
        nodes: z.array(
          z.object({
            detectedAt: z.string(),
            id: z.string(),
            identifiers: z
              .array(
                z.object({ externalId: z.string(), externalType: z.string() })
              )
              .default([]),
            location: z
              .object({
                file: z.string().nullable().optional(),
                startLine: z.coerce.string().nullable().optional(),
              })
              .nullable()
              .optional(),
            mergeRequest: z.object({ iid: z.coerce.number() }).nullable(),
            resolvedOnDefaultBranch: z.boolean().default(false),
            severity: z.string(),
            title: z.string(),
            webUrl: z.string(),
          })
        ),
      }),
    }),
  }),
});
const VULNERABILITIES =
  "query($path: ID!) { project(fullPath: $path) { vulnerabilities(severity: [CRITICAL, HIGH], state: [DETECTED, CONFIRMED], reportType: [SAST], sort: detected_desc, first: 50) { nodes { id title severity detectedAt webUrl resolvedOnDefaultBranch mergeRequest { iid } identifiers { externalType externalId } location { ... on VulnerabilityLocationSast { file startLine } } } } } }";
// Scanner-defined identifiers worth naming in a task: never free text.
const NAMED_IDENTIFIERS = new Set(["cwe", "semgrep_id"]);

type Method = "GET" | "POST" | "PUT";
type Query = Record<string, string | number | boolean | number[]>;
const MAX_PAGES = 20;

export const createGitLab = (env: {
  api: string;
  project: string;
  projectPath: string;
  token: string;
}) => {
  const project = `projects/${encodeURIComponent(env.project)}`;
  const call = async <T>(
    schema: z.ZodType<T>,
    method: Method,
    path: string,
    query: Query = {}
  ): Promise<T> => {
    const url = new URL(`${env.api}/${path}`);
    const read = method === "GET";
    if (read) {
      for (const [key, value] of Object.entries(query)) {
        url.searchParams.set(key, String(value));
      }
    }
    const response = await fetch(url, {
      headers: {
        "PRIVATE-TOKEN": env.token,
        "content-type": "application/json",
      },
      method,
      ...(read ? {} : { body: JSON.stringify(query) }),
    });
    if (!response.ok) {
      throw new Error(`GitLab ${method} ${path}: ${response.status}`);
    }
    return schema.parse(await response.json());
  };
  const inProject = async <T>(
    schema: z.ZodType<T>,
    method: Method,
    path: string,
    query?: Query
  ) => await call(schema, method, `${project}/${path}`, query);

  const graphql = async (
    query: string,
    variables: Record<string, string>
  ): Promise<unknown> => {
    const response = await fetch(env.api.replace(/\/v4$/u, "/graphql"), {
      body: JSON.stringify({ query, variables }),
      headers: {
        authorization: `Bearer ${env.token}`,
        "content-type": "application/json",
      },
      method: "POST",
    });
    if (!response.ok) {
      throw new Error(`GitLab GraphQL: ${response.status}`);
    }
    return await response.json();
  };
  // A mutation aliased as m: top-level and mutation errors both throw.
  const mutate = async (query: string, variables: Record<string, string>) => {
    const body = mutationSchema.parse(await graphql(query, variables));
    const errors = [
      ...(body.errors ?? []).map((e) => e.message),
      ...(body.data?.m?.errors ?? []),
    ];
    if (errors.length > 0) {
      throw new Error(`GitLab GraphQL: ${errors.join("; ")}`);
    }
  };

  // Every page of a list, following GitLab's x-next-page header.
  const allPages = async <T>(schema: z.ZodType<T>, path: string) => {
    const items: T[] = [];
    let page = "1";
    for (let n = 0; n < MAX_PAGES; n += 1) {
      const url = new URL(`${env.api}/${project}/${path}`);
      url.searchParams.set("per_page", "100");
      url.searchParams.set("page", page);
      // oxlint-disable-next-line eslint/no-await-in-loop -- each page needs the previous page's header
      const response = await fetch(url, {
        headers: { "PRIVATE-TOKEN": env.token },
      });
      if (!response.ok) {
        throw new Error(`GitLab GET ${path}: ${response.status}`);
      }
      // oxlint-disable-next-line eslint/no-await-in-loop -- same page
      items.push(...z.array(schema).parse(await response.json()));
      page = response.headers.get("x-next-page") ?? "";
      if (page === "") {
        return items;
      }
    }
    throw new Error(`GitLab GET ${path}: more than ${MAX_PAGES} pages`);
  };

  return {
    closesIssues: async (mr: number) =>
      await inProject(
        z.array(issueSchema),
        "GET",
        `merge_requests/${mr}/closes_issues`
      ),
    createIssue: async (fields: Query) =>
      await inProject(issueSchema, "POST", "issues", fields),
    currentUser: async () => await call(userSchema, "GET", "user"),
    // Successful production deployments since a date. The Deployments API
    // filters by date only with the matching sort: finished_after needs
    // order_by=finished_at and status=success (updated_after would need
    // order_by=updated_at, and answers 400 otherwise).
    deployments: async (since: Date) =>
      await inProject(
        z.array(z.object({ created_at: z.string() })),
        "GET",
        "deployments",
        {
          environment: "production",
          finished_after: since.toISOString(),
          order_by: "finished_at",
          per_page: 100,
          sort: "desc",
          status: "success",
        }
      ),
    diffs: async (mr: number) =>
      await allPages(
        z.object({
          diff: z.string(),
          new_path: z.string(),
          old_path: z.string(),
        }),
        `merge_requests/${mr}/diffs`
      ),
    discussions: async (mr: number) =>
      await allPages(discussionSchema, `merge_requests/${mr}/discussions`),
    // Median lead time for changes in seconds (GitLab's DORA API, Ultimate);
    // null when the tier or the data doesn't have it.
    doraLeadTime: async (since: Date) => {
      try {
        const points = await inProject(
          z.array(z.object({ value: z.number().nullable() })),
          "GET",
          "dora/metrics",
          {
            interval: "all",
            metric: "lead_time_for_changes",
            start_date: since.toISOString().slice(0, 10),
          }
        );
        return points[0]?.value ?? null;
      } catch {
        return null;
      }
    },
    inProject,
    issueLinks: async (issue: number) =>
      await inProject(z.array(issueSchema), "GET", `issues/${issue}/links`),
    issueNotes: async (issue: number) =>
      await allPages(noteSchema, `issues/${issue}/notes?sort=desc`),
    issues: async (query: Query) =>
      await inProject(z.array(issueSchema), "GET", "issues", {
        per_page: 100,
        ...query,
      }),
    labelEvents: async (issue: number) =>
      await allPages(labelEventSchema, `issues/${issue}/resource_label_events`),
    linkIssues: async (issue: number, target: number) =>
      await inProject(z.unknown(), "POST", `issues/${issue}/links`, {
        target_issue_iid: target,
        target_project_id: env.project,
      }),
    mergeRequest: async (mr: number) =>
      await inProject(mergeRequestSchema, "GET", `merge_requests/${mr}`),
    mergeRequestNotes: async (mr: number) =>
      await allPages(noteSchema, `merge_requests/${mr}/notes?sort=desc`),
    mergeRequests: async (query: Query) =>
      await inProject(z.array(mergeRequestSchema), "GET", "merge_requests", {
        per_page: 100,
        ...query,
      }),
    noteOnIssue: async (issue: number, body: string) =>
      await inProject(z.unknown(), "POST", `issues/${issue}/notes`, { body }),
    noteOnMergeRequest: async (mr: number, body: string) =>
      await inProject(z.unknown(), "POST", `merge_requests/${mr}/notes`, {
        body,
      }),
    pipelineJobs: async (pipeline: number) =>
      await allPages(
        z.object({ duration: z.number().nullable() }),
        `pipelines/${pipeline}/jobs`
      ),
    pipelines: async (query: Query) =>
      await inProject(z.array(z.object({ id: z.int() })), "GET", "pipelines", {
        per_page: 100,
        ...query,
      }),
    relatedMergeRequests: async (issue: number) =>
      await inProject(
        z.array(
          z.object({
            iid: z.int(),
            merged_at: z.string().nullable().optional(),
          })
        ),
        "GET",
        `issues/${issue}/related_merge_requests`
      ),
    // Starts Duo Vulnerability Resolution, which opens a merge request.
    resolveVulnerability: async (id: string) =>
      await mutate(
        "mutation($id: AiModelID!) { m: aiAction(input: { resolveVulnerability: { resourceId: $id } }) { errors } }",
        { id }
      ),
    // Each reviewer's state: unreviewed, reviewed, requested_changes, approved.
    reviewers: async (mr: number) =>
      await inProject(
        z.array(
          z.object({
            state: z.string(),
            user: z.object({ username: z.string() }),
          })
        ),
        "GET",
        `merge_requests/${mr}/reviewers`
      ),
    // Duo sessions in the project, newest first: their flow and start time.
    sessions: async () => {
      const body = sessionsSchema.parse(
        await graphql(SESSIONS, { path: env.projectPath })
      );
      return body.data.project.duoWorkflowWorkflows.nodes.map((s) => ({
        createdAt: s.createdAt,
        definition: s.workflowDefinition ?? "",
      }));
    },
    // GitLab merges once the pipeline passes; sha pins the reviewed commit.
    setAutoMerge: async (mr: number, sha: string) =>
      await inProject(z.unknown(), "PUT", `merge_requests/${mr}/merge`, {
        auto_merge: true,
        sha,
        should_remove_source_branch: true,
      }),
    // An incident's severity (GraphQL issueSetSeverity).
    setSeverity: async (
      iid: number,
      severity: "CRITICAL" | "HIGH" | "MEDIUM"
    ) =>
      await mutate(
        "mutation($path: ID!, $iid: String!, $severity: IssuableSeverity!) { m: issueSetSeverity(input: { projectPath: $path, iid: $iid, severity: $severity }) { errors } }",
        { iid: String(iid), path: env.projectPath, severity }
      ),
    // An entry on an incident's timeline (GraphQL timelineEventCreate).
    timelineEvent: async (issueId: number, note: string, at: Date) =>
      await mutate(
        "mutation($id: IssueID!, $note: String!, $at: Time!) { m: timelineEventCreate(input: { incidentId: $id, note: $note, occurredAt: $at }) { errors } }",
        { at: at.toISOString(), id: `gid://gitlab/Issue/${issueId}`, note }
      ),
    updateIssue: async (issue: number, fields: Query) =>
      await inProject(issueSchema, "PUT", `issues/${issue}`, fields),
    updateMergeRequest: async (mr: number, fields: Query) =>
      await inProject(
        mergeRequestSchema,
        "PUT",
        `merge_requests/${mr}`,
        fields
      ),
    userId: async (username: string) => {
      const [user] = await call(z.array(userSchema), "GET", "users", {
        username,
      });
      if (user === undefined) {
        throw new Error(`GitLab user ${username} not found`);
      }
      return user.id;
    },
    versions: async (mr: number) =>
      await inProject(
        z.array(
          z.object({ created_at: z.string(), head_commit_sha: z.string() })
        ),
        "GET",
        `merge_requests/${mr}/versions`
      ),

    // High and Critical SAST findings still to triage, newest first. A
    // finding the latest default-branch scan no longer reports is fixed
    // already and only waits for a person to resolve it.
    vulnerabilities: async () => {
      const body = vulnerabilitiesSchema.parse(
        await graphql(VULNERABILITIES, { path: env.projectPath })
      );
      return body.data.project.vulnerabilities.nodes
        .filter((v) => !v.resolvedOnDefaultBranch)
        .map((v) => ({
          detectedAt: v.detectedAt,
          file: v.location?.file ?? undefined,
          id: v.id,
          identifiers: v.identifiers
            .filter((i) => NAMED_IDENTIFIERS.has(i.externalType))
            .map((i) => `${i.externalType}:${i.externalId}`),
          line: v.location?.startLine ?? undefined,
          mergeRequest: v.mergeRequest?.iid,
          severity: v.severity,
          title: v.title,
          webUrl: v.webUrl,
        }));
    },
  };
};
