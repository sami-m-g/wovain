// GitLab Duo flow triggers for wovain's GitLab project. Neither the GitLab
// Terraform provider nor @pulumi/gitlab has a resource for them, so each one
// is a graphql.Mutation (sullivtr/graphql, generated into sdks/graphql), which
// creates, updates, deletes and checks drift from the GraphQL strings below.
// Needs GITLAB_TOKEN (api scope); the hackathon's Developer+ role is enough.
import { existsSync, readFileSync } from "node:fs";

import * as graphql from "@pulumi/graphql";
import * as pulumi from "@pulumi/pulumi";

const projectPath = new pulumi.Config().require("gitlabProject");
const token = process.env["GITLAB_TOKEN"];
if (token === undefined || token === "") {
  throw new Error("GITLAB_TOKEN is not set");
}

const provider = new graphql.Provider("gitlab-graphql", {
  headers: { Authorization: pulumi.secret(`Bearer ${token}`) },
  url: "https://gitlab.com/api/graphql",
});

// Event type ids from GitLab's ee/app/models/ai/flow_trigger.rb (EVENT_TYPES).
const EVENT = {
  assign: 1,
  mention: 0,
  mergeRequest: 6,
  mergeRequestReady: 4,
  pipeline: 3,
};

// The project's enablements of GitLab's built-in flows (aiCatalogConfiguredItems).
const FLOW = {
  codeReview: "gid://gitlab/Ai::Catalog::ItemConsumer/12267624",
  developer: "gid://gitlab/Ai::Catalog::ItemConsumer/12267627",
  fixPipeline: "gid://gitlab/Ai::Catalog::ItemConsumer/12267628",
};

// The project's id and the flows' service accounts, looked up by name.
const lookup = graphql
  .getQueryOutput(
    {
      query:
        "query($path: ID!, $names: [String!]) { project(fullPath: $path) { id } users(usernames: $names) { nodes { id username } } }",
      queryVariables: {
        names: JSON.stringify([
          "duo-code-review-gitlab-ai-hackathon",
          "duo-developer-gitlab-ai-hackathon",
          "duo-fix-ci-cd-pipeline-gitlab-ai-hackathon",
        ]),
        path: projectPath,
      },
    },
    { provider }
  )
  .apply((result) => {
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- the GraphQL response shape is fixed by the query above
    const {
      data,
    }: {
      data: {
        project: { id: string };
        users: { nodes: { id: string; username: string }[] };
      };
    } = JSON.parse(result.queryResponse);
    return {
      projectId: data.project.id,
      users: Object.fromEntries(
        data.users.nodes.map((u) => [u.username, u.id])
      ),
    };
  });

const VARS =
  "$description: String!, $eventTypes: [Int!]!, $filter: JSON, $userId: UserID, $aiCatalogItemConsumerId: AiCatalogItemConsumerID, $active: Boolean";
const INPUT =
  "description: $description, eventTypes: $eventTypes, filter: $filter, userId: $userId, aiCatalogItemConsumerId: $aiCatalogItemConsumerId, active: $active";

const flowTrigger = (
  name: string,
  args: {
    description: string;
    flow: string;
    serviceAccount: string;
    events: number[];
    filter?: object;
    // An inactive trigger stays configured but doesn't run.
    active?: boolean;
  }
) =>
  new graphql.Mutation(
    name,
    {
      computeFromCreate: true,
      computeMutationKeys: { id: "aiFlowTriggerCreate.aiFlowTrigger.id" },
      createMutation: `mutation($projectPath: ID!, ${VARS}) { aiFlowTriggerCreate(input: { projectPath: $projectPath, ${INPUT} }) { errors aiFlowTrigger { id } } }`,
      deleteMutation:
        "mutation($id: AiFlowTriggerID!) { aiFlowTriggerDelete(input: { id: $id }) { errors } }",
      mutationVariables: {
        active: String(args.active ?? true),
        aiCatalogItemConsumerId: args.flow,
        description: args.description,
        eventTypes: JSON.stringify(args.events),
        filter: JSON.stringify(args.filter ?? {}),
        projectPath,
        userId: lookup.apply((l) => l.users[args.serviceAccount] ?? ""),
      },
      // Returns every mutation variable, so the provider can see drift.
      readQuery:
        "query($projectPath: ID!, $id: AiFlowTriggerID!) { project(fullPath: $projectPath) { fullPath aiFlowTriggers(ids: [$id]) { nodes { id active description eventTypes filter user { id } aiCatalogItemConsumer { id } } } } }",
      readQueryVariables: { projectPath },
      updateMutation: `mutation($id: AiFlowTriggerID!, ${VARS}) { aiFlowTriggerUpdate(input: { id: $id, ${INPUT} }) { errors aiFlowTrigger { id } } }`,
    },
    { provider }
  );

flowTrigger("duo-developer", {
  description: "Developer flow on assign or mention",
  events: [EVENT.assign, EVENT.mention],
  flow: FLOW.developer,
  serviceAccount: "duo-developer-gitlab-ai-hackathon",
});

flowTrigger("duo-fix-pipeline", {
  // Off for now.
  active: false,
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
  flow: FLOW.fixPipeline,
  serviceAccount: "duo-fix-ci-cd-pipeline-gitlab-ai-hackathon",
});

flowTrigger("duo-code-review", {
  // Off for now.
  active: false,
  description: "Code review on new or ready MR",
  events: [EVENT.mergeRequest, EVENT.mergeRequestReady],
  filter: {
    merge_request: {
      match: "all",
      rules: [{ field: "action", operator: "in", value: ["created"] }],
    },
  },
  flow: FLOW.codeReview,
  serviceAccount: "duo-code-review-gitlab-ai-hackathon",
});

// Custom flows: the ai-catalog component syncs them from
// .gitlab/duo/catalog/flows and records their catalog ids in mapping.json
// (committed back to main), so they're enabled from the first run after that.
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

const scoutId =
  mapping.flows?.[".gitlab/duo/catalog/flows/scout.yml"]?.catalog_id;
if (scoutId !== undefined) {
  // Enabling a flow in the project creates its trigger and service account.
  // The trigger type is inline: the read query returns event ids, not names.
  const createConsumer =
    'mutation($itemId: AiCatalogItemID!, $projectId: ProjectID!) { aiCatalogItemConsumerCreate(input: { itemId: $itemId, target: { projectId: $projectId }, triggerTypes: ["scheduled"] }) { errors itemConsumer { id flowTrigger { id } } } }';
  const scout = new graphql.Mutation(
    "duo-scout",
    {
      computeFromCreate: true,
      computeMutationKeys: {
        id: "aiCatalogItemConsumerCreate.itemConsumer.id",
        triggerId: "aiCatalogItemConsumerCreate.itemConsumer.flowTrigger.id",
      },
      createMutation: createConsumer,
      deleteMutation:
        "mutation($id: AiCatalogItemConsumerID!) { aiCatalogItemConsumerDelete(input: { id: $id }) { errors } }",
      forceReplace: true,
      mutationVariables: {
        itemId: scoutId,
        projectId: lookup.apply((l) => l.projectId),
      },
      readQuery:
        "query($id: AiCatalogItemConsumerID!) { aiCatalogItemConsumer(id: $id) { id item { id } project { id } } }",
      readQueryVariables: {},
      updateMutation: createConsumer,
    },
    { provider }
  );

  const flowTriggerId = scout.computedUpdateOperationVariables.apply(
    (v) => v?.["triggerId"] ?? ""
  );
  const SCHEDULE =
    "$description: String!, $cron: String!, $cronTimezone: String!";
  new graphql.Mutation(
    "duo-scout-schedule",
    {
      computeFromCreate: true,
      computeMutationKeys: { id: "aiFlowScheduleCreate.aiFlowSchedule.id" },
      createMutation: `mutation($flowTriggerId: AiFlowTriggerID!, ${SCHEDULE}) { aiFlowScheduleCreate(input: { flowTriggerId: $flowTriggerId, description: $description, cron: $cron, cronTimezone: $cronTimezone }) { errors aiFlowSchedule { id } } }`,
      deleteMutation:
        "mutation($id: AiFlowScheduleID!) { aiFlowScheduleDelete(input: { id: $id }) { errors } }",
      mutationVariables: {
        cron: "0 7 * * *",
        cronTimezone: "UTC",
        description: "wovain scout, daily",
        flowTriggerId,
      },
      readQuery:
        "query($path: ID!, $flowTriggerId: AiFlowTriggerID!) { project(fullPath: $path) { aiFlowTriggers(ids: [$flowTriggerId]) { nodes { id flowSchedules { nodes { id description cron cronTimezone } } } } } }",
      readQueryVariables: { flowTriggerId, path: projectPath },
      updateMutation: `mutation($id: AiFlowScheduleID!, ${SCHEDULE}) { aiFlowScheduleUpdate(input: { id: $id, description: $description, cron: $cron, cronTimezone: $cronTimezone }) { errors aiFlowSchedule { id } } }`,
    },
    { provider }
  );
}
