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

// A custom flow to enable in the project, and the trigger that starts it.
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

// Custom flows from .gitlab/duo/catalog/flows (heal, scout, ...): each is
// enabled in the project, gets its trigger, and its service account's name
// becomes a DUO_<NAME>_ACCOUNT CI variable (duoFlowAccounts below).
const customFlows = config.getObject<CustomFlow[]>("duoCustomFlows") ?? [];
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
type Synced = Record<
  string,
  { catalog_id: string; latest_sync?: { catalog_version: string } }
>;
// oxlint-disable-next-line typescript/no-unsafe-assignment -- written by the ai-catalog component
const mapping: { flows?: Synced; agents?: Synced } = existsSync(mappingFile)
  ? JSON.parse(readFileSync(mappingFile, "utf-8"))
  : {};

// Each synced custom flow is enabled in the project with
// aiCatalogItemConsumerCreate, the API behind Automate > AI Catalog > Flows >
// Enable. GitLab first enables it in the top-level group, which provisions the
// flow's service account there (ai-<flow name>-<group name>), and adds that
// account to the project as a Developer. That needs
// admin_ai_catalog_item_consumer on the project, which the hackathon's
// Developer+ custom role has: GitLab skips the group owner check for these
// composite-identity accounts (Ai::Catalog::ItemConsumers::CreateService,
// Namespaces::ServiceAccounts::GroupCreateService).
//
// A flow that is already enabled, by hand or by an earlier run, is adopted:
// its create is a no-op update of the existing consumer, which returns the
// same id. Once Pulumi holds the resource, the create switching to that form
// is not a change (ignoreChanges). Kept on delete, as for agents: deleting the
// consumer would also delete its triggers.
// The create needs a pinned version, and its input has only pinnedVersion
// (n.n.n, a released one): pinnedVersionPrefix is on the update alone. The
// version is the one the catalog sync last published (mapping.json). It is
// fixed when the consumer is created: ignoreChanges keeps an existing consumer
// on its version when a later sync publishes a newer one, so moving a consumer
// to a new version is done in AI Catalog (or by re-enabling the item).
const CREATE_CONSUMER =
  "aiCatalogItemConsumerCreate(input: { itemId: $itemId, pinnedVersion: $version, target: { projectId: $projectId } }) { errors itemConsumer { id } }";
const ENABLE = `mutation($itemId: AiCatalogItemID!, $projectId: ProjectID!, $version: AiCatalogPinnedVersion!) { consumer: ${CREATE_CONSUMER} }`;
// The update also needs exactly one of pinnedVersion and pinnedVersionPrefix.
const ADOPT =
  "mutation($id: AiCatalogItemConsumerID!, $version: AiCatalogPinnedVersion!) { consumer: aiCatalogItemConsumerUpdate(input: { id: $id, pinnedVersion: $version }) { errors itemConsumer { id } } }";

const enableFlow = (name: string, itemId: string, version: string) => {
  const existing = consumerIds.apply((ids) => ids.get(itemId));
  const consumer = new graphql.Mutation(
    name,
    {
      computeFromCreate: true,
      computeMutationKeys: { id: "consumer.itemConsumer.id" },
      createMutation: existing.apply((id) =>
        id === undefined ? ENABLE : ADOPT
      ),
      deleteMutation:
        "mutation($id: AiCatalogItemConsumerID!) { aiCatalogItemConsumerDelete(input: { id: $id }) { errors } }",
      mutationVariables: pulumi
        .all([existing, projectId])
        .apply(([id, project]) => ({
          itemId,
          projectId: project,
          version,
          ...(id === undefined ? {} : { id }),
        })),
      readQuery:
        "query($id: AiCatalogItemConsumerID!) { aiCatalogItemConsumer(id: $id) { id item { id } project { id } } }",
      readQueryVariables: {},
      updateMutation: ADOPT,
    },
    {
      ignoreChanges: ["createMutation", "mutationVariables"],
      provider,
      retainOnDelete: true,
    }
  );
  // The known id when the flow is already enabled, so a preview shows its
  // trigger unchanged; otherwise the id the create returned.
  return existing.apply((id) =>
    id === undefined
      ? consumer.computedReadOperationVariables.apply((v) =>
          must(v.id, `consumer id of ${name}`)
        )
      : pulumi.output(id)
  );
};

// The service account a custom flow's trigger runs as: GitLab sets it to the
// account it provisioned when the flow was enabled.
const triggerAccount = (trigger: graphql.Mutation) =>
  query<{
    project: { aiFlowTriggers: { nodes: { user: { username: string } }[] } };
  }>(
    "query($path: ID!, $id: AiFlowTriggerID!) { project(fullPath: $path) { aiFlowTriggers(ids: [$id]) { nodes { user { username } } } } }",
    {
      id: trigger.computedReadOperationVariables.apply((v) =>
        must(v.id, "flow trigger id")
      ),
      path: projectPath,
    }
  ).apply((d) =>
    must(d.project.aiFlowTriggers.nodes[0]?.user.username, "trigger account")
  );

// DUO_<NAME>_ACCOUNT for each custom flow (duo-heal: DUO_HEAL_ACCOUNT), the
// account's username as GitLab created it. index.ts sets each one as a CI
// variable: the ops job assigns heal issues to DUO_HEAL_ACCOUNT, and whatever
// asks a flow for a review reads that flow's variable, so no name is guessed.
export const duoFlowAccounts: Record<string, pulumi.Output<string>> = {};

// Human-action events only: a `scheduled` trigger runs as a dedicated service
// account that GitLab creates in the project on the fly, which needs
// create_service_account (Maintainer), so our role gets "you do not have
// permission" and no trigger.
for (const f of customFlows) {
  const synced = mapping.flows?.[f.file];
  if (synced === undefined) {
    // Not synced yet: the next pipeline on main syncs it and records its id.
    continue;
  }
  const itemId = synced.catalog_id;
  const version = must(
    synced.latest_sync?.catalog_version,
    `catalog version of ${f.file} in mapping.json`
  );
  const trigger = flowTrigger(f.name, {
    ...f,
    consumerId: enableFlow(`${f.name}-consumer`, itemId, version),
  });
  const key = `${f.name.replaceAll("-", "_").toUpperCase()}_ACCOUNT`;
  duoFlowAccounts[key] = triggerAccount(trigger);
}

// Custom agents are enabled here; GitLab adds the top-level group's consumer
// for them. Kept on delete: a create that GitLab refuses returns no id, and a
// later delete with no id would stop `pulumi up`. An agent already enabled
// keeps its consumer when the mutation's text or version changes
// (ignoreChanges): with forceReplace, any change would re-create it.
for (const a of customAgents) {
  const synced = mapping.agents?.[a.file];
  if (synced === undefined) {
    continue;
  }
  const itemId = synced.catalog_id;
  const version = must(
    synced.latest_sync?.catalog_version,
    `catalog version of ${a.file} in mapping.json`
  );
  const create = `mutation($itemId: AiCatalogItemID!, $projectId: ProjectID!, $version: AiCatalogPinnedVersion!) { ${CREATE_CONSUMER} }`;
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
      mutationVariables: { itemId, projectId, version },
      readQuery:
        "query($id: AiCatalogItemConsumerID!) { aiCatalogItemConsumer(id: $id) { id item { id } project { id } } }",
      readQueryVariables: {},
      updateMutation: create,
    },
    {
      ignoreChanges: ["createMutation", "mutationVariables", "updateMutation"],
      provider,
      retainOnDelete: true,
    }
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

// PostHog's destinations (infra/posthog/signals.tf) start the ops pipeline
// with this token, which can only run a pipeline; the ops job then reads
// PostHog itself. index.ts hands it to the posthog:plan job as a CI variable.
// A trigger token needs Maintainer, so it's opt-in, applied by a Maintainer
// (infra/README.md): `pulumi config set wovain:posthogTrigger true`.
export const posthogTrigger =
  config.getBoolean("posthogTrigger") === true
    ? new gitlab.PipelineTrigger("posthog", {
        description: "PostHog signals start wovain ops (infra/posthog)",
        project: projectNumber,
      })
    : undefined;

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
  "kpi::missed": {
    color: "#e67e22",
    description:
      "A shipped kpi-scout change whose PostHog KPI alert still fires a week after the merge",
  },
  "kpi::verified": {
    color: "#2da160",
    description:
      "PostHog confirmed the shipped kpi-scout change: its KPI alert stopped firing",
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
