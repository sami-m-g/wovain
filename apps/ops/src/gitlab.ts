import { z } from "zod";

// GitLab's REST and GraphQL APIs with the token CI passes in GITLAB_TOKEN (a
// personal access token, so the actions below are a human's: GitLab only
// starts Duo flows for human actions,
// ee/app/services/ai/flow_triggers/run_service.rb). Errors carry the status
// and path only, never the response body.

const issueSchema = z.object({
  assignees: z.array(z.object({ username: z.string() })).default([]),
  author: z.object({ username: z.string() }),
  closed_at: z.string().nullable().optional(),
  created_at: z.string().optional(),
  description: z.string().nullable(),
  iid: z.int(),
  labels: z.array(z.string()),
  state: z.enum(["opened", "closed"]),
  title: z.string(),
  updated_at: z.string(),
  web_url: z.url(),
});
export type Issue = z.infer<typeof issueSchema>;

const mergeRequestSchema = z.object({
  author: z.object({ username: z.string() }),
  created_at: z.string(),
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
  state: z.string(),
  title: z.string(),
  updated_at: z.string(),
  web_url: z.url(),
});
export type MergeRequest = z.infer<typeof mergeRequestSchema>;

const noteSchema = z.object({
  // id is what trust checks compare; a note without one is never trusted.
  author: z.object({ id: z.int().optional(), username: z.string() }),
  body: z.string(),
  created_at: z.string(),
  // Diff notes name the commit they were written on.
  position: z.object({ head_sha: z.string() }).nullable().optional(),
  resolvable: z.boolean().default(false),
  resolved: z.boolean().default(false),
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

// Who added or removed which label, oldest first (resource_label_events).
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

const jobSchema = z.object({ duration: z.number().nullable() });
const pipelineSchema = z.object({
  id: z.int(),
  status: z.string(),
  web_url: z.url().optional(),
});

const userSchema = z.object({ id: z.int(), username: z.string() });
const reviewerSchema = z.object({
  state: z.string(),
  user: z.object({ username: z.string() }),
});

// Duo sessions (GraphQL duoWorkflowWorkflows, the query the Agent sessions
// page uses: ee/app/assets/javascripts/ai/duo_agents_platform).
const sessionsSchema = z.object({
  data: z.object({
    project: z.object({
      duoWorkflowWorkflows: z.object({
        nodes: z.array(
          z.object({
            createdAt: z.string(),
            mergeRequestLinks: z
              .object({
                nodes: z.array(
                  z.object({
                    mergeRequest: z
                      .object({ iid: z.coerce.number() })
                      .nullable(),
                  })
                ),
              })
              .nullable(),
            sourceType: z.string().nullable(),
            status: z.string().nullable().optional(),
            user: z.object({ username: z.string() }).nullable(),
            workItem: z.object({ iid: z.coerce.number() }).nullable(),
            workflowDefinition: z.string().nullable(),
          })
        ),
      }),
    }),
  }),
});
const SESSIONS = `query($path: ID!) { project(fullPath: $path) { duoWorkflowWorkflows(projectPath: $path, first: 50) { nodes { createdAt status sourceType workflowDefinition user { username } workItem { iid } mergeRequestLinks(first: 20) { nodes { mergeRequest { iid } } } } } } }`;

type Method = "GET" | "POST" | "PUT";
const MAX_PAGES = 20;
type Query = Record<string, string | number | boolean | number[]>;

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
    // Reads put the fields in the query string, writes in a JSON body.
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
  // Every page of a list, following GitLab's x-next-page header (at most
  // MAX_PAGES pages; more fails the run instead of undercounting).
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
  // Newest first, one page: the loop only needs recent notes.
  const notes = async (path: string) =>
    await inProject(z.array(noteSchema), "GET", path, {
      per_page: 100,
      sort: "desc",
    });

  return {
    // Every page, newest first; more than MAX_PAGES fails instead of guessing.
    allIssueNotes: async (issue: number) =>
      await allPages(noteSchema, `issues/${issue}/notes?sort=desc`),
    closesIssues: async (mr: number) =>
      await inProject(
        z.array(issueSchema),
        "GET",
        `merge_requests/${mr}/closes_issues`
      ),
    createIssue: async (fields: Query) =>
      await inProject(issueSchema, "POST", "issues", fields),
    // Duo credits the token's owner used this month in a namespace (GraphQL
    // currentUser.creditsUsage); flows bill the person who triggered them.
    creditsUsed: async (namespacePath: string) => {
      const body = await graphql(
        "query($ns: ID!) { currentUser { creditsUsage(namespacePath: $ns) { creditsUsed } } }",
        { ns: namespacePath }
      );
      return z
        .object({
          data: z.object({
            currentUser: z.object({
              creditsUsage: z.object({ creditsUsed: z.number() }),
            }),
          }),
        })
        .parse(body).data.currentUser.creditsUsage.creditsUsed;
    },
    currentUser: async () => await call(userSchema, "GET", "user"),
    diffs: async (mr: number) =>
      await inProject(
        z.array(
          z.object({
            diff: z.string(),
            new_path: z.string(),
            old_path: z.string(),
          })
        ),
        "GET",
        `merge_requests/${mr}/diffs`,
        { per_page: 100 }
      ),
    discussions: async (mr: number) =>
      await allPages(discussionSchema, `merge_requests/${mr}/discussions`),
    // Any project call, e.g. the latest main artifact of a job.
    inProject,
    issue: async (iid: number) =>
      await inProject(issueSchema, "GET", `issues/${iid}`),
    issueNotes: async (issue: number) => await notes(`issues/${issue}/notes`),
    issues: async (query: Query) =>
      await inProject(z.array(issueSchema), "GET", "issues", {
        per_page: 100,
        ...query,
      }),
    labelEvents: async (issue: number) =>
      await allPages(labelEventSchema, `issues/${issue}/resource_label_events`),
    mergeRequest: async (mr: number) =>
      await inProject(mergeRequestSchema, "GET", `merge_requests/${mr}`),
    mergeRequestNotes: async (mr: number) =>
      await notes(`merge_requests/${mr}/notes`),
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
    // A pipeline's jobs; duration is null until a job has run.
    pipelineJobs: async (pipeline: number) =>
      await allPages(jobSchema, `pipelines/${pipeline}/jobs`),
    pipelines: async (query: Query) =>
      await inProject(z.array(pipelineSchema), "GET", "pipelines", {
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
    // Each reviewer's state: unreviewed, reviewed, requested_changes, approved.
    reviewers: async (mr: number) =>
      await inProject(
        z.array(reviewerSchema),
        "GET",
        `merge_requests/${mr}/reviewers`
      ),
    sessions: async () => {
      const body = sessionsSchema.parse(
        await graphql(SESSIONS, { path: env.projectPath })
      );
      return body.data.project.duoWorkflowWorkflows.nodes.map((s) => ({
        createdAt: s.createdAt,
        definition: s.workflowDefinition ?? "",
        issue: s.workItem?.iid,
        mergeRequests: (s.mergeRequestLinks?.nodes ?? []).flatMap((n) =>
          n.mergeRequest === null ? [] : [n.mergeRequest.iid]
        ),
        sourceType: s.sourceType ?? "",
        status: s.status ?? "",
        user: s.user?.username ?? "",
      }));
    },
    // GitLab merges once the pipeline passes (merge-when-pipeline-succeeds),
    // and right away if it already has. sha pins the reviewed commit.
    setAutoMerge: async (mr: number, sha: string) =>
      await inProject(z.unknown(), "PUT", `merge_requests/${mr}/merge`, {
        auto_merge: true,
        sha,
        should_remove_source_branch: true,
      }),
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
    // The MR's diff versions, newest first: which commit was head when.
    versions: async (mr: number) =>
      await inProject(
        z.array(
          z.object({ created_at: z.string(), head_commit_sha: z.string() })
        ),
        "GET",
        `merge_requests/${mr}/versions`
      ),
  };
};
export type GitLab = ReturnType<typeof createGitLab>;
