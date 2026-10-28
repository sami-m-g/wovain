// wovain's PostHog project as code, with PostHog's official Terraform provider
// bridged into Pulumi (`pulumi package add terraform-provider posthog/posthog`;
// `pulumi install` generates sdks/posthog). The provider reads the stack
// config posthog:apiKey (a personal API key, secret) and posthog:projectId.
//   - an insight and an alert per KPI in kpis.yml
//   - the "wovain health" dashboard and the Growth, Retention, Agent quality
//     and cost, and Web vitals dashboards with their insights (./dashboards.ts)
//   - the run-rating survey
//   - the project settings: cookieless hashing, no stored IPs, and the default
//     filters that leave out the team, dev traffic and bots
//   - the app's feature flags, from flags.json
// Objects first created through PostHog's API are adopted once with
// `pulumi import --file posthog/import.json` (infra/README.md, "PostHog").
import { readFileSync } from "node:fs";

import * as posthog from "@pulumi/posthog";
import * as pulumi from "@pulumi/pulumi";
import { parse } from "yaml";

import {
  DASHBOARDS,
  HEALTH_DASHBOARD,
  HEALTH_INSIGHTS,
  KPI_DASHBOARDS,
  QUERY_INSIGHTS,
  SQL_INSIGHTS,
} from "./dashboards.ts";
import type { DashboardKey } from "./dashboards.ts";

const read = (file: string) =>
  readFileSync(new URL(file, import.meta.url), "utf-8");

interface Kpi {
  direction: "up" | "down";
  id: string;
  name: string;
  source: { kind: string; query?: string };
  target: number;
  unit: string;
  why: string;
}

interface FlagCondition {
  internal: boolean;
  properties: Record<string, unknown>[];
  rollout_percentage: number;
}

// Written by packages/core/src/flag-posthog.test.ts from the typed registry
// (packages/core/src/flag-registry.ts); a test fails while they differ.
interface FlagRegistry {
  flags: Record<
    string,
    { active: boolean; groups: FlagCondition[]; name: string; tags: string[] }
  >;
  internal_user_id: string;
}

// PostHog's default "Internal / Test users" cohort: people with
// $internal_or_test_user set. PostHog created it with the project.
const INTERNAL_COHORT_ID = 663_838;

// The founder, who subscribed the first alerts.
const DEFAULT_ALERT_SUBSCRIBERS = [413_837];

const numericId = (resource: pulumi.CustomResource) =>
  resource.id.apply(Number);

// wovain's PostHog organization, which every environment's project is in.
const ORGANIZATION_ID = "019c4bfe-a649-0000-5b0f-2266161045fc";

// An environment's own PostHog project (dev, next), so its events, replays
// and errors never mix with production's. It has none of production's
// dashboards or flags: without a POSTHOG_SECRET_KEY the app's flag registry
// answers (packages/core/src/flags.ts). Its public token is apiToken.
export const environmentProject = (name: string) =>
  new posthog.Project(
    `project-${name}`,
    {
      name: `wovain ${name}`,
      organizationId: ORGANIZATION_ID,
      timezone: "UTC",
    },
    { protect: true }
  );

export const configurePostHog = () => {
  const config = new pulumi.Config();
  const posthogConfig = new pulumi.Config("posthog");
  const host = posthogConfig.get("host") ?? "https://us.posthog.com";
  const projectId = posthogConfig.require("projectId");
  // PostHog user IDs that get the KPI alert emails.
  const alertSubscribers =
    config.getObject<number[]>("posthogAlertSubscribers") ??
    DEFAULT_ALERT_SUBSCRIBERS;
  // The team's Better Auth user IDs, which every internal and percent
  // rollout includes.
  const internalUserIds =
    config.getObject<string[]>("posthogInternalUserIds") ?? [];

  // Project settings that decide what wovain's analytics count and keep.
  // Settings left out here (authorized domains, replay, heatmaps) stay as set
  // in PostHog.
  new posthog.ProjectSettings("wovain", {
    // Never keep a visitor's IP address. Cookieless events lose it before
    // PostHog's GeoIP step, so apps/web's /api/visitor sends their country;
    // consented events keep it only until GeoIP has run.
    anonymizeIps: true,
    // Until a visitor consents, PostHog is cookieless (apps/web/src/lib/
    // analytics-client.ts) and counts them with a daily server-side hash.
    cookielessServerHashMode: 1,
    // "Filter out internal and test users", on by default in every insight,
    // dashboard and web analytics. Cookieless events also lose the user
    // agent, so PostHog's own bot detection ($virt_is_bot) sees every one of
    // them as a bot and can't be used here; the browser marks bots (BotD).
    testAccountFilters: JSON.stringify([
      // Team members are marked in PostHog itself ($internal_or_test_user),
      // never by an email list in the app.
      {
        key: "id",
        operator: "not_in",
        type: "cohort",
        value: INTERNAL_COHORT_ID,
      },
      // Any event not from production (APP_ENV, apps/web/.env.schema).
      {
        key: "environment",
        operator: "is_not",
        type: "event",
        value: ["development", "next"],
      },
      // Headless and automated browsers (BotD).
      {
        key: "bot",
        operator: "is_not_set",
        type: "event",
        value: "is_not_set",
      },
    ]),
    testAccountFiltersDefaultChecked: true,
  });

  const health = new posthog.Dashboard("health", {
    ...HEALTH_DASHBOARD,
    tags: ["wovain"],
  });
  const healthId = numericId(health);
  for (const [key, insight] of Object.entries(HEALTH_INSIGHTS)) {
    new posthog.Insight(`health-${key}`, {
      dashboardIds: [healthId],
      description: insight.description,
      name: insight.name,
      queryJson:
        insight.query === undefined ? undefined : JSON.stringify(insight.query),
      querySql: insight.sql,
      tags: insight.tags,
    });
  }

  const dashboards = Object.fromEntries(
    Object.entries(DASHBOARDS).map(([key, dashboard]) => [
      key,
      new posthog.Dashboard(`dashboard-${key}`, {
        ...dashboard,
        tags: ["wovain", "kpi"],
      }),
    ])
  ) as Record<DashboardKey, posthog.Dashboard>;
  const onDashboards = (keys: DashboardKey[]) =>
    keys.map((key) => numericId(dashboards[key]));

  for (const [key, insight] of Object.entries(QUERY_INSIGHTS)) {
    new posthog.Insight(`insight-${key}`, {
      dashboardIds: onDashboards(insight.dashboards),
      description: insight.description,
      name: insight.name,
      queryJson: JSON.stringify({
        kind: "InsightVizNode",
        source: insight.source,
      }),
      tags: ["wovain", "kpi"],
    });
  }
  for (const [key, insight] of Object.entries(SQL_INSIGHTS)) {
    new posthog.Insight(`insight-${key}`, {
      dashboardIds: onDashboards(insight.dashboards),
      description: insight.description,
      name: insight.name,
      queryJson: JSON.stringify({
        ...(insight.chart === undefined
          ? {}
          : { chartSettings: insight.chart }),
        display: insight.display,
        kind: "DataVisualizationNode",
        source: { kind: "HogQLQuery", query: insight.sql },
      }),
      tags: ["wovain", "kpi"],
    });
  }

  // One SQL insight and one alert per KPI in kpis.yml. Each query returns its
  // value as the first row's `value` column. An alert, named "kpi:<id>",
  // fires while its KPI misses the target and emails the subscribers.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- kpis.yml
  const kpiFile = parse(read("kpis.yml")) as {
    kpis: Kpi[];
    windowDays: number;
  };
  for (const kpi of kpiFile.kpis) {
    if (kpi.source.kind !== "posthog" || kpi.source.query === undefined) {
      continue;
    }
    const comparison = kpi.direction === "up" ? ">=" : "<=";
    const insight = new posthog.Insight(`kpi-${kpi.id}`, {
      dashboardIds: [healthId, ...onDashboards(KPI_DASHBOARDS[kpi.id] ?? [])],
      description: `${kpi.why} Target ${comparison} ${kpi.target} ${kpi.unit}, from infra/posthog/kpis.yml.`,
      name: `KPI: ${kpi.name}`,
      querySql: kpi.source.query.replaceAll(
        "{windowDays}",
        String(kpiFile.windowDays)
      ),
      tags: ["wovain", "kpi"],
    });
    new posthog.Alert(`kpi-${kpi.id}`, {
      calculationInterval: "daily",
      column: "value",
      conditionType: "absolute_value",
      evaluation: "first_row",
      insight: numericId(insight),
      name: `kpi:${kpi.id}`,
      subscribedUsers: alertSubscribers,
      thresholdLower: kpi.direction === "up" ? kpi.target : undefined,
      thresholdType: "absolute",
      thresholdUpper: kpi.direction === "down" ? kpi.target : undefined,
    });
  }

  // One rating question after a run, shown on the dashboard to signed-in
  // merchants. Created as a draft: a person launches it in PostHog. Its
  // average is the merchant-rating KPI (kpis.yml).
  new posthog.Survey("run-rating", {
    conditionsJson: JSON.stringify({
      url: "/dashboard",
      urlMatchType: "icontains",
    }),
    description: "How useful a run was, 1 to 5. Managed in infra/posthog.",
    name: "Run rating",
    questionsJson: JSON.stringify([
      {
        display: "number",
        id: "rating",
        lowerBoundLabel: "Not useful",
        question: "How useful was this run?",
        scale: 5,
        type: "rating",
        upperBoundLabel: "Very useful",
      },
    ]),
    schedule: "once",
    type: "popover",
  });

  // wovain's feature flags (docs/adr/0001-progressive-delivery.md). Each
  // condition matches only what the app passes to the SDK's local evaluation
  // (packages/core/src/flags.ts): `environment`, `plan`, and the user ID as
  // `distinct_id`. A condition marked `internal` is the team.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- flags.json
  const registry = JSON.parse(read("flags.json")) as FlagRegistry;
  const team = {
    key: "distinct_id",
    operator: "exact",
    type: "person",
    value: [...new Set([registry.internal_user_id, ...internalUserIds])],
  };
  for (const [key, flag] of Object.entries(registry.flags)) {
    new posthog.FeatureFlag(
      `flag-${key}`,
      {
        // Status is set once at creation and then ignored: it is the kill
        // switch, which people flip in PostHog without drift.
        active: flag.active,
        // Server-side local evaluation needs both: experience continuity
        // can't be evaluated locally, and the app passes no device ID.
        bucketingIdentifier: "distinct_id",
        ensureExperienceContinuity: false,
        evaluationRuntime: "server",
        filters: JSON.stringify({
          groups: flag.groups.map((group) => ({
            properties: group.internal
              ? [...group.properties, team]
              : group.properties,
            rollout_percentage: group.rollout_percentage,
          })),
        }),
        key,
        name: flag.name,
        tags: flag.tags,
      },
      { ignoreChanges: ["active"] }
    );
  }

  return pulumi.interpolate`${host}/project/${projectId}/dashboard/${health.id}`;
};
