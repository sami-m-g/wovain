import { GitbeakerRequestError, Gitlab } from "@gitbeaker/rest";
import type {
  AllIssuesOptions,
  AllMergeRequestsOptions,
  AllPipelinesOptions,
  CreateIssueOptions,
  EditIssueOptions,
  EditMergeRequestOptions,
} from "@gitbeaker/rest";
import { z } from "zod";

// GitLab's REST API (through gitbeaker) and GraphQL with GITLAB_TOKEN, a person's access token.
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
  id: z.int(),
  // Diff notes name the commit they were written on.
  position: z.object({ head_sha: z.string() }).nullable().optional(),
  system: z.boolean(),
});
export type Note = z.infer<typeof noteSchema>;

const featureFlagSchema = z.object({
  active: z.boolean(),
  name: z.string(),
  strategies: z
    .array(
      z.object({
        name: z.string(),
        parameters: z.record(z.string(), z.string()).nullish(),
        scopes: z
          .array(z.object({ environment_scope: z.string() }))
          .default([]),
      })
    )
    .default([]),
  updated_at: z.string(),
});

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
// Open findings the latest default-branch scan no longer reports, the same
// scope as the vulnerability management policy (security-policies/policy.yml).
const NO_LONGER_DETECTED =
  "query($path: ID!) { project(fullPath: $path) { vulnerabilities(state: [DETECTED, CONFIRMED], reportType: [SAST, DEPENDENCY_SCANNING], hasResolution: true, first: 100) { nodes { id severity webUrl resolvedOnDefaultBranch } } } }";
const noLongerDetectedSchema = z.object({
  data: z.object({
    project: z.object({
      vulnerabilities: z.object({
        nodes: z.array(
          z.object({
            id: z.string(),
            resolvedOnDefaultBranch: z.boolean(),
            severity: z.string(),
            webUrl: z.string(),
          })
        ),
      }),
    }),
  }),
});

const MAX_PAGES = 20;
const PER_PAGE = 100;
// A list of up to PER_PAGE items: one page, as the API's default.
const firstPage = { maxPages: 1, perPage: PER_PAGE } as const;
// Every page up to MAX_PAGES: with showExpanded, the last page's next header
// says whether the cap cut the list short.
const allPages = {
  maxPages: MAX_PAGES,
  perPage: PER_PAGE,
  showExpanded: true,
} as const;

interface Paged {
  data: unknown[];
  paginationInfo: { next?: number | null };
}

// Errors carry the request's method, path and the response status only:
// gitbeaker's own message is GitLab's response body, which can echo fields
// of private issues.
const failure = (error: GitbeakerRequestError) => {
  const { request, response } = error.cause ?? {};
  const path = request
    ? new URL(request.url).pathname.replace(/^.*\/api\/v4\//u, "")
    : "";
  return new Error(
    `GitLab ${request?.method ?? "request"} ${path}: ${response?.status ?? "failed"}`
  );
};
const guard = async <T>(request: Promise<T>): Promise<T> => {
  try {
    return await request;
  } catch (error) {
    throw error instanceof GitbeakerRequestError ? failure(error) : error;
  }
};

// Every page of a list, at most MAX_PAGES of them.
const collect = async <T>(
  schema: z.ZodType<T>,
  what: string,
  request: Promise<Paged>
) => {
  const { data, paginationInfo } = await guard(request);
  if (paginationInfo.next) {
    throw new Error(`GitLab GET ${what}: more than ${MAX_PAGES} pages`);
  }
  return z.array(schema).parse(data);
};

export const createGitLab = (env: {
  api: string;
  project: string;
  projectPath: string;
  token: string;
}) => {
  const { project } = env;
  const api = new Gitlab({
    host: env.api.replace(/\/api\/v4\/?$/u, ""),
    token: env.token,
  });

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

  return {
    closesIssues: async (mr: number) =>
      z
        .array(issueSchema)
        .parse(await guard(api.MergeRequests.allIssuesClosed(project, mr))),
    createIssue: async ({
      title,
      ...options
    }: CreateIssueOptions & { title: string }) =>
      issueSchema.parse(
        await guard(api.Issues.create(project, title, options))
      ),
    currentUser: async () =>
      userSchema.parse(await guard(api.Users.showCurrentUser())),
    // Successful production deployments since a date. The Deployments API
    // filters by date only with the matching sort: finished_after needs
    // order_by=finished_at and status=success (updated_after would need
    // order_by=updated_at, and answers 400 otherwise).
    // The typed Deployments.all knows neither finished_after nor
    // order_by=finished_at, so this goes through the same requester.
    deployments: async (since: Date) => {
      const response = await guard(
        api.Deployments.requester.get(
          `projects/${encodeURIComponent(project)}/deployments`,
          {
            searchParams: {
              environment: "production",
              finished_after: since.toISOString(),
              order_by: "finished_at",
              per_page: PER_PAGE,
              sort: "desc",
              status: "success",
            },
          }
        )
      );
      return z
        .array(
          z.object({
            created_at: z.string(),
            finished_at: z.string().nullish(),
          })
        )
        .parse(response.body);
    },
    diffs: async (mr: number) =>
      await collect(
        z.object({
          diff: z.string(),
          new_path: z.string(),
          old_path: z.string(),
        }),
        `merge_requests/${mr}/diffs`,
        api.MergeRequests.allDiffs(project, mr, allPages)
      ),
    discussions: async (mr: number) =>
      await collect(
        discussionSchema,
        `merge_requests/${mr}/discussions`,
        api.MergeRequestDiscussions.all(project, mr, allPages)
      ),
    // Median lead time for changes in seconds (GitLab's DORA API, Ultimate);
    // null when the tier or the data doesn't have it.
    doraLeadTime: async (since: Date) => {
      try {
        const points = z
          .array(z.object({ value: z.number().nullable() }))
          .parse(
            await guard(
              api.ProjectDORA4Metrics.all(project, "lead_time_for_changes", {
                interval: "all",
                startDate: since.toISOString().slice(0, 10),
              })
            )
          );
        return points[0]?.value ?? null;
      } catch {
        return null;
      }
    },
    // The project's feature flags (Deploy > Feature flags), with their
    // strategies: what the release guard and the hygiene check read.
    featureFlags: async () =>
      await collect(
        featureFlagSchema,
        "feature_flags",
        api.FeatureFlags.all(project, allPages)
      ),
    issueLinks: async (issue: number) =>
      z
        .array(issueSchema)
        .parse(await guard(api.IssueLinks.all(project, issue))),
    issueNotes: async (issue: number) =>
      await collect(
        noteSchema,
        `issues/${issue}/notes`,
        api.IssueNotes.all(project, issue, { ...allPages, sort: "desc" })
      ),
    issues: async (options: Omit<AllIssuesOptions, "withLabelsDetails">) =>
      z
        .array(issueSchema)
        .parse(
          await guard(
            api.Issues.all({ ...firstPage, ...options, projectId: project })
          )
        ),
    labelEvents: async (issue: number) =>
      await collect(
        labelEventSchema,
        `issues/${issue}/resource_label_events`,
        api.IssueLabelEvents.all(project, issue, allPages)
      ),
    // A file a job's artifacts hold, from the latest pipeline on a ref.
    latestArtifactJson: async <T>(
      schema: z.ZodType<T>,
      ref: string,
      job: string,
      artifactPath: string
    ) => {
      const body = await guard(
        api.JobArtifacts.downloadArchive(project, { artifactPath, job, ref })
      );
      // GitLab serves .json files as application/json, which is parsed
      // already; anything else arrives as a Blob.
      return schema.parse(
        body instanceof Blob ? JSON.parse(await body.text()) : body
      );
    },
    linkIssues: async (issue: number, target: number) => {
      await guard(api.IssueLinks.create(project, issue, project, target));
    },
    mergeRequest: async (mr: number) =>
      mergeRequestSchema.parse(
        await guard(api.MergeRequests.show(project, mr))
      ),
    mergeRequestNotes: async (mr: number) =>
      await collect(
        noteSchema,
        `merge_requests/${mr}/notes`,
        api.MergeRequestNotes.all(project, mr, { ...allPages, sort: "desc" })
      ),
    mergeRequests: async (
      options: Omit<AllMergeRequestsOptions, "withLabelsDetails">
    ) =>
      z.array(mergeRequestSchema).parse(
        await guard(
          api.MergeRequests.all({
            ...firstPage,
            ...options,
            projectId: project,
          })
        )
      ),
    // Findings fixed on the default branch that still wait in the report.
    noLongerDetected: async () => {
      const body = noLongerDetectedSchema.parse(
        await graphql(NO_LONGER_DETECTED, { path: env.projectPath })
      );
      return body.data.project.vulnerabilities.nodes.filter(
        (v) => v.resolvedOnDefaultBranch
      );
    },
    noteOnIssue: async (issue: number, body: string) => {
      await guard(api.IssueNotes.create(project, issue, body));
    },
    noteOnMergeRequest: async (mr: number, body: string) => {
      await guard(api.MergeRequestNotes.create(project, mr, body));
    },
    pipelineJobs: async (pipeline: number) =>
      await collect(
        z.object({ duration: z.number().nullable() }),
        `pipelines/${pipeline}/jobs`,
        api.Jobs.all(project, { ...allPages, pipelineId: pipeline })
      ),
    pipelines: async (options: AllPipelinesOptions) =>
      z
        .array(z.object({ id: z.int() }))
        .parse(
          await guard(api.Pipelines.all(project, { ...firstPage, ...options }))
        ),
    relatedMergeRequests: async (issue: number) =>
      z
        .array(
          z.object({
            iid: z.int(),
            merged_at: z.string().nullable().optional(),
          })
        )
        .parse(await guard(api.Issues.allRelatedMergeRequests(project, issue))),
    // Asks a reviewer to review again, as the reviewer list's "Re-request a
    // review" does; for GitLab Duo, that starts a follow-up review.
    rereview: async (mr: number, userId: number) =>
      await mutate(
        "mutation($path: ID!, $iid: String!, $user: UserID!) { m: mergeRequestReviewerRereview(input: { projectPath: $path, iid: $iid, userId: $user }) { errors } }",
        {
          iid: String(mr),
          path: env.projectPath,
          user: `gid://gitlab/User/${userId}`,
        }
      ),
    // Sets a finding to Resolved, with the reason in its history.
    resolveFinding: async (id: string, comment: string) =>
      await mutate(
        "mutation($id: VulnerabilityID!, $comment: String!) { m: vulnerabilityResolve(input: { id: $id, comment: $comment }) { errors } }",
        { comment, id }
      ),
    // Starts Duo Vulnerability Resolution, which opens a merge request.
    resolveVulnerability: async (id: string) =>
      await mutate(
        "mutation($id: AiModelID!) { m: aiAction(input: { resolveVulnerability: { resourceId: $id } }) { errors } }",
        { id }
      ),
    // Each reviewer's state: unreviewed, reviewed, requested_changes, approved.
    reviewers: async (mr: number) =>
      z
        .array(
          z.object({
            state: z.string(),
            user: z.object({ username: z.string() }),
          })
        )
        .parse(await guard(api.MergeRequests.showReviewers(project, mr))),
    // A new pipeline on `ref` with these CI variables.
    runPipeline: async (ref: string, variables: Record<string, string>) =>
      z.object({ web_url: z.string() }).parse(
        await guard(
          api.Pipelines.create(project, ref, {
            variables: Object.entries(variables).map(([key, value]) => ({
              key,
              value,
            })),
          })
        )
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
    setAutoMerge: async (mr: number, sha: string) => {
      await guard(
        api.MergeRequests.merge(project, mr, {
          autoMerge: true,
          sha,
          shouldRemoveSourceBranch: true,
        })
      );
    },
    // A flag's Status toggle: the kill switch (Developer role).
    setFeatureFlagActive: async (name: string, active: boolean) =>
      featureFlagSchema.parse(
        await guard(api.FeatureFlags.edit(project, name, { active }))
      ),
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
    updateIssue: async (issue: number, options: EditIssueOptions) =>
      issueSchema.parse(await guard(api.Issues.edit(project, issue, options))),
    updateMergeRequest: async (mr: number, options: EditMergeRequestOptions) =>
      mergeRequestSchema.parse(
        await guard(api.MergeRequests.edit(project, mr, options))
      ),
    userId: async (username: string) => {
      const [user] = z
        .array(userSchema)
        .parse(await guard(api.Users.all({ username })));
      if (user === undefined) {
        throw new Error(`GitLab user ${username} not found`);
      }
      return user.id;
    },
    versions: async (mr: number) =>
      z
        .array(
          z.object({ created_at: z.string(), head_commit_sha: z.string() })
        )
        .parse(await guard(api.MergeRequests.allDiffVersions(project, mr))),

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
