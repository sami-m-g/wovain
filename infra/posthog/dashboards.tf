# The product dashboards: Growth, Retention, Agent quality and cost, and Web
# vitals. The KPI insights and alerts in kpis.tf join them through
# local.kpi_dashboards, so each KPI's chart sits next to its context. The
# provider has no text tiles; each dashboard's description carries its
# explanation instead. The events the agent-quality tiles wait on
# (run_completed, run_failed, agent_score, $ai_generation) are named in each
# insight's description; the tiles stay empty until they ship.

locals {
  dashboards = {
    growth = {
      name        = "Growth"
      description = "Visit to paid funnel, activation and traffic. North Star: activated merchants per week, those who approve a design (design_approved) within 7 days of sign-up. Funnel steps campaign_activated and subscription_started, and the revenue tiles, wait on events not yet captured. Managed in infra/posthog; edits in the UI are overwritten."
      pinned      = true
    }
    retention = {
      name        = "Retention"
      description = "Weekly retention of merchants, overall and by core action; stickiness and lifecycle. Retention is a lagging signal: judge it by cohort after 4+ weeks. Managed in infra/posthog; edits in the UI are overwritten."
      pinned      = false
    }
    agent = {
      name        = "Agent quality and cost"
      description = "Run success, approval rate, run time, Mastra scores and LLM cost per run. Tiles wait on run_completed, run_failed, agent_score and $ai_generation. Managed in infra/posthog; edits in the UI are overwritten."
      pinned      = false
    }
    web = {
      name        = "Web vitals"
      description = "Real-user Core Web Vitals from $web_vitals, production only, at p75: LCP <= 2.5 s, INP <= 200 ms, CLS <= 0.1, FCP <= 1.8 s. Plus client errors and frustrated clicks. Managed in infra/posthog; edits in the UI are overwritten."
      pinned      = false
    }
  }

  # KPIs (kpis.yml) charted on a dashboard besides "wovain health".
  kpi_dashboards = {
    activation-cohort    = ["growth"]
    run-success-rate     = ["agent"]
    design-approval-rate = ["agent"]
    llm-cost-per-run     = ["agent"]
    field-lcp            = ["web"]
    client-errors        = ["web"]
    frustrated-clicks    = ["web"]
  }

  prod_properties = [{
    key = "environment", value = "production", operator = "exact", type = "event"
  }]
  prod_range = { date_from = "-90d", explicitDate = false }

  # Insights built with PostHog's query nodes (query_json).
  query_insights = {
    funnel_visit_to_campaign = {
      dashboards  = ["growth"]
      name        = "Funnel: visit to campaign (30d)"
      description = "Visit, sign up, connect, run, approve, publish, paused campaign. Server steps appear as events ship."
      query = {
        kind = "InsightVizNode"
        source = {
          kind       = "FunnelsQuery"
          dateRange  = { date_from = "-30d", explicitDate = false }
          properties = local.prod_properties
          series = [
            { kind = "EventsNode", event = "$pageview", name = "Visit" },
            { kind = "EventsNode", event = "sign_up", name = "Sign up" },
            { kind = "EventsNode", event = "connect_provider", name = "Connect provider" },
            { kind = "EventsNode", event = "run_started", name = "Run started" },
            { kind = "EventsNode", event = "design_approved", name = "Design approved" },
            { kind = "EventsNode", event = "product_published", name = "Products published" },
            { kind = "EventsNode", event = "campaign_created", name = "Paused campaign" },
          ]
          funnelsFilter = { funnelVizType = "steps", funnelWindowInterval = 30, funnelWindowIntervalUnit = "day" }
        }
      }
    }
    activation_funnel = {
      dashboards  = ["growth"]
      name        = "Activation: sign-up to approved design within 7 days"
      description = "North Star input. Share of sign-ups who approve a design within 7 days."
      query = {
        kind = "InsightVizNode"
        source = {
          kind       = "FunnelsQuery"
          dateRange  = local.prod_range
          properties = local.prod_properties
          series = [
            { kind = "EventsNode", event = "sign_up", name = "Sign up" },
            { kind = "EventsNode", event = "run_started", name = "Run started" },
            { kind = "EventsNode", event = "design_approved", name = "Design approved" },
          ]
          funnelsFilter = { funnelVizType = "steps", funnelWindowInterval = 7, funnelWindowIntervalUnit = "day" }
        }
      }
    }
    weekly_signups = {
      dashboards  = ["growth"]
      name        = "Weekly sign-ups and activated merchants"
      description = "Unique users who signed up vs. who approved a design, per week. The North Star trend: activated merchants."
      query = {
        kind = "InsightVizNode"
        source = {
          kind       = "TrendsQuery"
          interval   = "week"
          dateRange  = local.prod_range
          properties = local.prod_properties
          series = [
            { kind = "EventsNode", math = "dau", event = "sign_up", custom_name = "Sign-ups" },
            { kind = "EventsNode", math = "dau", event = "design_approved", custom_name = "Merchants approving a design" },
            { kind = "EventsNode", math = "dau", event = "product_published", custom_name = "Merchants publishing products" },
          ]
          trendsFilter = { display = "ActionsLineGraph" }
        }
      }
    }
    cta_clicks = {
      dashboards  = ["growth"]
      name        = "Landing CTA clicks by CTA"
      description = "Which landing call-to-action drives visitors toward sign-up."
      query = {
        kind = "InsightVizNode"
        source = {
          kind            = "TrendsQuery"
          interval        = "week"
          dateRange       = local.prod_range
          properties      = local.prod_properties
          series          = [{ kind = "EventsNode", math = "total", event = "landing_cta_clicked" }]
          trendsFilter    = { display = "ActionsBarValue" }
          breakdownFilter = { breakdown = "cta", breakdown_type = "event" }
        }
      }
    }
    provider_connections = {
      dashboards  = ["growth"]
      name        = "Provider connections by provider"
      description = "Connected Fourthwall, fal, Meta per week (connect_provider.provider)."
      query = {
        kind = "InsightVizNode"
        source = {
          kind            = "TrendsQuery"
          interval        = "week"
          dateRange       = local.prod_range
          properties      = local.prod_properties
          series          = [{ kind = "EventsNode", math = "dau", event = "connect_provider" }]
          trendsFilter    = { display = "ActionsBar" }
          breakdownFilter = { breakdown = "provider", breakdown_type = "event" }
        }
      }
    }
    weekly_visitors = {
      dashboards  = ["growth", "retention"]
      name        = "Weekly active visitors"
      description = "Unique people with a pageview each week. Smooths out daily noise to show the underlying trend."
      query = {
        kind = "InsightVizNode"
        source = {
          kind         = "TrendsQuery"
          interval     = "week"
          dateRange    = local.prod_range
          properties   = local.prod_properties
          series       = [{ kind = "EventsNode", math = "dau", event = "$pageview" }]
          trendsFilter = { display = "ActionsLineGraph" }
        }
      }
    }
    top_referrers = {
      dashboards  = ["growth"]
      name        = "Top referrers"
      description = "Which sites send the most visitors, like search, social and direct."
      query = {
        kind = "InsightVizNode"
        source = {
          kind            = "TrendsQuery"
          interval        = "day"
          dateRange       = { date_from = "-7d", explicitDate = false }
          properties      = local.prod_properties
          series          = [{ kind = "EventsNode", math = "dau", event = "$pageview" }]
          trendsFilter    = { display = "ActionsBarValue" }
          breakdownFilter = { breakdown = "$referring_domain", breakdown_type = "event" }
        }
      }
    }
    signup_retention = {
      dashboards  = ["retention"]
      name        = "Weekly retention: sign-up to return visit"
      description = "Merchants who signed up and come back to the app in later weeks (any pageview)."
      query = {
        kind = "InsightVizNode"
        source = {
          kind       = "RetentionQuery"
          dateRange  = { date_from = "-60d", explicitDate = false }
          properties = local.prod_properties
          retentionFilter = {
            period          = "Week"
            retentionType   = "retention_first_time"
            totalIntervals  = 9
            targetEntity    = { id = "sign_up", type = "events" }
            returningEntity = { id = "$pageview", type = "events" }
          }
        }
      }
    }
    run_retention = {
      dashboards  = ["retention"]
      name        = "Weekly retention: run started to run started"
      description = "Core-action retention: merchants who start a run and start another in later weeks. Waits on run_started data."
      query = {
        kind = "InsightVizNode"
        source = {
          kind       = "RetentionQuery"
          dateRange  = { date_from = "-60d", explicitDate = false }
          properties = local.prod_properties
          retentionFilter = {
            period          = "Week"
            retentionType   = "retention_first_time"
            totalIntervals  = 9
            targetEntity    = { id = "run_started", type = "events" }
            returningEntity = { id = "run_started", type = "events" }
          }
        }
      }
    }
    lifecycle = {
      dashboards  = ["retention"]
      name        = "Lifecycle of active merchants (weekly)"
      description = "New, returning, resurrecting and dormant merchants, by weekly pageview activity."
      query = {
        kind = "InsightVizNode"
        source = {
          kind       = "LifecycleQuery"
          interval   = "week"
          dateRange  = local.prod_range
          properties = local.prod_properties
          series     = [{ kind = "EventsNode", math = "total", event = "$pageview" }]
        }
      }
    }
    stickiness = {
      dashboards  = ["retention"]
      name        = "Runs per active merchant per week (stickiness)"
      description = "How many days in a week merchants start a run. Waits on run_started data."
      query = {
        kind = "InsightVizNode"
        source = {
          kind       = "StickinessQuery"
          interval   = "week"
          dateRange  = { date_from = "-60d", explicitDate = false }
          properties = local.prod_properties
          series     = [{ kind = "EventsNode", math = "total", event = "run_started" }]
        }
      }
    }
    mastra_scores = {
      dashboards  = ["agent"]
      name        = "Mastra scores by scorer (weekly average)"
      description = "Average Mastra scorer value (0-1) per scorer, from agent_score events. Waits on agent_score."
      query = {
        kind = "InsightVizNode"
        source = {
          kind            = "TrendsQuery"
          interval        = "week"
          dateRange       = local.prod_range
          properties      = local.prod_properties
          series          = [{ kind = "EventsNode", math = "avg", math_property = "score", event = "agent_score" }]
          trendsFilter    = { display = "ActionsLineGraph" }
          breakdownFilter = { breakdown = "scorer", breakdown_type = "event" }
        }
      }
    }
    llm_cost_by_model = {
      dashboards  = ["agent"]
      name        = "LLM cost by model (daily, USD)"
      description = "Total $ai_total_cost_usd by $ai_model."
      query = {
        kind = "InsightVizNode"
        source = {
          kind            = "TrendsQuery"
          interval        = "day"
          dateRange       = { date_from = "-30d", explicitDate = false }
          properties      = local.prod_properties
          series          = [{ kind = "EventsNode", math = "sum", math_property = "$ai_total_cost_usd", event = "$ai_generation" }]
          trendsFilter    = { display = "ActionsBar", aggregationAxisPrefix = "$" }
          breakdownFilter = { breakdown = "$ai_model", breakdown_type = "event" }
        }
      }
    }
  }

  # HogQL insights charted with DataVisualizationNode (chart settings kept).
  sql_insights = {
    approval_rate = {
      dashboards  = ["agent"]
      name        = "Design approval rate (weekly)"
      description = "Merchants who approved a design per merchant who started a run. Proxy until design_generated and design_rejected ship."
      display     = "ActionsLineGraph"
      chart = {
        xAxis = { column = "week" }
        yAxis = [{ column = "approval_rate", settings = { formatting = { style = "percent" } } }]
      }
      sql = "SELECT toStartOfWeek(timestamp) AS week, uniqIf(person_id, event = 'design_approved') / nullIf(uniqIf(person_id, event = 'run_started'), 0) AS approval_rate FROM events WHERE event IN ('design_approved', 'run_started') AND ${local.production} AND timestamp > now() - INTERVAL 90 DAY GROUP BY week ORDER BY week"
    }
    run_success_weekly = {
      dashboards  = ["agent"]
      name        = "Run success rate (weekly)"
      description = "run_completed / (run_completed + run_failed). Waits on those events."
      display     = "ActionsLineGraph"
      chart = {
        xAxis = { column = "week" }
        yAxis = [{ column = "success_rate", settings = { formatting = { style = "percent" } } }]
      }
      sql = "SELECT toStartOfWeek(timestamp) AS week, countIf(event = 'run_completed') / nullIf(count(), 0) AS success_rate FROM events WHERE event IN ('run_completed', 'run_failed') AND ${local.production} AND timestamp > now() - INTERVAL 90 DAY GROUP BY week ORDER BY week"
    }
    run_duration = {
      dashboards  = ["agent"]
      name        = "Run duration p50 and p95 (weekly)"
      description = "From run_completed.duration_ms, in seconds. Waits on run_completed."
      display     = "ActionsLineGraph"
      chart = {
        xAxis = { column = "week" }
        yAxis = [{ column = "p50_s" }, { column = "p95_s" }]
      }
      sql = "SELECT toStartOfWeek(timestamp) AS week, quantile(0.5)(toFloat(properties.duration_ms)) / 1000 AS p50_s, quantile(0.95)(toFloat(properties.duration_ms)) / 1000 AS p95_s FROM events WHERE event = 'run_completed' AND ${local.production} AND timestamp > now() - INTERVAL 90 DAY GROUP BY week ORDER BY week"
    }
    llm_cost_per_run_weekly = {
      dashboards  = ["agent"]
      name        = "LLM cost per run (weekly, USD)"
      description = "Sum of $ai_total_cost_usd per distinct $ai_trace_id from LLM analytics. Same definition as the llm-cost-per-run KPI."
      display     = "ActionsLineGraph"
      chart = {
        xAxis = { column = "week" }
        yAxis = [{ column = "cost_per_run", settings = { formatting = { prefix = "$", decimalPlaces = 4 } } }]
      }
      sql = "SELECT toStartOfWeek(timestamp) AS week, sum(toFloat(properties.$ai_total_cost_usd)) / nullIf(uniq(properties.$ai_trace_id), 0) AS cost_per_run FROM events WHERE event = '$ai_generation' AND ${local.production} AND timestamp > now() - INTERVAL 90 DAY GROUP BY week ORDER BY week"
    }
    vitals_daily = {
      dashboards  = ["web"]
      name        = "Field Core Web Vitals p75 (daily)"
      description = "p75 of LCP (ms), INP (ms), FCP (ms) from $web_vitals, production only. Good: LCP <= 2500, INP <= 200, FCP <= 1800."
      display     = "ActionsLineGraph"
      chart = {
        xAxis     = { column = "day" }
        yAxis     = [{ column = "lcp_p75_ms" }, { column = "inp_p75_ms" }, { column = "fcp_p75_ms" }]
        goalLines = [{ label = "LCP good", value = 2500 }]
      }
      sql = "SELECT toStartOfDay(timestamp) AS day, quantile(0.75)(toFloat(properties.$web_vitals_LCP_value)) AS lcp_p75_ms, quantile(0.75)(toFloat(properties.$web_vitals_INP_value)) AS inp_p75_ms, quantile(0.75)(toFloat(properties.$web_vitals_FCP_value)) AS fcp_p75_ms FROM events WHERE event = '$web_vitals' AND ${local.production} AND timestamp > now() - INTERVAL 30 DAY GROUP BY day ORDER BY day"
    }
    cls_daily = {
      dashboards  = ["web"]
      name        = "Cumulative Layout Shift p75 (daily)"
      description = "p75 of CLS from $web_vitals. Good: <= 0.1."
      display     = "ActionsLineGraph"
      chart = {
        xAxis     = { column = "day" }
        yAxis     = [{ column = "cls_p75" }]
        goalLines = [{ label = "Good", value = 0.1 }]
      }
      sql = "SELECT toStartOfDay(timestamp) AS day, quantile(0.75)(toFloat(properties.$web_vitals_CLS_value)) AS cls_p75 FROM events WHERE event = '$web_vitals' AND ${local.production} AND timestamp > now() - INTERVAL 30 DAY GROUP BY day ORDER BY day"
    }
    vitals_by_page = {
      dashboards  = ["web"]
      name        = "Web vitals p75 by page (30d)"
      description = "Slowest pages first: LCP, INP, CLS p75 per pathname with sample sizes."
      display     = "ActionsTable"
      chart       = {}
      sql         = "SELECT properties.$pathname AS page, quantile(0.75)(toFloat(properties.$web_vitals_LCP_value)) AS lcp_p75_ms, quantile(0.75)(toFloat(properties.$web_vitals_INP_value)) AS inp_p75_ms, quantile(0.75)(toFloat(properties.$web_vitals_CLS_value)) AS cls_p75, count() AS samples FROM events WHERE event = '$web_vitals' AND ${local.production} AND timestamp > now() - INTERVAL 30 DAY GROUP BY page ORDER BY lcp_p75_ms DESC LIMIT 20"
    }
    errors_and_frustration = {
      dashboards  = ["web"]
      name        = "Client errors and frustrated clicks per 1,000 pageviews (weekly)"
      description = "$exception and rage/dead clicks per 1,000 pageviews. Targets: errors <= 5, frustrated clicks <= 10 (kpis.yml)."
      display     = "ActionsLineGraph"
      chart = {
        xAxis = { column = "week" }
        yAxis = [{ column = "exceptions_per_1k" }, { column = "frustrated_clicks_per_1k" }]
      }
      sql = "SELECT toStartOfWeek(timestamp) AS week, countIf(event = '$exception') * 1000 / nullIf(countIf(event = '$pageview'), 0) AS exceptions_per_1k, countIf(event IN ('$rageclick', '$dead_click')) * 1000 / nullIf(countIf(event = '$pageview'), 0) AS frustrated_clicks_per_1k FROM events WHERE event IN ('$exception', '$rageclick', '$dead_click', '$pageview') AND ${local.production} AND timestamp > now() - INTERVAL 90 DAY GROUP BY week ORDER BY week"
    }
  }
}

resource "posthog_dashboard" "product" {
  for_each = local.dashboards

  name        = each.value.name
  description = each.value.description
  pinned      = each.value.pinned
  tags        = ["wovain", "kpi"]
}

resource "posthog_insight" "product_query" {
  for_each = local.query_insights

  name          = each.value.name
  description   = each.value.description
  dashboard_ids = [for d in each.value.dashboards : posthog_dashboard.product[d].id]
  tags          = ["wovain", "kpi"]
  query_json    = jsonencode(each.value.query)
}

resource "posthog_insight" "product_sql" {
  for_each = local.sql_insights

  name          = each.value.name
  description   = each.value.description
  dashboard_ids = [for d in each.value.dashboards : posthog_dashboard.product[d].id]
  tags          = ["wovain", "kpi"]
  query_json = jsonencode(merge(
    {
      kind    = "DataVisualizationNode"
      source  = { kind = "HogQLQuery", query = each.value.sql }
      display = each.value.display
    },
    length(each.value.chart) == 0 ? {} : { chartSettings = each.value.chart },
  ))
}
