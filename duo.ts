// GitLab Duo Agent Platform as code: the flow triggers and Duo project
// settings wovain runs with. `node duo.ts plan` shows the drift from GitLab,
// `node duo.ts apply` fixes it (Node 24+ runs .ts directly, so no package
// manager is involved). Needs GITLAB_TOKEN (api scope).
//
// Triggers are matched by description. Triggers on the project that aren't
// listed here are reported and left alone. Settings that need the Maintainer
// role (the hackathon's Developer+ role can't change them) are reported, not
// failed, so apply still runs the rest.

const PROJECT = "gitlab-ai-hackathon/transcend-october-2026/43085639/showcase";
const GITLAB = process.env["CI_SERVER_URL"] ?? "https://gitlab.com";

// Event type ids from ee/app/models/ai/flow_trigger.rb (EVENT_TYPES).
const EVENT = {
  assign: 1,
  assignReviewer: 2,
  mention: 0,
  mergeRequest: 6,
  mergeRequestReady: 4,
  pipeline: 3,
  workItem: 7,
} as const;

interface Trigger {
  description: string;
  // foundationalFlowReference of a flow enabled on the project
  flow: string;
  serviceAccount: string;
  events: number[];
  filter?: Record<string, unknown>;
}

const triggers: Trigger[] = [
  {
    description: "Foundational flow trigger for Developer",
    events: [EVENT.assign, EVENT.mention],
    flow: "developer/v1",
    serviceAccount: "duo-developer-gitlab-ai-hackathon",
  },
  {
    description: "Fix CI/CD on failed pipeline",
    events: [EVENT.pipeline],
    filter: {
      pipeline_hooks: {
        match: "all",
        rules: [
          {
            field: "object_attributes.status",
            operator: "in",
            value: ["failed"],
          },
        ],
      },
    },
    flow: "fix_pipeline/v1",
    serviceAccount: "duo-fix-ci-cd-pipeline-gitlab-ai-hackathon",
  },
  {
    description: "Code review on new or ready MR",
    events: [EVENT.mergeRequest, EVENT.mergeRequestReady],
    filter: {
      merge_request: {
        match: "all",
        rules: [{ field: "action", operator: "in", value: ["created"] }],
      },
    },
    flow: "code_review/v1",
    serviceAccount: "duo-code-review-gitlab-ai-hackathon",
  },
];

// Project settings (REST names). These need the Maintainer role.
const settings: Record<string, boolean> = {
  auto_duo_code_review_enabled: true,
  duo_foundational_flows_enabled: true,
  duo_remote_flows_enabled: true,
  duo_sast_fp_detection_enabled: true,
  duo_sast_vr_workflow_enabled: true,
};

const token = process.env["GITLAB_TOKEN"];
if (token === undefined || token === "") {
  throw new Error("GITLAB_TOKEN is not set");
}
const headers = {
  authorization: `Bearer ${token}`,
  "content-type": "application/json",
};

// fetch's json() is untyped; callers name the shape they expect.
const readJson = async <T>(res: Response): Promise<T> => {
  const body: unknown = await res.json();
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- GitLab API shapes; no schema library keeps the script dependency-free
  return body as T;
};

const graphql = async <T>(
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> => {
  const res = await fetch(`${GITLAB}/api/graphql`, {
    body: JSON.stringify({ query, variables }),
    headers,
    method: "POST",
  });
  const body = await readJson<{
    data: T;
    errors?: { message: string }[];
  }>(res);
  if (body.errors !== undefined && body.errors.length > 0) {
    throw new Error(body.errors.map((e) => e.message).join("; "));
  }
  return body.data;
};

const rest = async (path: string, init: RequestInit = {}): Promise<Response> =>
  await fetch(`${GITLAB}/api/v4/${path}`, { ...init, headers });

const projectRef = encodeURIComponent(PROJECT);

interface LiveTrigger {
  id: string;
  description: string;
  eventTypes: number[];
  filter: Record<string, unknown> | null;
  user: { id: string; username: string } | null;
  aiCatalogItemConsumer: { id: string } | null;
}

const load = async () => {
  const projectRes = await rest(`projects/${projectRef}`);
  const project = await readJson<Record<string, unknown> & { id: number }>(
    projectRes
  );
  const data = await graphql<{
    project: { aiFlowTriggers: { nodes: LiveTrigger[] } };
    aiCatalogConfiguredItems: {
      nodes: {
        id: string;
        item: { foundationalFlowReference: string | null };
      }[];
    };
  }>(
    `
      query ($path: ID!, $projectId: ProjectID!) {
        project(fullPath: $path) {
          aiFlowTriggers {
            nodes {
              id
              description
              eventTypes
              filter
              user {
                id
                username
              }
              aiCatalogItemConsumer {
                id
              }
            }
          }
        }
        aiCatalogConfiguredItems(
          projectId: $projectId
          includeInherited: true
          includeFoundationalConsumers: true
        ) {
          nodes {
            id
            item {
              foundationalFlowReference
            }
          }
        }
      }
    `,
    { path: PROJECT, projectId: `gid://gitlab/Project/${project.id}` }
  );
  const consumers = new Map(
    data.aiCatalogConfiguredItems.nodes
      .filter((n) => n.item.foundationalFlowReference !== null)
      .map((n) => [n.item.foundationalFlowReference, n.id] as const)
  );
  return { consumers, live: data.project.aiFlowTriggers.nodes, project };
};

const userId = async (username: string): Promise<string> => {
  const res = await rest(`users?username=${encodeURIComponent(username)}`);
  const [user] = await readJson<{ id: number }[]>(res);
  if (user === undefined) {
    throw new Error(`no user ${username}`);
  }
  return `gid://gitlab/User/${user.id}`;
};

// GitLab returns filter keys in its own order, so compare with sorted keys.
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(canonical);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .toSorted(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)])
    );
  }
  return value;
};
const same = (a: unknown, b: unknown) =>
  JSON.stringify(canonical(a ?? {})) === JSON.stringify(canonical(b ?? {}));
const sorted = (xs: number[]) => [...xs].toSorted((a, b) => a - b);

const mutate = async (name: "Create" | "Update", input: object) => {
  const field = `aiFlowTrigger${name}`;
  const data = await graphql<Record<string, { errors: string[] }>>(
    `mutation($i: AiFlowTrigger${name}Input!) { ${field}(input: $i) { errors } }`,
    { i: input }
  );
  const errors = data[field]?.errors ?? [];
  if (errors.length > 0) {
    throw new Error(errors.join("; "));
  }
};

// One trigger: returns the plan line and, on apply, makes GitLab match.
const reconcile = async (
  want: Trigger,
  consumers: Map<string | null, string>,
  live: Map<string, LiveTrigger>,
  apply: boolean
): Promise<{ line: string; drift: boolean }> => {
  const consumer = consumers.get(want.flow);
  if (consumer === undefined) {
    return {
      drift: true,
      line: `! ${want.description}: flow ${want.flow} isn't enabled on the project`,
    };
  }
  const user = await userId(want.serviceAccount);
  const input = {
    aiCatalogItemConsumerId: consumer,
    description: want.description,
    eventTypes: want.events,
    filter: want.filter ?? {},
    userId: user,
  };
  const have = live.get(want.description);
  if (have === undefined) {
    if (apply) {
      await mutate("Create", { ...input, projectPath: PROJECT });
    }
    return { drift: true, line: `+ ${want.description}` };
  }
  const changed =
    !same(sorted(have.eventTypes), sorted(want.events)) ||
    !same(have.filter, want.filter) ||
    have.user?.id !== user ||
    have.aiCatalogItemConsumer?.id !== consumer;
  if (!changed) {
    return { drift: false, line: `= ${want.description}` };
  }
  if (apply) {
    await mutate("Update", { ...input, id: have.id });
  }
  return { drift: true, line: `~ ${want.description}` };
};

// Settings that differ; on apply, one PUT for all of them.
const reconcileSettings = async (
  project: Record<string, unknown>,
  apply: boolean
): Promise<number> => {
  const changes = Object.fromEntries(
    Object.entries(settings).filter(([key, value]) => project[key] !== value)
  );
  for (const [key, value] of Object.entries(changes)) {
    console.log(`~ setting ${key} -> ${String(value)}`);
  }
  const count = Object.keys(changes).length;
  if (!apply || count === 0) {
    return count;
  }
  const res = await rest(`projects/${projectRef}`, {
    body: JSON.stringify(changes),
    method: "PUT",
  });
  if (res.status === 403) {
    console.log(
      "! settings need the Maintainer role; ask contributor-success to apply them"
    );
  } else if (!res.ok) {
    throw new Error(
      `settings update failed: ${res.status} ${await res.text()}`
    );
  }
  return count;
};

const run = async (apply: boolean) => {
  const { consumers, live, project } = await load();
  const byDescription = new Map(live.map((t) => [t.description, t]));
  const results = await Promise.all(
    triggers.map(
      async (want) => await reconcile(want, consumers, byDescription, apply)
    )
  );
  for (const { line } of results) {
    console.log(line);
  }
  const declared = new Set(triggers.map((t) => t.description));
  for (const t of live) {
    if (!declared.has(t.description)) {
      console.log(`? ${t.description}: not in duo.ts, left alone`);
    }
  }
  const drift = results.filter((r) => r.drift).length;
  const settingsDrift = await reconcileSettings(project, apply);
  console.log(
    `${drift} trigger change(s), ${settingsDrift} setting change(s) ${apply ? "applied" : "planned"}`
  );
};

const [command] = process.argv.slice(2);
if (command !== "plan" && command !== "apply") {
  throw new Error("usage: node duo.ts plan|apply");
}
await run(command === "apply");
