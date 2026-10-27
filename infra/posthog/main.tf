# wovain's PostHog project as code with PostHog's official Terraform
# provider, applied by hand with OpenTofu (infra/README.md, "PostHog"), with
# its state in Cloud Storage next to Pulumi's:
#   kpis.tf     an insight and an alert per KPI in kpis.yml
#   health.tf   the "wovain health" dashboard: funnel, errors, web vitals,
#               clicks and LLM cost per run
#   dashboards.tf  the Growth, Retention, Agent quality and cost, and Web
#               vitals dashboards with their insights
#   import.tf   one-time adoption of the objects created through the API
#   signals.tf  the run-rating survey
#   settings.tf cookieless hashing, no stored IPs, and the default filters
#               that leave out the team, dev traffic and bots

terraform {
  required_version = ">= 1.9"
  required_providers {
    posthog = {
      source  = "PostHog/posthog"
      version = "~> 1.0.26"
    }
  }
  # The bucket Pulumi's state lives in (infra/Pulumi.yaml), under its own
  # prefix. `tofu init` signs in with Application Default Credentials.
  backend "gcs" {
    bucket = "wovain-pulumi-state"
    prefix = "opentofu/posthog"
  }
}

variable "posthog_host" {
  description = "The PostHog app host (US cloud)."
  type        = string
  default     = "https://us.posthog.com"
}

variable "posthog_project_id" {
  description = "The wovain PostHog project (`pulumi config get posthogProjectId`)."
  type        = string
}

variable "posthog_api_key" {
  description = "A personal API key (`pulumi config get posthog-personal-api-key`); scopes in docs/flows.md."
  type        = string
  sensitive   = true
}

variable "alert_subscribers" {
  description = "PostHog user ids that also get alert emails."
  type        = list(number)
  # The founder (sami.mg@outlook.com), who subscribed the first alerts.
  default = [413837]
}

provider "posthog" {
  host       = var.posthog_host
  api_key    = var.posthog_api_key
  project_id = var.posthog_project_id
}

locals {
  kpi_file = yamldecode(file("${path.module}/kpis.yml"))
  posthog_kpis = {
    for k in local.kpi_file.kpis : k.id => k if k.source.kind == "posthog"
  }
  window_days = tostring(local.kpi_file.windowDays)
  production  = "properties.environment = 'production'"
}
