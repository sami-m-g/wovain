# One SQL insight and one alert per PostHog KPI in .gitlab/duo/kpis.yml, so
# the scout's targets and PostHog's alerts can't drift apart. Each query
# returns its value as the first row's `value` column. An alert fires while
# its KPI misses the target; the ops job reads the alert's state by its name,
# "kpi:<id>", to start the scout and to verify a shipped fix
# (apps/ops/src/signals.ts).

resource "posthog_insight" "kpi" {
  for_each = local.posthog_kpis

  name        = "KPI: ${each.value.name}"
  description = "${each.value.why} Target ${each.value.direction == "up" ? ">=" : "<="} ${each.value.target} ${each.value.unit}, from .gitlab/duo/kpis.yml."
  query_sql   = replace(each.value.source.query, "{windowDays}", local.window_days)
  dashboard_ids = concat(
    [posthog_dashboard.health.id],
    [for d in lookup(local.kpi_dashboards, each.key, []) : posthog_dashboard.product[d].id],
  )
  tags = ["wovain", "kpi"]
}

resource "posthog_alert" "kpi" {
  for_each = local.posthog_kpis

  name                 = "kpi:${each.key}"
  insight              = posthog_insight.kpi[each.key].id
  subscribed_users     = var.alert_subscribers
  condition_type       = "absolute_value"
  threshold_type       = "absolute"
  evaluation           = "first_row"
  column               = "value"
  calculation_interval = "daily"
  threshold_lower      = each.value.direction == "up" ? each.value.target : null
  threshold_upper      = each.value.direction == "down" ? each.value.target : null
}
