// GitLab Duo flow triggers and custom flows for wovain's GitLab project, from
// the stack config (wovain:duoTriggers, wovain:duoCustomFlows in
// Pulumi.prod.yaml). No GitLab provider has a resource for these, so each is a
// graphql.Mutation (sullivtr/graphql; `pulumi install` generates sdks/graphql),
// which creates, updates, deletes and checks drift from the GraphQL below.
// Needs GITLAB_TOKEN (api scope); the hackathon's Developer+ role is enough.
import { existsSync, readFileSync } from "node:fs";

import * as graphql from "@pulumi/graphql";
import * as pulumi from "@pulumi/pulumi";

interface Trigger {
  name: string;
  description: string;
  // A built-in flow's foundationalFlowReference, e.g. developer/v1.
  flow: string;
  serviceAccount: string;
  events: string[];
  filter?: object;
  // An inactive trigger stays configured but doesn't run.
  active?: boolean;
}

interface CustomFlow {
  name: string;
  // The flow's YAML, as the ai-catalog component records it in mapping.json.
  file: string;
  events: string[];
  schedule?: { cron: string; timezone: string; description: string };
}

const config = new pulumi.Config();
const projectPath = config.require("gitlabProject");
const triggers = config.requireObject<Trigger[]>("duoTriggers");
const customFlows = config.getObject<CustomFlow[]>("duoCustomFlows") ?? [];

const token = process.env["GITLAB_TOKEN"];
if (token === undefined || token === "") {
  throw new Error("GITLAB_TOKEN is not set");
}
const provider = new graphql.Provider("gitlab-graphql", {
  headers: { Authorization: pulumi.secret(`Bearer ${token}`) },
  url: "https://gitlab.com/api/graphql",
});

// GitLab's trigger event ids (ee/app/models/ai/flow_trigger.rb, EVENT_TYPES).
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

// The shape of each response is fixed by its query text.
const query = <T>(
  text: string,
  variables: Record<string, pulumi.Input<string>>
) =>
  graphql
    .getQueryOutput({ query: text, queryVariables: variables }, { provider })
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion, typescript/no-unsafe-member-access -- see above
    .apply((r) => JSON.parse(r.queryResponse).data as T);

// Ids by name: the project, the service accounts, the built-in flows.
const lookup = query<{
  project: { id: string };
  users: { nodes: { id: string; username: string }[] };
}>(
  "query($path: ID!, $names: [String!]) { project(fullPath: $path) { id } users(usernames: $names) { nodes { id username } } }",
  {
    names: JSON.stringify(triggers.map((t) => t.serviceAccount)),
    path: projectPath,
  }
);
const projectId = lookup.apply((d) => d.project.id);
const userIds = lookup.apply(
  (d) => new Map(d.users.nodes.map((u) => [u.username, u.id]))
);
const flowIds = query<{
  aiCatalogConfiguredItems: {
    nodes: { id: string; item: { foundationalFlowReference: string } }[];
  };
}>(
  "query($id: ProjectID!) { aiCatalogConfiguredItems(projectId: $id, includeInherited: true, includeFoundationalConsumers: true) { nodes { id item { foundationalFlowReference } } } }",
  { id: projectId }
).apply(
  (d) =>
    new Map(
      d.aiCatalogConfiguredItems.nodes.map((n) => [
        n.item.foundationalFlowReference,
        n.id,
      ])
    )
);

const VARS =
  "$description: String!, $eventTypes: [Int!]!, $filter: JSON, $userId: UserID, $aiCatalogItemConsumerId: AiCatalogItemConsumerID, $active: Boolean";
const INPUT =
  "description: $description, eventTypes: $eventTypes, filter: $filter, userId: $userId, aiCatalogItemConsumerId: $aiCatalogItemConsumerId, active: $active";

// A name in Pulumi.prod.yaml that GitLab doesn't know fails here, by name,
// instead of as an opaque GraphQL error during apply.
const must = <T>(found: T | undefined, what: string): T => {
  if (found === undefined) {
    throw new Error(`Unknown ${what} in wovain:duoTriggers`);
  }
  return found;
};

for (const t of triggers) {
  const eventTypes = t.events.map((e) => must(EVENT_IDS[e], `event ${e}`));
  new graphql.Mutation(
    t.name,
    {
      computeFromCreate: true,
      computeMutationKeys: { id: "aiFlowTriggerCreate.aiFlowTrigger.id" },
      createMutation: `mutation($projectPath: ID!, ${VARS}) { aiFlowTriggerCreate(input: { projectPath: $projectPath, ${INPUT} }) { errors aiFlowTrigger { id } } }`,
      deleteMutation:
        "mutation($id: AiFlowTriggerID!) { aiFlowTriggerDelete(input: { id: $id }) { errors } }",
      mutationVariables: {
        active: String(t.active ?? true),
        aiCatalogItemConsumerId: flowIds.apply((ids) =>
          must(ids.get(t.flow), `flow ${t.flow} (not enabled in the project?)`)
        ),
        description: t.description,
        eventTypes: JSON.stringify(eventTypes),
        filter: JSON.stringify(t.filter ?? {}),
        projectPath,
        userId: userIds.apply((ids) =>
          must(ids.get(t.serviceAccount), `service account ${t.serviceAccount}`)
        ),
      },
      // Returns every mutation variable, so the provider can see drift.
      readQuery:
        "query($projectPath: ID!, $id: AiFlowTriggerID!) { project(fullPath: $projectPath) { fullPath aiFlowTriggers(ids: [$id]) { nodes { id active description eventTypes filter user { id } aiCatalogItemConsumer { id } } } } }",
      readQueryVariables: { projectPath },
      updateMutation: `mutation($id: AiFlowTriggerID!, ${VARS}) { aiFlowTriggerUpdate(input: { id: $id, ${INPUT} }) { errors aiFlowTrigger { id } } }`,
    },
    { provider }
  );
}

// Custom flows are enabled once the ai-catalog component has synced them and
// recorded their catalog ids in mapping.json (committed back to main).
const mappingFile = new URL(
  "../.gitlab/duo/catalog/mapping.json",
  import.meta.url
);
// oxlint-disable-next-line typescript/no-unsafe-assignment -- written by the ai-catalog component
const mapping: { flows?: Record<string, { catalog_id: string }> } = existsSync(
  mappingFile
)
  ? JSON.parse(readFileSync(mappingFile, "utf-8"))
  : {};

const SCHEDULE =
  "$description: String!, $cron: String!, $cronTimezone: String!";
const SCHEDULE_INPUT =
  "description: $description, cron: $cron, cronTimezone: $cronTimezone";

for (const f of customFlows) {
  const itemId = mapping.flows?.[f.file]?.catalog_id;
  if (itemId === undefined) {
    continue;
  }
  // Enabling a flow creates its trigger and service account. The trigger types
  // are inline because the read query returns event ids, not names.
  const create = `mutation($itemId: AiCatalogItemID!, $projectId: ProjectID!) { aiCatalogItemConsumerCreate(input: { itemId: $itemId, target: { projectId: $projectId }, triggerTypes: ${JSON.stringify(f.events)} }) { errors itemConsumer { id flowTrigger { id } } } }`;
  const enabled = new graphql.Mutation(
    f.name,
    {
      computeFromCreate: true,
      computeMutationKeys: {
        id: "aiCatalogItemConsumerCreate.itemConsumer.id",
        triggerId: "aiCatalogItemConsumerCreate.itemConsumer.flowTrigger.id",
      },
      createMutation: create,
      deleteMutation:
        "mutation($id: AiCatalogItemConsumerID!) { aiCatalogItemConsumerDelete(input: { id: $id }) { errors } }",
      forceReplace: true,
      mutationVariables: { itemId, projectId },
      readQuery:
        "query($id: AiCatalogItemConsumerID!) { aiCatalogItemConsumer(id: $id) { id item { id } project { id } } }",
      readQueryVariables: {},
      updateMutation: create,
    },
    { provider }
  );

  if (f.schedule !== undefined) {
    const flowTriggerId = enabled.computedUpdateOperationVariables.apply(
      (v) => v?.["triggerId"] ?? ""
    );
    new graphql.Mutation(
      `${f.name}-schedule`,
      {
        computeFromCreate: true,
        computeMutationKeys: { id: "aiFlowScheduleCreate.aiFlowSchedule.id" },
        createMutation: `mutation($flowTriggerId: AiFlowTriggerID!, ${SCHEDULE}) { aiFlowScheduleCreate(input: { flowTriggerId: $flowTriggerId, ${SCHEDULE_INPUT} }) { errors aiFlowSchedule { id } } }`,
        deleteMutation:
          "mutation($id: AiFlowScheduleID!) { aiFlowScheduleDelete(input: { id: $id }) { errors } }",
        mutationVariables: {
          cron: f.schedule.cron,
          cronTimezone: f.schedule.timezone,
          description: f.schedule.description,
          flowTriggerId,
        },
        readQuery:
          "query($path: ID!, $flowTriggerId: AiFlowTriggerID!) { project(fullPath: $path) { aiFlowTriggers(ids: [$flowTriggerId]) { nodes { id flowSchedules { nodes { id description cron cronTimezone } } } } } }",
        readQueryVariables: { flowTriggerId, path: projectPath },
        updateMutation: `mutation($id: AiFlowScheduleID!, ${SCHEDULE}) { aiFlowScheduleUpdate(input: { id: $id, ${SCHEDULE_INPUT} }) { errors aiFlowSchedule { id } } }`,
      },
      { provider }
    );
  }
}
