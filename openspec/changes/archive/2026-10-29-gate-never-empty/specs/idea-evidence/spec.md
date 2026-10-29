## MODIFIED Requirements

### Requirement: The evidence gate

While the `idea-evidence-gate` flag is on, an idea SHALL be shown as proven only with Qloo evidence, proof of demand (a shop running an apparel ad for 14 days or more, a bestseller listing, or at least 50 reviews) and a competition read (near-identical marketplace listings). Every idea left out SHALL be recorded in the decision trace with its reason: `no_qloo_evidence`, `no_demand_proof`, `demand_unknown` (no demand read came back), `no_competition_read`, `saturated` or `no_title`. The request's wide event SHALL carry the same reasons. With the flag off, the current ranking SHALL stay.

#### Scenario: No competition read

- **WHEN** the listings search fails for a theme that has proof of demand, and another theme passes the gate
- **THEN** the theme is not shown, and the decision trace records `no_competition_read`

#### Scenario: A failed demand read

- **WHEN** the marketplace read fails for a theme and no other demand read ran
- **THEN** the theme is recorded as `demand_unknown`, not `no_demand_proof`

## ADDED Requirements

### Requirement: Cautious ideas when none passes

When no idea passes the gate, the ideas with Qloo evidence that were left out as `demand_unknown`, `no_competition_read`, `no_demand_proof` or `saturated` SHALL be shown in that order of preference, each with its caution, ranked by Qloo fit scaled down by the caution. Ideas without Qloo evidence or a grounded title SHALL never be shown. The step SHALL say that no theme proved demand yet. When no idea can be shown, the step SHALL list each theme it checked and why it fell short.

#### Scenario: A typed brief with no proven theme

- **WHEN** a merchant's brief gives Qloo themes whose marketplace listings show no bestseller badge and no reviews
- **THEN** research returns those themes marked `no_demand_proof`, and the run goes on to the ideas step

#### Scenario: Nothing to show

- **WHEN** no suggested theme has Qloo evidence
- **THEN** the new-drop step lists each theme it checked and its reason, instead of "Qloo found nothing"
