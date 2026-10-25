# The "wovain health" dashboard: the KPI tiles (kpis.tf) plus the funnel,
# client errors, web vitals, rage and dead clicks, and Nemotron's cost and
# latency per run and per step (PostHog LLM analytics, packages/core).

resource "posthog_dashboard" "health" {
  name        = "wovain health"
  description = "The self-driving loop's view of production (docs/flows.md). Managed in infra/posthog; edits in the UI are overwritten."
  pinned      = true
  tags        = ["wovain"]
}

resource "posthog_insight" "funnel" {
  name          = "Merchant funnel"
  description   = "Visit to paused campaign, the steps apps/web and packages/api capture."
  dashboard_ids = [posthog_dashboard.health.id]
  tags          = ["wovain"]
  query_json = jsonencode({
    kind = "InsightVizNode"
    source = {
      kind      = "FunnelsQuery"
      dateRange = { date_from = "-30d" }
      properties = [{
        key = "environment", value = "production", operator = "exact", type = "event"
      }]
      series = [
        for e in ["$pageview", "sign_up", "run_started", "design_approved", "product_published", "campaign_created"] :
        { kind = "EventsNode", event = e, name = e }
      ]
      funnelsFilter = { funnelWindowInterval = 14, funnelWindowIntervalUnit = "day" }
    }
  })
}

resource "posthog_insight" "client_errors" {
  name          = "Client errors per 1,000 pageviews"
  dashboard_ids = [posthog_dashboard.health.id]
  tags          = ["wovain"]
  query_sql     = <<-SQL
    SELECT toStartOfDay(timestamp) AS day,
      countIf(event = '$exception') * 1000 / nullIf(countIf(event = '$pageview'), 0) AS errors_per_1000_pageviews
    FROM events
    WHERE event IN ('$exception', '$pageview') AND ${local.production}
      AND timestamp > now() - INTERVAL 30 DAY
    GROUP BY day ORDER BY day
  SQL
}

resource "posthog_insight" "web_vitals" {
  name          = "Web vitals p75 (field data)"
  dashboard_ids = [posthog_dashboard.health.id]
  tags          = ["wovain"]
  query_sql     = <<-SQL
    SELECT toStartOfDay(timestamp) AS day,
      quantile(0.75)(toFloat(properties.$web_vitals_LCP_value)) AS lcp_ms,
      quantile(0.75)(toFloat(properties.$web_vitals_INP_value)) AS inp_ms,
      quantile(0.75)(toFloat(properties.$web_vitals_CLS_value)) AS cls
    FROM events
    WHERE event = '$web_vitals' AND ${local.production}
      AND timestamp > now() - INTERVAL 30 DAY
    GROUP BY day ORDER BY day
  SQL
}

resource "posthog_insight" "frustration" {
  name          = "Rage and dead clicks by page"
  dashboard_ids = [posthog_dashboard.health.id]
  tags          = ["wovain"]
  query_sql     = <<-SQL
    SELECT properties.$pathname AS page,
      countIf(event = '$rageclick') AS rage_clicks,
      countIf(event = '$dead_click') AS dead_clicks
    FROM events
    WHERE event IN ('$rageclick', '$dead_click') AND ${local.production}
      AND timestamp > now() - INTERVAL 7 DAY
    GROUP BY page ORDER BY rage_clicks + dead_clicks DESC LIMIT 10
  SQL
}

resource "posthog_insight" "llm_per_run" {
  name          = "Nemotron cost and latency per run"
  description   = "One $ai_trace_id per run (packages/core/src/nemotron.ts); Nebius list prices."
  dashboard_ids = [posthog_dashboard.health.id]
  tags          = ["wovain", "nebius"]
  query_sql     = <<-SQL
    SELECT toStartOfDay(timestamp) AS day,
      uniq(properties.$ai_trace_id) AS runs,
      sum(toFloat(properties.$ai_total_cost_usd)) / nullIf(uniq(properties.$ai_trace_id), 0) AS usd_per_run,
      sum(toFloat(properties.$ai_latency)) / nullIf(uniq(properties.$ai_trace_id), 0) AS model_seconds_per_run
    FROM events
    WHERE event = '$ai_generation' AND ${local.production}
      AND timestamp > now() - INTERVAL 30 DAY
    GROUP BY day ORDER BY day
  SQL
}

resource "posthog_insight" "llm_per_step" {
  name          = "Nemotron per step"
  description   = "Calls, tokens, cost, p95 latency and errors by step (brief, judge, ad copy, autopilot)."
  dashboard_ids = [posthog_dashboard.health.id]
  tags          = ["wovain", "nebius"]
  query_sql     = <<-SQL
    SELECT properties.$ai_span_name AS step,
      count() AS calls,
      avg(toFloat(properties.$ai_input_tokens) + toFloat(properties.$ai_output_tokens)) AS avg_tokens,
      sum(toFloat(properties.$ai_total_cost_usd)) AS usd,
      quantile(0.95)(toFloat(properties.$ai_latency)) AS p95_seconds,
      countIf(toString(properties.$ai_is_error) = 'true') AS errors
    FROM events
    WHERE event = '$ai_generation' AND ${local.production}
      AND timestamp > now() - INTERVAL 7 DAY
    GROUP BY step ORDER BY usd DESC
  SQL
}
