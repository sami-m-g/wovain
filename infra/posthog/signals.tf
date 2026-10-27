# One rating question after a run, shown on the dashboard to signed-in
# merchants. Created as a draft: a person launches it in PostHog. Its average
# is the merchant-rating KPI (kpis.yml).
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
