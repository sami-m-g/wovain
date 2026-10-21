// Writes the Duo flow triggers in .gitlab/duo.json to GitLab: updates the
// trigger with the same description, or creates it. Safe to re-run; triggers
// not in the config are left alone. Run: GITLAB_TOKEN=… node duo.ts
/* oxlint-disable typescript/no-explicit-any, typescript/no-unsafe-assignment, typescript/no-unsafe-member-access, typescript/no-unsafe-argument, typescript/no-unsafe-call, typescript/no-unsafe-return -- GitLab responses are untyped; no schema library keeps the script dependency-free */
import { readFileSync } from "node:fs";

interface Trigger {
  description: string;
  flow: string;
  serviceAccount: string;
  events: string[];
  filter?: object;
}

// Event type ids from GitLab's ee/app/models/ai/flow_trigger.rb (EVENT_TYPES).
const EVENT_IDS: Record<string, number> = {
  assign: 1,
  assign_reviewer: 2,
  commit_to_default_branch: 8,
  mention: 0,
  merge_request: 6,
  merge_request_code_conflict: 5,
  merge_request_ready: 4,
  pipeline_hooks: 3,
  work_item: 7,
};

const gitlab = process.env["CI_SERVER_URL"] ?? "https://gitlab.com";
const headers = {
  authorization: `Bearer ${process.env["GITLAB_TOKEN"] ?? ""}`,
  "content-type": "application/json",
};

type Json = any;

const api = async (path: string, body?: object): Promise<Json> => {
  const res = await fetch(`${gitlab}/api/${path}`, {
    headers,
    ...(body && { body: JSON.stringify(body), method: "POST" }),
  });
  const json: Json = await res.json();
  if (!res.ok || json.errors?.length > 0) {
    throw new Error(
      `${path}: ${res.status} ${JSON.stringify(json.errors ?? json)}`
    );
  }
  return json;
};

const graphql = async (query: string, variables: object): Promise<Json> => {
  const { data } = await api("graphql", { query, variables });
  return data;
};

const { project, triggers }: { project: string; triggers: Trigger[] } =
  JSON.parse(
    readFileSync(new URL(".gitlab/duo.json", import.meta.url), "utf-8")
  );

const { id: projectId } = await api(
  `v4/projects/${encodeURIComponent(project)}`
);
const live = await graphql(
  "query($path: ID!, $id: ProjectID!) { project(fullPath: $path) { aiFlowTriggers { nodes { id description } } } aiCatalogConfiguredItems(projectId: $id, includeInherited: true, includeFoundationalConsumers: true) { nodes { id item { foundationalFlowReference } } } }",
  { id: `gid://gitlab/Project/${projectId}`, path: project }
);
const existing = new Map<string, string>(
  live.project.aiFlowTriggers.nodes.map((t: Json) => [t.description, t.id])
);
const flows = new Map<string, string>(
  live.aiCatalogConfiguredItems.nodes.map((n: Json) => [
    n.item.foundationalFlowReference,
    n.id,
  ])
);

const write = async (t: Trigger) => {
  const [user] = await api(`v4/users?username=${t.serviceAccount}`);
  const input = {
    aiCatalogItemConsumerId: flows.get(t.flow),
    description: t.description,
    eventTypes: t.events.map((e) => EVENT_IDS[e]),
    filter: t.filter ?? {},
    userId: `gid://gitlab/User/${user.id}`,
  };
  const id = existing.get(t.description);
  const name = id === undefined ? "Create" : "Update";
  const data = await graphql(
    `mutation($i: AiFlowTrigger${name}Input!) { aiFlowTrigger${name}(input: $i) { errors } }`,
    {
      i:
        id === undefined
          ? { ...input, projectPath: project }
          : { ...input, id },
    }
  );
  const errors: string[] = data[`aiFlowTrigger${name}`].errors;
  if (errors.length > 0) {
    throw new Error(`${t.description}: ${errors.join("; ")}`);
  }
  console.log(`${name === "Create" ? "created" : "updated"} ${t.description}`);
};

await Promise.all(triggers.map(write));
