# Project settings that decide what wovain's analytics count and keep.
# Settings left out here (authorized domains, replay, heatmaps) stay as set
# in PostHog.

locals {
  # PostHog's default "Internal / Test users" cohort: people with
  # $internal_or_test_user set. PostHog created it with the project.
  internal_cohort_id = 663838
}

resource "posthog_project_settings" "wovain" {
  # Until a visitor consents, PostHog is cookieless (apps/web/src/lib/
  # analytics-client.ts) and counts them with a daily server-side hash.
  cookieless_server_hash_mode = 1 # stateless

  # Never keep a visitor's IP address. Cookieless events lose it before
  # PostHog's GeoIP step, so apps/web's /api/visitor sends their country;
  # consented events keep it only until GeoIP has run.
  anonymize_ips = true

  # "Filter out internal and test users", on by default in every insight,
  # dashboard and web analytics. Cookieless events also lose the user agent,
  # so PostHog's own bot detection ($virt_is_bot) sees every one of them as
  # a bot and can't be used here; the browser marks bots itself (BotD).
  test_account_filters = jsonencode([
    # People PostHog flags as internal or test users.
    { key = "id", type = "cohort", value = local.internal_cohort_id, operator = "not_in" },
    # dev.wovain.com and localhost.
    { key = "environment", type = "event", value = ["development"], operator = "is_not" },
    # A signed-in team member (WOVAIN_ALLOWED_EMAILS), set by /api/visitor.
    { key = "internal", type = "event", value = "is_not_set", operator = "is_not_set" },
    # Headless and automated browsers (BotD).
    { key = "bot", type = "event", value = "is_not_set", operator = "is_not_set" },
  ])
  test_account_filters_default_checked = true
}
