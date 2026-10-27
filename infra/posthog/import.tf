# One-time adoption of the objects first created through PostHog's API
# (2026-10-26): the four dashboards, their insights and the three alerts. The
# first `tofu apply` imported them into state and then updates them in
# place to match this code (names, tags, `kpi:<id>` alert names). Delete this
# file in the pull request after that apply; the state keeps the objects.

import {
  for_each = {
    growth    = "2260870"
    retention = "2260871"
    agent     = "2260872"
    web       = "2260873"
  }
  to = posthog_dashboard.product[each.key]
  id = each.value
}

import {
  for_each = {
    funnel_visit_to_campaign = "13300146"
    activation_funnel        = "13300147"
    weekly_signups           = "13300148"
    cta_clicks               = "13300149"
    provider_connections     = "13300150"
    signup_retention         = "13300159"
    run_retention            = "13300160"
    lifecycle                = "13300161"
    stickiness               = "13300162"
    mastra_scores            = "13300180"
    llm_cost_by_model        = "13300185"
  }
  to = posthog_insight.product_query[each.key]
  id = each.value
}

import {
  for_each = {
    approval_rate           = "13300163"
    run_success_weekly      = "13300164"
    run_duration            = "13300177"
    llm_cost_per_run_weekly = "13300183"
    vitals_daily            = "13300256"
    cls_daily               = "13300260"
    vitals_by_page          = "13300262"
    errors_and_frustration  = "13300263"
  }
  to = posthog_insight.product_sql[each.key]
  id = each.value
}

# The three alert metrics and their alerts become the KPIs of the same names
# in kpis.yml.
import {
  for_each = {
    activation-cohort    = "13300237"
    run-success-rate     = "13300242"
    design-approval-rate = "13300249"
  }
  to = posthog_insight.kpi[each.key]
  id = each.value
}

import {
  for_each = {
    activation-cohort    = "01a17821-a492-0000-7451-dc0b5255aed7"
    run-success-rate     = "01a17821-b5c7-0000-4746-3ca26c49e2ce"
    design-approval-rate = "01a17821-c69f-0000-dc03-6f1b0574fd71"
  }
  to = posthog_alert.kpi[each.key]
  id = each.value
}
