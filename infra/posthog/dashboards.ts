// The insights on wovain's PostHog dashboards, as data: ./program.ts creates
// them. The product dashboards are Growth, Retention, Agent quality and cost,
// and Web vitals; "wovain health" holds the KPI tiles plus the funnel, client
// errors, web vitals, rage and dead clicks, and Nemotron's cost and latency
// per run and per step (PostHog LLM analytics, packages/core). The provider
// has no text tiles, so each dashboard's description carries its explanation.
// The events the agent-quality tiles wait on (run_completed, run_failed,
// agent_score, $ai_generation) are named in each insight's description; the
// tiles stay empty until they ship.

const MANAGED =
  "Managed in infra/posthog; edits in the UI are overwritten by `pulumi up`.";

export const PRODUCTION = "properties.environment = 'production'";

export type DashboardKey = "growth" | "retention" | "agent" | "web";

export const DASHBOARDS: Record<
  DashboardKey,
  { description: string; name: string; pinned: boolean }
> = {
  agent: {
    description: `Run success, approval rate, run time, Mastra scores and LLM cost per run. Tiles wait on run_completed, run_failed, agent_score and $ai_generation. ${MANAGED}`,
    name: "Agent quality and cost",
    pinned: false,
  },
  growth: {
    description: `Visit to paid funnel, activation and traffic. North Star: activated merchants per week, those who approve a design (design_approved) within 7 days of sign-up. Funnel steps campaign_activated and subscription_started, and the revenue tiles, wait on events not yet captured. ${MANAGED}`,
    name: "Growth",
    pinned: true,
  },
  retention: {
    description: `Weekly retention of merchants, overall and by core action; stickiness and lifecycle. Retention is a lagging signal: judge it by cohort after 4+ weeks. ${MANAGED}`,
    name: "Retention",
    pinned: false,
  },
  web: {
    description: `Real-user Core Web Vitals from $web_vitals, production only, at p75: LCP <= 2.5 s, INP <= 200 ms, CLS <= 0.1, FCP <= 1.8 s. Plus client errors and frustrated clicks. ${MANAGED}`,
    name: "Web vitals",
    pinned: false,
  },
};

export const HEALTH_DASHBOARD = {
  description: `The view of production: KPIs, funnel, errors, web vitals and LLM cost. ${MANAGED}`,
  name: "wovain health",
  pinned: true,
};

// KPIs (kpis.yml) charted on a product dashboard besides "wovain health".
export const KPI_DASHBOARDS: Partial<Record<string, DashboardKey[]>> = {
  "activation-cohort": ["growth"],
  "client-errors": ["web"],
  "design-approval-rate": ["agent"],
  "field-lcp": ["web"],
  "frustrated-clicks": ["web"],
  "llm-cost-per-run": ["agent"],
  "run-success-rate": ["agent"],
};

const prodProperties = [
  { key: "environment", operator: "exact", type: "event", value: "production" },
];
const prodRange = { date_from: "-90d", explicitDate: false };
const last = (days: number) => ({
  date_from: `-${days}d`,
  explicitDate: false,
});
const events = (event: string, name: string) => ({
  event,
  kind: "EventsNode",
  name,
});

interface QueryInsight {
  dashboards: DashboardKey[];
  description: string;
  name: string;
  source: Record<string, unknown>;
}

// Insights built with PostHog's query nodes (an InsightVizNode each).
export const QUERY_INSIGHTS: Record<string, QueryInsight> = {
  activation_funnel: {
    dashboards: ["growth"],
    description:
      "North Star input. Share of sign-ups who approve a design within 7 days.",
    name: "Activation: sign-up to approved design within 7 days",
    source: {
      dateRange: prodRange,
      funnelsFilter: {
        funnelVizType: "steps",
        funnelWindowInterval: 7,
        funnelWindowIntervalUnit: "day",
      },
      kind: "FunnelsQuery",
      properties: prodProperties,
      series: [
        events("sign_up", "Sign up"),
        events("run_started", "Run started"),
        events("design_approved", "Design approved"),
      ],
    },
  },
  cta_clicks: {
    dashboards: ["growth"],
    description: "Which landing call-to-action drives visitors toward sign-up.",
    name: "Landing CTA clicks by CTA",
    source: {
      breakdownFilter: { breakdown: "cta", breakdown_type: "event" },
      dateRange: prodRange,
      interval: "week",
      kind: "TrendsQuery",
      properties: prodProperties,
      series: [
        { event: "landing_cta_clicked", kind: "EventsNode", math: "total" },
      ],
      trendsFilter: { display: "ActionsBarValue" },
    },
  },
  funnel_visit_to_campaign: {
    dashboards: ["growth"],
    description:
      "Visit, sign up, connect, run, approve, publish, paused campaign. Server steps appear as events ship.",
    name: "Funnel: visit to campaign (30d)",
    source: {
      dateRange: last(30),
      funnelsFilter: {
        funnelVizType: "steps",
        funnelWindowInterval: 30,
        funnelWindowIntervalUnit: "day",
      },
      kind: "FunnelsQuery",
      properties: prodProperties,
      series: [
        events("$pageview", "Visit"),
        events("sign_up", "Sign up"),
        events("connect_provider", "Connect provider"),
        events("run_started", "Run started"),
        events("design_approved", "Design approved"),
        events("product_published", "Products published"),
        events("campaign_created", "Paused campaign"),
      ],
    },
  },
  lifecycle: {
    dashboards: ["retention"],
    description:
      "New, returning, resurrecting and dormant merchants, by weekly pageview activity.",
    name: "Lifecycle of active merchants (weekly)",
    source: {
      dateRange: prodRange,
      interval: "week",
      kind: "LifecycleQuery",
      properties: prodProperties,
      series: [{ event: "$pageview", kind: "EventsNode", math: "total" }],
    },
  },
  llm_cost_by_model: {
    dashboards: ["agent"],
    description: "Total $ai_total_cost_usd by $ai_model.",
    name: "LLM cost by model (daily, USD)",
    source: {
      breakdownFilter: { breakdown: "$ai_model", breakdown_type: "event" },
      dateRange: last(30),
      interval: "day",
      kind: "TrendsQuery",
      properties: prodProperties,
      series: [
        {
          event: "$ai_generation",
          kind: "EventsNode",
          math: "sum",
          math_property: "$ai_total_cost_usd",
        },
      ],
      trendsFilter: { aggregationAxisPrefix: "$", display: "ActionsBar" },
    },
  },
  mastra_scores: {
    dashboards: ["agent"],
    description:
      "Average Mastra scorer value (0-1) per scorer, from agent_score events. Waits on agent_score.",
    name: "Mastra scores by scorer (weekly average)",
    source: {
      breakdownFilter: { breakdown: "scorer", breakdown_type: "event" },
      dateRange: prodRange,
      interval: "week",
      kind: "TrendsQuery",
      properties: prodProperties,
      series: [
        {
          event: "agent_score",
          kind: "EventsNode",
          math: "avg",
          math_property: "score",
        },
      ],
      trendsFilter: { display: "ActionsLineGraph" },
    },
  },
  provider_connections: {
    dashboards: ["growth"],
    description:
      "Connected Fourthwall, fal, Meta per week (connect_provider.provider).",
    name: "Provider connections by provider",
    source: {
      breakdownFilter: { breakdown: "provider", breakdown_type: "event" },
      dateRange: prodRange,
      interval: "week",
      kind: "TrendsQuery",
      properties: prodProperties,
      series: [{ event: "connect_provider", kind: "EventsNode", math: "dau" }],
      trendsFilter: { display: "ActionsBar" },
    },
  },
  run_retention: {
    dashboards: ["retention"],
    description:
      "Core-action retention: merchants who start a run and start another in later weeks. Waits on run_started data.",
    name: "Weekly retention: run started to run started",
    source: {
      dateRange: last(60),
      kind: "RetentionQuery",
      properties: prodProperties,
      retentionFilter: {
        period: "Week",
        retentionType: "retention_first_time",
        returningEntity: { id: "run_started", type: "events" },
        targetEntity: { id: "run_started", type: "events" },
        totalIntervals: 9,
      },
    },
  },
  signup_retention: {
    dashboards: ["retention"],
    description:
      "Merchants who signed up and come back to the app in later weeks (any pageview).",
    name: "Weekly retention: sign-up to return visit",
    source: {
      dateRange: last(60),
      kind: "RetentionQuery",
      properties: prodProperties,
      retentionFilter: {
        period: "Week",
        retentionType: "retention_first_time",
        returningEntity: { id: "$pageview", type: "events" },
        targetEntity: { id: "sign_up", type: "events" },
        totalIntervals: 9,
      },
    },
  },
  stickiness: {
    dashboards: ["retention"],
    description:
      "How many days in a week merchants start a run. Waits on run_started data.",
    name: "Runs per active merchant per week (stickiness)",
    source: {
      dateRange: last(60),
      interval: "week",
      kind: "StickinessQuery",
      properties: prodProperties,
      series: [{ event: "run_started", kind: "EventsNode", math: "total" }],
    },
  },
  top_referrers: {
    dashboards: ["growth"],
    description:
      "Which sites send the most visitors, like search, social and direct.",
    name: "Top referrers",
    source: {
      breakdownFilter: {
        breakdown: "$referring_domain",
        breakdown_type: "event",
      },
      dateRange: last(7),
      interval: "day",
      kind: "TrendsQuery",
      properties: prodProperties,
      series: [{ event: "$pageview", kind: "EventsNode", math: "dau" }],
      trendsFilter: { display: "ActionsBarValue" },
    },
  },
  weekly_signups: {
    dashboards: ["growth"],
    description:
      "Unique users who signed up vs. who approved a design, per week. The North Star trend: activated merchants.",
    name: "Weekly sign-ups and activated merchants",
    source: {
      dateRange: prodRange,
      interval: "week",
      kind: "TrendsQuery",
      properties: prodProperties,
      series: [
        {
          custom_name: "Sign-ups",
          event: "sign_up",
          kind: "EventsNode",
          math: "dau",
        },
        {
          custom_name: "Merchants approving a design",
          event: "design_approved",
          kind: "EventsNode",
          math: "dau",
        },
        {
          custom_name: "Merchants publishing products",
          event: "product_published",
          kind: "EventsNode",
          math: "dau",
        },
      ],
      trendsFilter: { display: "ActionsLineGraph" },
    },
  },
  weekly_visitors: {
    dashboards: ["growth", "retention"],
    description:
      "Unique people with a pageview each week. Smooths out daily noise to show the underlying trend.",
    name: "Weekly active visitors",
    source: {
      dateRange: prodRange,
      interval: "week",
      kind: "TrendsQuery",
      properties: prodProperties,
      series: [{ event: "$pageview", kind: "EventsNode", math: "dau" }],
      trendsFilter: { display: "ActionsLineGraph" },
    },
  },
};

interface SqlInsight {
  // DataVisualizationNode chart settings; omitted when undefined.
  chart?: Record<string, unknown>;
  dashboards: DashboardKey[];
  description: string;
  display: string;
  name: string;
  sql: string;
}

const percent = { formatting: { style: "percent" } };

// HogQL insights charted with DataVisualizationNode (chart settings kept).
export const SQL_INSIGHTS: Record<string, SqlInsight> = {
  approval_rate: {
    chart: {
      xAxis: { column: "week" },
      yAxis: [{ column: "approval_rate", settings: percent }],
    },
    dashboards: ["agent"],
    description:
      "Merchants who approved a design per merchant who started a run. Proxy until design_generated and design_rejected ship.",
    display: "ActionsLineGraph",
    name: "Design approval rate (weekly)",
    sql: `SELECT toStartOfWeek(timestamp) AS week, uniqIf(person_id, event = 'design_approved') / nullIf(uniqIf(person_id, event = 'run_started'), 0) AS approval_rate FROM events WHERE event IN ('design_approved', 'run_started') AND ${PRODUCTION} AND timestamp > now() - INTERVAL 90 DAY GROUP BY week ORDER BY week`,
  },
  cls_daily: {
    chart: {
      goalLines: [{ label: "Good", value: 0.1 }],
      xAxis: { column: "day" },
      yAxis: [{ column: "cls_p75" }],
    },
    dashboards: ["web"],
    description: "p75 of CLS from $web_vitals. Good: <= 0.1.",
    display: "ActionsLineGraph",
    name: "Cumulative Layout Shift p75 (daily)",
    sql: `SELECT toStartOfDay(timestamp) AS day, quantile(0.75)(toFloat(properties.$web_vitals_CLS_value)) AS cls_p75 FROM events WHERE event = '$web_vitals' AND ${PRODUCTION} AND timestamp > now() - INTERVAL 30 DAY GROUP BY day ORDER BY day`,
  },
  errors_and_frustration: {
    chart: {
      xAxis: { column: "week" },
      yAxis: [
        { column: "exceptions_per_1k" },
        { column: "frustrated_clicks_per_1k" },
      ],
    },
    dashboards: ["web"],
    description:
      "$exception and rage/dead clicks per 1,000 pageviews. Targets: errors <= 5, frustrated clicks <= 10 (kpis.yml).",
    display: "ActionsLineGraph",
    name: "Client errors and frustrated clicks per 1,000 pageviews (weekly)",
    sql: `SELECT toStartOfWeek(timestamp) AS week, countIf(event = '$exception') * 1000 / nullIf(countIf(event = '$pageview'), 0) AS exceptions_per_1k, countIf(event IN ('$rageclick', '$dead_click')) * 1000 / nullIf(countIf(event = '$pageview'), 0) AS frustrated_clicks_per_1k FROM events WHERE event IN ('$exception', '$rageclick', '$dead_click', '$pageview') AND ${PRODUCTION} AND timestamp > now() - INTERVAL 90 DAY GROUP BY week ORDER BY week`,
  },
  llm_cost_per_run_weekly: {
    chart: {
      xAxis: { column: "week" },
      yAxis: [
        {
          column: "cost_per_run",
          settings: { formatting: { decimalPlaces: 4, prefix: "$" } },
        },
      ],
    },
    dashboards: ["agent"],
    description:
      "Sum of $ai_total_cost_usd per distinct $ai_trace_id from LLM analytics. Same definition as the llm-cost-per-run KPI.",
    display: "ActionsLineGraph",
    name: "LLM cost per run (weekly, USD)",
    sql: `SELECT toStartOfWeek(timestamp) AS week, sum(toFloat(properties.$ai_total_cost_usd)) / nullIf(uniq(properties.$ai_trace_id), 0) AS cost_per_run FROM events WHERE event = '$ai_generation' AND ${PRODUCTION} AND timestamp > now() - INTERVAL 90 DAY GROUP BY week ORDER BY week`,
  },
  run_duration: {
    chart: {
      xAxis: { column: "week" },
      yAxis: [{ column: "p50_s" }, { column: "p95_s" }],
    },
    dashboards: ["agent"],
    description:
      "From run_completed.duration_ms, in seconds. Waits on run_completed.",
    display: "ActionsLineGraph",
    name: "Run duration p50 and p95 (weekly)",
    sql: `SELECT toStartOfWeek(timestamp) AS week, quantile(0.5)(toFloat(properties.duration_ms)) / 1000 AS p50_s, quantile(0.95)(toFloat(properties.duration_ms)) / 1000 AS p95_s FROM events WHERE event = 'run_completed' AND ${PRODUCTION} AND timestamp > now() - INTERVAL 90 DAY GROUP BY week ORDER BY week`,
  },
  run_success_weekly: {
    chart: {
      xAxis: { column: "week" },
      yAxis: [{ column: "success_rate", settings: percent }],
    },
    dashboards: ["agent"],
    description:
      "run_completed / (run_completed + run_failed). Waits on those events.",
    display: "ActionsLineGraph",
    name: "Run success rate (weekly)",
    sql: `SELECT toStartOfWeek(timestamp) AS week, countIf(event = 'run_completed') / nullIf(count(), 0) AS success_rate FROM events WHERE event IN ('run_completed', 'run_failed') AND ${PRODUCTION} AND timestamp > now() - INTERVAL 90 DAY GROUP BY week ORDER BY week`,
  },
  vitals_by_page: {
    dashboards: ["web"],
    description:
      "Slowest pages first: LCP, INP, CLS p75 per pathname with sample sizes.",
    display: "ActionsTable",
    name: "Web vitals p75 by page (30d)",
    sql: `SELECT properties.$pathname AS page, quantile(0.75)(toFloat(properties.$web_vitals_LCP_value)) AS lcp_p75_ms, quantile(0.75)(toFloat(properties.$web_vitals_INP_value)) AS inp_p75_ms, quantile(0.75)(toFloat(properties.$web_vitals_CLS_value)) AS cls_p75, count() AS samples FROM events WHERE event = '$web_vitals' AND ${PRODUCTION} AND timestamp > now() - INTERVAL 30 DAY GROUP BY page ORDER BY lcp_p75_ms DESC LIMIT 20`,
  },
  vitals_daily: {
    chart: {
      goalLines: [{ label: "LCP good", value: 2500 }],
      xAxis: { column: "day" },
      yAxis: [
        { column: "lcp_p75_ms" },
        { column: "inp_p75_ms" },
        { column: "fcp_p75_ms" },
      ],
    },
    dashboards: ["web"],
    description:
      "p75 of LCP (ms), INP (ms), FCP (ms) from $web_vitals, production only. Good: LCP <= 2500, INP <= 200, FCP <= 1800.",
    display: "ActionsLineGraph",
    name: "Field Core Web Vitals p75 (daily)",
    sql: `SELECT toStartOfDay(timestamp) AS day, quantile(0.75)(toFloat(properties.$web_vitals_LCP_value)) AS lcp_p75_ms, quantile(0.75)(toFloat(properties.$web_vitals_INP_value)) AS inp_p75_ms, quantile(0.75)(toFloat(properties.$web_vitals_FCP_value)) AS fcp_p75_ms FROM events WHERE event = '$web_vitals' AND ${PRODUCTION} AND timestamp > now() - INTERVAL 30 DAY GROUP BY day ORDER BY day`,
  },
};

interface HealthInsight {
  description?: string;
  name: string;
  query?: Record<string, unknown>;
  sql?: string;
  tags: string[];
}

const lines = (...parts: string[]) => `${parts.join("\n")}\n`;

// The "wovain health" dashboard's own insights (the KPI tiles join it too).
export const HEALTH_INSIGHTS: Record<string, HealthInsight> = {
  client_errors: {
    name: "Client errors per 1,000 pageviews",
    sql: lines(
      "SELECT toStartOfDay(timestamp) AS day,",
      "  countIf(event = '$exception') * 1000 / nullIf(countIf(event = '$pageview'), 0) AS errors_per_1000_pageviews",
      "FROM events",
      `WHERE event IN ('$exception', '$pageview') AND ${PRODUCTION}`,
      "  AND timestamp > now() - INTERVAL 30 DAY",
      "GROUP BY day ORDER BY day"
    ),
    tags: ["wovain"],
  },
  frustration: {
    name: "Rage and dead clicks by page",
    sql: lines(
      "SELECT properties.$pathname AS page,",
      "  countIf(event = '$rageclick') AS rage_clicks,",
      "  countIf(event = '$dead_click') AS dead_clicks",
      "FROM events",
      `WHERE event IN ('$rageclick', '$dead_click') AND ${PRODUCTION}`,
      "  AND timestamp > now() - INTERVAL 7 DAY",
      "GROUP BY page ORDER BY rage_clicks + dead_clicks DESC LIMIT 10"
    ),
    tags: ["wovain"],
  },
  funnel: {
    description:
      "Visit to paused campaign, the steps apps/web and packages/api capture.",
    name: "Merchant funnel",
    query: {
      kind: "InsightVizNode",
      source: {
        dateRange: { date_from: "-30d" },
        funnelsFilter: {
          funnelWindowInterval: 14,
          funnelWindowIntervalUnit: "day",
        },
        kind: "FunnelsQuery",
        properties: prodProperties,
        series: [
          "$pageview",
          "sign_up",
          "run_started",
          "design_approved",
          "product_published",
          "campaign_created",
        ].map((event) => events(event, event)),
      },
    },
    tags: ["wovain"],
  },
  llm_per_run: {
    description:
      "One $ai_trace_id per run (packages/core/src/nemotron.ts); Nebius list prices.",
    name: "Nemotron cost and latency per run",
    sql: lines(
      "SELECT toStartOfDay(timestamp) AS day,",
      "  uniq(properties.$ai_trace_id) AS runs,",
      "  sum(toFloat(properties.$ai_total_cost_usd)) / nullIf(uniq(properties.$ai_trace_id), 0) AS usd_per_run,",
      "  sum(toFloat(properties.$ai_latency)) / nullIf(uniq(properties.$ai_trace_id), 0) AS model_seconds_per_run",
      "FROM events",
      `WHERE event = '$ai_generation' AND ${PRODUCTION}`,
      "  AND timestamp > now() - INTERVAL 30 DAY",
      "GROUP BY day ORDER BY day"
    ),
    tags: ["wovain", "nebius"],
  },
  llm_per_step: {
    description:
      "Calls, tokens, cost, p95 latency and errors by step (brief, judge, ad copy, autopilot).",
    name: "Nemotron per step",
    sql: lines(
      "SELECT properties.$ai_span_name AS step,",
      "  count() AS calls,",
      "  avg(toFloat(properties.$ai_input_tokens) + toFloat(properties.$ai_output_tokens)) AS avg_tokens,",
      "  sum(toFloat(properties.$ai_total_cost_usd)) AS usd,",
      "  quantile(0.95)(toFloat(properties.$ai_latency)) AS p95_seconds,",
      "  countIf(toString(properties.$ai_is_error) = 'true') AS errors",
      "FROM events",
      `WHERE event = '$ai_generation' AND ${PRODUCTION}`,
      "  AND timestamp > now() - INTERVAL 7 DAY",
      "GROUP BY step ORDER BY usd DESC"
    ),
    tags: ["wovain", "nebius"],
  },
  web_vitals: {
    name: "Web vitals p75 (field data)",
    sql: lines(
      "SELECT toStartOfDay(timestamp) AS day,",
      "  quantile(0.75)(toFloat(properties.$web_vitals_LCP_value)) AS lcp_ms,",
      "  quantile(0.75)(toFloat(properties.$web_vitals_INP_value)) AS inp_ms,",
      "  quantile(0.75)(toFloat(properties.$web_vitals_CLS_value)) AS cls",
      "FROM events",
      `WHERE event = '$web_vitals' AND ${PRODUCTION}`,
      "  AND timestamp > now() - INTERVAL 30 DAY",
      "GROUP BY day ORDER BY day"
    ),
    tags: ["wovain"],
  },
};
