import { z } from "zod";

// GitLab's REST API with the token CI passes in GITLAB_TOKEN (a personal
// access token, so the actions below are a human's: GitLab only starts Duo
// flows for human actions, ee/app/services/ai/flow_triggers/run_service.rb).
// Errors carry the status and path only, never the response body.

const issueSchema = z.object({
  assignees: z.array(z.object({ username: z.string() })).default([]),
  closed_at: z.string().nullable().optional(),
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
  description: z.string().nullable().default(null),
  draft: z.boolean(),
  has_conflicts: z.boolean(),
  head_pipeline: z.object({ status: z.string() }).nullable().optional(),
  iid: z.int(),
  merge_when_pipeline_succeeds: z.boolean(),
  merged_at: z.string().nullable().optional(),
  reviewers: z.array(z.object({ username: z.string() })).default([]),
  sha: z.string(),
  state: z.string(),
  title: z.string(),
  updated_at: z.string(),
  web_url: z.url(),
});
export type MergeRequest = z.infer<typeof mergeRequestSchema>;

const noteSchema = z.object({
  author: z.object({ username: z.string() }),
  body: z.string(),
  created_at: z.string(),
  resolvable: z.boolean().default(false),
  resolved: z.boolean().default(false),
  system: z.boolean(),
});

const userSchema = z.object({ id: z.int(), username: z.string() });

type Method = "GET" | "POST" | "PUT";
type Query = Record<string, string | number | boolean>;

export const createGitLab = (env: {
  api: string;
  project: string;
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

  return {
    closesIssues: async (mr: number) =>
      await inProject(
        z.array(issueSchema),
        "GET",
        `merge_requests/${mr}/closes_issues`
      ),
    // Newest first.
    commits: async (mr: number) =>
      await inProject(
        z.array(z.object({ committed_date: z.string(), id: z.string() })),
        "GET",
        `merge_requests/${mr}/commits`
      ),
    createIssue: async (fields: Query) =>
      await inProject(issueSchema, "POST", "issues", fields),
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
    issueNotes: async (issue: number) =>
      await inProject(z.array(noteSchema), "GET", `issues/${issue}/notes`, {
        per_page: 100,
        sort: "asc",
      }),
    issues: async (query: Query) =>
      await inProject(z.array(issueSchema), "GET", "issues", {
        per_page: 100,
        ...query,
      }),
    mergeRequestNotes: async (mr: number) =>
      await inProject(
        z.array(noteSchema),
        "GET",
        `merge_requests/${mr}/notes`,
        {
          per_page: 100,
          sort: "asc",
        }
      ),
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
    pipelines: async (query: Query) =>
      await inProject(
        z.array(
          z.object({
            created_at: z.string(),
            id: z.int(),
            source: z.string(),
            status: z.string(),
            web_url: z.url(),
          })
        ),
        "GET",
        "pipelines",
        { per_page: 20, ...query }
      ),
    relatedMergeRequests: async (issue: number) =>
      await inProject(
        z.array(mergeRequestSchema.partial().extend({ iid: z.int() })),
        "GET",
        `issues/${issue}/related_merge_requests`
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
  };
};
export type GitLab = ReturnType<typeof createGitLab>;
