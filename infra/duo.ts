// GitLab Duo flow triggers, custom flows and custom agents for wovain's GitLab
// project, from the stack config (wovain:duoTriggers, wovain:duoCustomFlows,
// wovain:duoCustomAgents in Pulumi.prod.yaml). No GitLab provider has a resource for these, so each is a
// graphql.Mutation (sullivtr/graphql; `pulumi install` generates sdks/graphql),
// which creates, updates, deletes and checks drift from the GraphQL below.
// Needs the `gitlab:token` stack secret (api scope); the hackathon's
// Developer+ role is enough.
//
// It also holds what wovain's three Duo flows need besides their triggers
// (docs/flows.md): the heal flow's trigger, the ops and scout pipeline
// schedules and the flows' labels. GitLab starts a flow only for a human's
// action and trigger filters can't match labels, so only the ops job (a
// person's token) assigns issues to the Developer and heal flows, after its
// label, trusted-user and daily-cap checks (apps/ops). The last block holds
// the Ultimate-only Govern pieces, off unless wovain:ultimate is true.
import { existsSync, readFileSync } from "node:fs";

import * as gitlab from "@pulumi/gitlab";
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

// A custom flow already enabled in the project, and the trigger that starts it.
interface CustomFlow {
  name: string;
  // The flow's YAML, as the ai-catalog component records it in mapping.json.
  file: string;
  description: string;
  events: string[];
  filter?: object;
  active?: boolean;
}

// A custom agent to enable in the project (agents take no triggers).
interface CustomAgent {
  name: string;
  file: string;
}

const config = new pulumi.Config();
const projectPath = config.require("gitlabProject");
const projectNumber = config.require("gitlabProjectId");
const triggers = config.requireObject<Trigger[]>("duoTriggers");

// The heal flow (flow 1, .gitlab/duo/catalog/flows/heal.yml): the ops job
// assigns each new heal issue to its service account; mention lets the ops
// job ask it once to address Duo Code Review's threads. The stack config's
// entry wins when it names the same trigger.
const healFlow: CustomFlow = {
  description: "wovain heal when wovain ops assigns or mentions it",
  events: ["assign", "mention"],
  file: ".gitlab/duo/catalog/flows/heal.yml",
  name: "duo-heal",
};
const configuredFlows = config.getObject<CustomFlow[]>("duoCustomFlows") ?? [];
const customFlows = [
  ...configuredFlows,
  ...[healFlow].filter((f) => !configuredFlows.some((c) => c.name === f.name)),
];
const customAgents = config.getObject<CustomAgent[]>("duoCustomAgents") ?? [];

// The same token as the GitLab provider (infra/gitlab.ts).
const token = new pulumi.Config("gitlab").requireSecret("token");
const provider = new graphql.Provider("gitlab-graphql", {
  headers: { Authorization: pulumi.interpolate`Bearer ${token}` },
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
// The project's enabled flows and agents: built-in flows by their
// foundationalFlowReference, custom ones by their AI Catalog item id.
const consumerIds = query<{
  aiCatalogConfiguredItems: {
    nodes: {
      id: string;
      item: { id: string; foundationalFlowReference: string | null };
    }[];
  };
}>(
  "query($id: ProjectID!) { aiCatalogConfiguredItems(projectId: $id, includeInherited: true, includeFoundationalConsumers: true) { nodes { id item { id foundationalFlowReference } } } }",
  { id: projectId }
).apply(
  (d) =>
    new Map(
      d.aiCatalogConfiguredItems.nodes.map((n) => [
        n.item.foundationalFlowReference ?? n.item.id,
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
    throw new Error(`Unknown ${what} in wovain's Duo stack config`);
  }
  return found;
};

interface TriggerArgs {
  description: string;
  events: string[];
  filter?: object;
  active?: boolean;
  consumerId: pulumi.Input<string>;
  // Built-in flows name their service account; a custom flow's trigger runs
  // as its consumer's account, so it passes none.
  userId?: pulumi.Input<string>;
}

// One flow trigger (aiFlowTriggerCreate), tied to an enabled flow's consumer.
const flowTrigger = (name: string, t: TriggerArgs) => {
  const eventTypes = t.events.map((e) => must(EVENT_IDS[e], `event ${e}`));
  return new graphql.Mutation(
    name,
    {
      computeFromCreate: true,
      computeMutationKeys: { id: "aiFlowTriggerCreate.aiFlowTrigger.id" },
      createMutation: `mutation($projectPath: ID!, ${VARS}) { aiFlowTriggerCreate(input: { projectPath: $projectPath, ${INPUT} }) { errors aiFlowTrigger { id } } }`,
      deleteMutation:
        "mutation($id: AiFlowTriggerID!) { aiFlowTriggerDelete(input: { id: $id }) { errors } }",
      mutationVariables: {
        active: String(t.active ?? true),
        aiCatalogItemConsumerId: t.consumerId,
        description: t.description,
        eventTypes: JSON.stringify(eventTypes),
        filter: JSON.stringify(t.filter ?? {}),
        projectPath,
        ...(t.userId === undefined ? {} : { userId: t.userId }),
      },
      // Returns every mutation variable, so the provider can see drift.
      readQuery:
        "query($projectPath: ID!, $id: AiFlowTriggerID!) { project(fullPath: $projectPath) { fullPath aiFlowTriggers(ids: [$id]) { nodes { id active description eventTypes filter user { id } aiCatalogItemConsumer { id } } } } }",
      readQueryVariables: { projectPath },
      updateMutation: `mutation($id: AiFlowTriggerID!, ${VARS}) { aiFlowTriggerUpdate(input: { id: $id, ${INPUT} }) { errors aiFlowTrigger { id } } }`,
    },
    { provider }
  );
};

for (const t of triggers) {
  flowTrigger(t.name, {
    ...t,
    consumerId: consumerIds.apply((ids) =>
      must(ids.get(t.flow), `flow ${t.flow} (not enabled in the project?)`)
    ),
    userId: userIds.apply((ids) =>
      must(ids.get(t.serviceAccount), `service account ${t.serviceAccount}`)
    ),
  });
}

// Custom flows and agents count once the ai-catalog component has synced them
// and recorded their catalog ids in mapping.json (committed back to main).
const mappingFile = new URL(
  "../.gitlab/duo/catalog/mapping.json",
  import.meta.url
);
type Synced = Record<string, { catalog_id: string }>;
// oxlint-disable-next-line typescript/no-unsafe-assignment -- written by the ai-catalog component
const mapping: { flows?: Synced; agents?: Synced } = existsSync(mappingFile)
  ? JSON.parse(readFileSync(mappingFile, "utf-8"))
  : {};

// A custom flow's trigger, created explicitly for the consumer the project
// already has (enabling the flow made it, along with its service account,
// which GitLab provisions in the top-level group). Human-action events only:
// a `scheduled` trigger runs as a dedicated service account that GitLab
// creates in the project on the fly, which needs create_service_account
// (Maintainer), so our role gets "you do not have permission" and no trigger.
for (const f of customFlows) {
  const itemId = mapping.flows?.[f.file]?.catalog_id;
  if (itemId === undefined) {
    continue;
  }
  flowTrigger(f.name, {
    ...f,
    consumerId: consumerIds.apply((ids) =>
      must(
        ids.get(itemId),
        `custom flow ${f.file} (not enabled in the project?)`
      )
    ),
  });
}

// Custom agents are enabled here; GitLab adds the top-level group's consumer
// for them. Kept on delete: a create that GitLab refuses returns no id, and a
// later delete with no id would stop `pulumi up`.
for (const a of customAgents) {
  const itemId = mapping.agents?.[a.file]?.catalog_id;
  if (itemId === undefined) {
    continue;
  }
  const create =
    "mutation($itemId: AiCatalogItemID!, $projectId: ProjectID!) { aiCatalogItemConsumerCreate(input: { itemId: $itemId, target: { projectId: $projectId } }) { errors itemConsumer { id } } }";
  new graphql.Mutation(
    a.name,
    {
      computeFromCreate: true,
      computeMutationKeys: {
        id: "aiCatalogItemConsumerCreate.itemConsumer.id",
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
    { provider, retainOnDelete: true }
  );
}

// The ops and scout jobs pick their schedule by its description
// (.gitlab/ci/ops.yml, scout.yml), since the hackathon role can't set
// schedule variables.
export const opsSchedule = new gitlab.PipelineSchedule("ops", {
  active: true,
  cron: "*/10 * * * *",
  cronTimezone: "UTC",
  description: "wovain ops",
  project: projectNumber,
  ref: "refs/heads/main",
});
export const scoutSchedule = new gitlab.PipelineSchedule("scout", {
  active: true,
  cron: "30 6 * * *",
  cronTimezone: "UTC",
  description: "wovain scout",
  project: projectNumber,
  ref: "refs/heads/main",
});

// The flows' labels (apps/ops reads them by name).
const flowLabels: Record<string, { color: string; description: string }> = {
  "agent::task": {
    color: "#fc6d26",
    description:
      "Accepted for Duo's Developer flow: wovain ops hands it over when a trusted user added this label",
  },
  heal: {
    color: "#c0392b",
    description: "A production error the heal flow reproduces and fixes",
  },
  "heal::verified": {
    color: "#2da160",
    description:
      "Production confirmed the heal fix: no errors with its signature since the deploy",
  },
  "kpi-scout": {
    color: "#6f42c1",
    description:
      "An improvement the scout flow proposed against a KPI in .gitlab/duo/kpis.yml",
  },
  "kpi-snapshot": {
    color: "#6c757d",
    description: "The daily KPI snapshot the scout flow reads",
  },
  "vuln-fix": {
    color: "#8e44ad",
    description:
      "The audit trail of Duo Vulnerability Resolution runs wovain ops started",
  },
};
export const flowLabelIds = Object.fromEntries(
  Object.entries(flowLabels).map(([name, { color, description }]) => [
    name,
    new gitlab.ProjectLabel(name.replace("::", "-"), {
      color,
      description,
      name,
      project: projectNumber,
    }).labelId,
  ])
);

// The public status page (GitLab Pages, published by the ops schedule's
// pages job, .gitlab/ci/ops.yml). DNS: a CNAME status.wovain.com to the
// project's Pages host, plus the TXT record GitLab verifies with
// (statusDomainVerification, at _gitlab-pages-verification-code.status.wovain.com).
const statusDomain = new gitlab.PagesDomain("status", {
  autoSslEnabled: true,
  domain: "status.wovain.com",
  project: projectNumber,
});
export const statusDomainVerification = statusDomain.verificationCode;

// --- Ultimate only (Govern). Off unless `pulumi config set wovain:ultimate
// true`; delete this block to drop it. The compliance framework needs the
// top-level group's Owner (wovain:complianceGroup), and linking the security
// policy project (.gitlab/security-policies/policy.yml, here this project
// itself) needs a Maintainer.
const ultimate = config.getBoolean("ultimate") === true;
export const complianceFrameworkId = ultimate
  ? new gitlab.ComplianceFramework("wovain-agentic", {
      color: "#6f42c1",
      default: false,
      description:
        "Agent-maintained project: scanners on every pipeline, Duo changes auto-merge only inside guardrails, new High or Critical findings need a person (docs/flows.md)",
      name: "wovain agentic",
      namespacePath: config.require("complianceGroup"),
    }).frameworkId
  : undefined;
export const complianceAttachment =
  complianceFrameworkId === undefined
    ? undefined
    : new gitlab.ProjectComplianceFrameworks("wovain-agentic", {
        complianceFrameworkIds: [complianceFrameworkId],
        project: projectNumber,
      });
export const policyAttachment = ultimate
  ? new gitlab.ProjectSecurityPolicyAttachment("wovain-policies", {
      policyProject: projectPath,
      project: projectNumber,
    })
  : undefined;
