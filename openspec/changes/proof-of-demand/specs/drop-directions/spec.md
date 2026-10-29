# Spec Delta

## ADDED Requirements

### Requirement: Proof of demand

A suggested direction SHALL be proven to sell: a shop running an apparel ad on it for 14 days or more (Meta Ad Library, when the merchant's Meta account is connected), a bestseller listing, or at least 50 reviews on matching listings (Etsy, Amazon or Redbubble). Themes without proof SHALL be dropped, never shown to fill the list. Directions SHALL be ranked by demand x Qloo audience fit x market openness. The card SHALL show the proof and who buys it.

#### Scenario: Nothing sells

- **WHEN** no shop advertises a theme and no listing for it is a bestseller or reviewed
- **THEN** it is not suggested, and the decision trace records it as dropped

#### Scenario: Evergreen ads

- **WHEN** four shops have advertised a theme for 30 days or more
- **THEN** it ranks above an otherwise equal theme without such ads, and its card says so
