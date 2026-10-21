// Writes the Duo setup in .gitlab/duo.json to GitLab. Safe to re-run.
// - triggers: triggers on GitLab's built-in flows; updates the one with the
//   same description or creates it. Others on the project are left alone.
// - customFlows: flows the ai-catalog component synced from
//   .gitlab/duo/catalog/flows; enables each in the project with its trigger
//   events and, if given, its schedule.
// Run: GITLAB_TOKEN=… node duo.ts
/* oxlint-disable typescript/no-explicit-any, typescript/no-unsafe-assignment, typescript/no-unsafe-member-access, typescript/no-unsafe-argument, typescript/no-unsafe-call, typescript/no-unsafe-return -- GitLab responses are untyped; no schema library keeps the script dependency-free */
import { readFileSync } from "node:fs";

interface Trigger {
  description: string;
  flow: string;
  serviceAccount: string;
  events: string[];
  filter?: object;
}

interface CustomFlow {
  name: string;
  events: string[];
  schedule?: { cron: string; timezone: string };
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
  scheduled: 9,
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

// Runs a mutation such as aiFlowTriggerUpdate and returns its payload.
const mutate = async (
  name: string,
  input: object,
  fields = "errors"
): Promise<Json> => {
  const type = `${name.charAt(0).toUpperCase()}${name.slice(1)}Input`;
  const data = await graphql(
    `mutation($i: ${type}!) { ${name}(input: $i) { ${fields} } }`,
    { i: input }
  );
  const payload = data[name];
  if (payload.errors.length > 0) {
    throw new Error(`${name}: ${payload.errors.join("; ")}`);
  }
  return payload;
};

const config: {
  project: string;
  triggers: Trigger[];
  customFlows: CustomFlow[];
} = JSON.parse(
  readFileSync(new URL(".gitlab/duo.json", import.meta.url), "utf-8")
);
const { project } = config;

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
const builtIn = new Map<string, string>(
  live.aiCatalogConfiguredItems.nodes.map((n: Json) => [
    n.item.foundationalFlowReference,
    n.id,
  ])
);

const writeTrigger = async (t: Trigger) => {
  const [user] = await api(`v4/users?username=${t.serviceAccount}`);
  const input = {
    aiCatalogItemConsumerId: builtIn.get(t.flow),
    description: t.description,
    eventTypes: t.events.map((e) => EVENT_IDS[e]),
    filter: t.filter ?? {},
    userId: `gid://gitlab/User/${user.id}`,
  };
  const id = existing.get(t.description);
  await (id === undefined
    ? mutate("aiFlowTriggerCreate", { ...input, projectPath: project })
    : mutate("aiFlowTriggerUpdate", { ...input, id }));
  console.log(`${id === undefined ? "created" : "updated"} ${t.description}`);
};

const CONSUMER_FIELDS = "id flowTrigger { id flowSchedules { nodes { id } } }";

const writeCustomFlow = async (f: CustomFlow) => {
  const found = await graphql(
    "query($path: ID!, $name: String) { project(fullPath: $path) { aiCatalogItems(search: $name, itemTypes: [FLOW], allAvailable: true) { nodes { id name } } } }",
    { name: f.name, path: project }
  );
  const item = found.project.aiCatalogItems.nodes.find(
    (n: Json) => n.name === f.name
  );
  if (item === undefined) {
    console.log(
      `! ${f.name}: not in the AI Catalog yet (catalog-sync adds it)`
    );
    return;
  }
  const current = await graphql(
    `query($path: ID!, $id: AiCatalogItemID!) { project(fullPath: $path) { aiCatalogItemConsumerForItem(id: $id) { ${CONSUMER_FIELDS} } } }`,
    { id: item.id, path: project }
  );
  let consumer = current.project.aiCatalogItemConsumerForItem;
  if (consumer === null) {
    const created = await mutate(
      "aiCatalogItemConsumerCreate",
      {
        itemId: item.id,
        target: { projectId: `gid://gitlab/Project/${projectId}` },
        triggerTypes: f.events,
      },
      `errors itemConsumer { ${CONSUMER_FIELDS} }`
    );
    consumer = created.itemConsumer;
  } else {
    await mutate("aiFlowTriggerUpdate", {
      eventTypes: f.events.map((e) => EVENT_IDS[e]),
      id: consumer.flowTrigger.id,
    });
  }
  if (f.schedule !== undefined) {
    const schedule = {
      cron: f.schedule.cron,
      cronTimezone: f.schedule.timezone,
      description: f.name,
    };
    const [scheduled] = consumer.flowTrigger.flowSchedules.nodes;
    await (scheduled === undefined
      ? mutate("aiFlowScheduleCreate", {
          ...schedule,
          flowTriggerId: consumer.flowTrigger.id,
        })
      : mutate("aiFlowScheduleUpdate", { ...schedule, id: scheduled.id }));
  }
  console.log(`enabled ${f.name}`);
};

await Promise.all([
  ...config.triggers.map(writeTrigger),
  ...config.customFlows.map(writeCustomFlow),
]);
