# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/216

## Why

On next (2026-10-29), with `idea-evidence-gate` on, the gate dropped every theme:

- "What to sell now" came back empty and said Qloo found nothing. Every Qloo, Tavily and Ad Library read succeeded. The empty answer was then kept in `direction_cache` and served again.
- A typed brief failed at Trends with "Research found no ideas for this seed". Research proves demand only from marketplace snippets, which rarely show a Bestseller badge or 50 reviews.

An honest gate shouldn't leave the merchant with nothing and no reason why.

## What Changes

- When no idea passes the gate, the ideas Qloo backs are shown with a caution: `demand_unknown`, `no_competition_read`, `no_demand_proof` or `saturated`. They rank below any proven idea. An idea without Qloo evidence or a grounded title is still never shown.
- A demand read that failed, with no other demand read, is `demand_unknown`, not `no_demand_proof`.
- The directions answer lists what the gate checked and why each theme fell short. An empty step shows that list instead of "Qloo found nothing".
- An empty answer, or one whose news or listings read failed, is never kept in `direction_cache`. A row like that, already kept, is read as missing.
- The request's wide event shows the gate's outcome and a run's failure, so they reach Cloud Logging and PostHog.

## Capabilities

### Modified Capabilities

- `idea-evidence`: the gate shows Qloo-backed ideas with their caution when none passes, and a failed demand read is `demand_unknown`.
- `drop-directions`: an empty or partly failed answer is never kept.
