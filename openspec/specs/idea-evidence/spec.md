# idea-evidence Specification

## Purpose

Decide whether a suggested drop idea has real evidence of demand and room in the market, rank it by the lower bound of its sweet spot, and show it as one idea card.

## Requirements

### Requirement: One idea card contract

Every idea the merchant sees, from drop directions or trend research, SHALL carry the same card with four sections in one order: what to make, why it sells, who buys and where, and competition. Each section SHALL be either `ok` with its fields or `unavailable` with a reason (`not_read`, `read_failed`, `not_connected`, `none_found`, `ungrounded` or `raw_tag`). A section SHALL never be missing.

#### Scenario: An idea saved before the gate

- **WHEN** the merchant lists an idea researched before the evidence gate
- **THEN** its card has all four sections, and the ones not read say `not_read`

### Requirement: The evidence gate

While the `idea-evidence-gate` flag is on, an idea SHALL be shown as proven only with Qloo evidence, proof of demand (an apparel ad running 14 days or more, a bestseller listing or 50 reviews) and a competition read (near-identical marketplace listings). Every idea left out SHALL be recorded in the decision trace with its reason: `no_qloo_evidence`, `no_demand_proof`, `demand_unknown`, `no_competition_read`, `saturated` or `no_title`. With the flag off, the current ranking SHALL stay.

#### Scenario: The gate in the logs

- **WHEN** the gate leaves out an idea
- **THEN** the request's wide event lists the idea's theme and reason

#### Scenario: No competition read

- **WHEN** the listings search fails for a theme that has proof of demand, and another theme passes the gate
- **THEN** the theme is not shown, and the decision trace records `no_competition_read`

#### Scenario: A failed demand read

- **WHEN** the marketplace read fails for a theme and no other demand read ran
- **THEN** the theme is recorded as `demand_unknown`, not `no_demand_proof`

### Requirement: Sweet-spot competition

Ideas SHALL be scored by demand against supply. Demand is shops keeping an ad running 14 days or more (twice at 30), bestsellers and reviews. Supply is near-identical listings and every shop advertising now. Audience cues that no listing covers SHALL add a bonus. An idea SHALL be dropped as `saturated` with 8 or more near-identical listings of 20, 15 or more advertisers of 50 ads sampled, or demand under a quarter of supply.

#### Scenario: More advertisers

- **WHEN** two otherwise equal themes differ only by five more shops advertising for a few days
- **THEN** the one with more advertisers has the same demand and ranks lower

#### Scenario: Saturated

- **WHEN** a theme has 17 near-identical listings of 20 and strong demand
- **THEN** it is not shown, and it is recorded as `saturated`

### Requirement: An honest rank

Kept ideas SHALL be ranked best first by the Wilson score lower bound of demand's share of the market signals, times Qloo fit and the gap bonus. The list SHALL never be padded with weaker ideas.

#### Scenario: Thin evidence

- **WHEN** one theme has a single bestseller and no competitors, and another has long-running ads, several bestsellers and a few listings
- **THEN** the second ranks first

### Requirement: Readable titles checked against the evidence

Each idea past the gate SHALL get a title and a one-line concept, written by the `idea_words` agent from the idea's evidence only. Code SHALL check every answer: a number or claim the evidence doesn't hold, or a title that is only the Qloo tag, SHALL be sent back once. On a second failure, a run's idea SHALL keep its title unavailable with the reason, and a suggested direction SHALL be withdrawn and recorded as `no_title`. Every attempt SHALL be recorded in the decision trace.

#### Scenario: A raw tag

- **WHEN** the agent answers "+children's" as the title twice
- **THEN** the card shows no title and the reason, never "+children's"

### Requirement: Cautious ideas when none passes

When no idea passes the gate, the ideas with Qloo evidence that were left out as `demand_unknown`, `no_competition_read`, `no_demand_proof` or `saturated` SHALL be shown in that order of preference, each with its caution, ranked by Qloo fit scaled down by the caution. Ideas without Qloo evidence or a grounded title SHALL never be shown. The step SHALL say that no theme proved demand yet. When no idea can be shown, the step SHALL list each theme it checked and why it fell short.

#### Scenario: A typed brief with no proven theme

- **WHEN** a merchant's brief gives Qloo themes whose marketplace listings show no bestseller badge and no reviews
- **THEN** research returns those themes marked `no_demand_proof`, and the run goes on to the ideas step

#### Scenario: Nothing to show

- **WHEN** no suggested theme has Qloo evidence
- **THEN** the new-drop step lists each theme it checked and its reason, instead of "Qloo found nothing"
