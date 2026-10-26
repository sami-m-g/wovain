# PostHog as wovain's sensor (docs/flows.md, "PostHog loop"), as code with
# PostHog's official Terraform provider, applied by OpenTofu in CI
# (.gitlab/ci/posthog.yml) with GitLab-managed state:
#   kpis.tf     an insight and an alert per PostHog KPI in .gitlab/duo/kpis.yml
#   health.tf   the "wovain health" dashboard: funnel, errors, web vitals,
#               clicks and LLM cost per run
#   signals.tf  destinations that start the ops pipeline when PostHog senses
#               something, and the run-rating survey
#   settings.tf cookieless hashing, no stored IPs, and the default filters
#               that leave out the team, dev traffic and bots
# Nothing here acts on code: the ops job reads PostHog again and decides.

terraform {
  required_version = ">= 1.9"
  required_providers {
    posthog = {
      source  = "PostHog/posthog"
      version = "~> 1.0.26"
    }
  }
  # GitLab-managed OpenTofu state; the OpenTofu component configures it.
  backend "http" {}
}

variable "posthog_host" {
  description = "The PostHog app host (US cloud)."
  type        = string
  default     = "https://us.posthog.com"
}

variable "posthog_project_id" {
  description = "The wovain PostHog project (POSTHOG_PROJECT_ID)."
  type        = string
}

variable "posthog_api_key" {
  description = "A personal API key (POSTHOG_PERSONAL_API_KEY); scopes in docs/flows.md."
  type        = string
  sensitive   = true
}

variable "gitlab_api" {
  description = "GitLab's API, CI_API_V4_URL."
  type        = string
  default     = "https://gitlab.com/api/v4"
}

variable "gitlab_project_id" {
  description = "The wovain GitLab project, CI_PROJECT_ID."
  type        = string
}

variable "gitlab_trigger_token" {
  description = "The pipeline trigger token infra/duo.ts creates (POSTHOG_TRIGGER_TOKEN)."
  type        = string
  sensitive   = true
}

variable "alert_subscribers" {
  description = "PostHog user ids that also get alert emails."
  type        = list(number)
  default     = []
}

provider "posthog" {
  host       = var.posthog_host
  api_key    = var.posthog_api_key
  project_id = var.posthog_project_id
}

locals {
  kpi_file = yamldecode(file("${path.module}/../../.gitlab/duo/kpis.yml"))
  # The KPIs PostHog measures; the others come from Google Cloud.
  posthog_kpis = {
    for k in local.kpi_file.kpis : k.id => k if k.source.kind == "posthog"
  }
  window_days = tostring(local.kpi_file.windowDays)
  production  = "properties.environment = 'production'"
}
