# What PostHog senses reaches GitLab as a nudge, never as instructions: each
# destination only starts the ops pipeline (OPS=1) through a pipeline trigger
# token, whose only power is to run that pipeline on main. The ops job then
# reads PostHog itself through its API (apps/ops/src/signals.ts), so nothing
# in the webhook body can steer it, and its caps and guardrails still apply.

locals {
  trigger_url = "${var.gitlab_api}/projects/${var.gitlab_project_id}/trigger/pipeline?token=${var.gitlab_trigger_token}"
  destinations = {
    # Error tracking: a new, reopened or spiking issue becomes a heal issue.
    errors = {
      name       = "Error tracking -> wovain ops"
      events     = ["$error_tracking_issue_created", "$error_tracking_issue_reopened", "$error_tracking_issue_spiking"]
      properties = []
    }
    # A KPI alert fired: the ops job starts the scout (at most once a day)
    # and verifies shipped fixes against the alert.
    kpis = {
      name   = "KPI alerts -> wovain ops"
      events = ["$insight_alert_firing"]
      properties = [{
        key      = "alert_id"
        value    = [for a in posthog_alert.kpi : a.id]
        operator = "exact"
        type     = "event"
      }]
    }
  }
}

resource "posthog_hog_function" "ops" {
  for_each = local.destinations

  name        = each.value.name
  description = "Starts the wovain ops pipeline (docs/flows.md). Managed in infra/posthog."
  type        = "internal_destination"
  enabled     = true
  template_id = "template-webhook"

  filters_json = jsonencode({
    events     = [for e in each.value.events : { id = e, type = "events" }]
    properties = each.value.properties
  })

  inputs_json = jsonencode({
    method = { value = "POST" }
    # A fixed body: the PostHog event's own fields never reach GitLab.
    body = { value = { ref = "main", variables = { OPS = "1", POSTHOG_SIGNAL = each.key } } }
  })
  sensitive_inputs_json = jsonencode({
    url = { value = local.trigger_url }
  })
}

# One rating question after a run, shown on the dashboard to signed-in
# merchants. Created as a draft: a person launches it in PostHog. Its average
# is the merchant-rating KPI (.gitlab/duo/kpis.yml).
resource "posthog_survey" "run_rating" {
  name        = "Run rating"
  description = "How useful a run was, 1 to 5. Managed in infra/posthog."
  type        = "popover"
  schedule    = "once"
  questions_json = jsonencode([{
    id              = "rating"
    type            = "rating"
    display         = "number"
    scale           = 5
    question        = "How useful was this run?"
    lowerBoundLabel = "Not useful"
    upperBoundLabel = "Very useful"
  }])
  conditions_json = jsonencode({
    url          = "/dashboard"
    urlMatchType = "icontains"
  })
}

output "dashboard_url" {
  value = "${var.posthog_host}/project/${var.posthog_project_id}/dashboard/${posthog_dashboard.health.id}"
}
