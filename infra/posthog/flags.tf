# wovain's feature flags (docs/adr/0001-progressive-delivery.md): the typed
# registry in packages/core/src/flag-registry.ts, as packages/core/src/
# flag-posthog.ts writes it to flags.json (a test fails while they differ).
# Each flag's conditions match only what the app passes to the SDK's local
# evaluation (packages/core/src/flags.ts): `environment`, `plan`, and the
# user ID as `distinct_id`. A condition marked `internal` is the team: their
# Better Auth user IDs.
#
# Status (`active`) is set once at creation and then ignored: it is the kill
# switch, which people and the release guard flip in PostHog without drift.

variable "internal_user_ids" {
  description = "The team's Better Auth user IDs, which every internal and percent rollout includes."
  type        = list(string)
  default     = []
}

locals {
  flag_registry = jsondecode(file("${path.module}/flags.json"))
  team = {
    key      = "distinct_id"
    type     = "person"
    operator = "exact"
    value    = distinct(concat([local.flag_registry.internal_user_id], var.internal_user_ids))
  }
}

resource "posthog_feature_flag" "registry" {
  for_each = local.flag_registry.flags

  key    = each.key
  name   = each.value.name
  tags   = each.value.tags
  active = each.value.active
  # Server-side local evaluation needs both: experience continuity can't be
  # evaluated locally, and the app passes no device ID.
  ensure_experience_continuity = false
  bucketing_identifier         = "distinct_id"
  evaluation_runtime           = "server"

  filters = jsonencode({
    groups = [
      for g in each.value.groups : {
        rollout_percentage = g.rollout_percentage
        properties         = g.internal ? concat(g.properties, [local.team]) : g.properties
      }
    ]
  })

  lifecycle {
    ignore_changes = [active]
  }
}
