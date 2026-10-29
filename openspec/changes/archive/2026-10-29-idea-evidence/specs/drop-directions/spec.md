## MODIFIED Requirements

### Requirement: Ranked by sales potential

The system SHALL rank directions in code by Qloo affinity x momentum (Tavily news in the past month) x low saturation (near-identical marketplace listings). While the `idea-evidence-gate` flag is on, directions SHALL instead pass the evidence gate and rank by the sweet spot's lower bound (capability `idea-evidence`), and each SHALL carry the one idea card. Nemotron SHALL only write the title, the brief and the "why now" line, validated by a schema; when the words fail, the directions SHALL still be shown with plain words from their facts, except behind the gate, where a direction whose words fail the evidence check twice SHALL be withdrawn.

#### Scenario: Crowded theme

- **WHEN** one direction's theme has many near-identical listings and another's has none
- **THEN** the crowded one ranks lower and says how many similar listings there are

#### Scenario: Crowded theme behind the gate

- **WHEN** the `idea-evidence-gate` flag is on and a theme has 8 or more near-identical listings of 20
- **THEN** it is not suggested, and the decision trace records it as `saturated`

### Requirement: Proof of demand

A suggested direction SHALL be proven to sell: a shop running an apparel ad on it for 14 days or more (Meta Ad Library, when the merchant's Meta account is connected), a bestseller listing, or at least 50 reviews on matching listings (Etsy, Amazon or Redbubble). Themes without proof SHALL be dropped, never shown to fill the list. Directions SHALL be ranked by demand x Qloo audience fit x market openness, or by demand against supply behind the `idea-evidence-gate` flag. The card SHALL show the proof and who buys it.

#### Scenario: Nothing sells

- **WHEN** no shop advertises a theme and no listing for it is a bestseller or reviewed
- **THEN** it is not suggested, and the decision trace records it as dropped

#### Scenario: Evergreen ads

- **WHEN** four shops have advertised a theme for 30 days or more
- **THEN** it ranks above an otherwise equal theme without such ads, and its card says so
