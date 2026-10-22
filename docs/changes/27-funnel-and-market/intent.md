# Intent: count the product funnel and scout the market weekly

Issue: #27

## Problem

Nobody can see where merchants drop off (connect, idea, set approved, ad approved, campaign created, autopilot run), what a week costs (Duo credits, Nebius, Tavily, fal), or what competing print-on-demand AI tools ship.

## Desired outcome

- The server counts each funnel step as an OpenTelemetry metric sent to GitLab Observability. GitLab Product Analytics has been removed from GitLab, so OTel metrics are the GitLab-native option.
- A weekly job posts usage, costs and funnel conversion to the digest issue.
- A weekly market scout uses Tavily, as wovain's research does, to scan competitors and files one feature intent from what they ship and from the biggest funnel drop-off.

## Constraints

- No user ids, emails or tool arguments in metrics or reports; counts only.
- Tavily spend stays small: 3 basic searches a week.
- Market intents wait for a person (`status::intent`) and never go to Duo on their own.

## Open questions

None.
