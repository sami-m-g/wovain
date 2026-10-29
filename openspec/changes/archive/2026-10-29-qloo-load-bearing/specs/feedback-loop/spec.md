# Spec Delta

## MODIFIED Requirements

### Requirement: Learnings in taste memory and research

The system SHALL turn the outcomes of ideas whose products have been public for at least 3 days into learnings: up to 3 ideas that sold and up to 3 that didn't. A product's outcome SHALL sum its first 28 days for sale. A product that went on sale before the merchant's sales snapshots began SHALL NOT count, because its results are incomplete. The system SHALL write the learnings into the merchant's working memory. Research themes come from Qloo alone, so the learnings SHALL NOT be passed to a theme prompt; research uses the outcomes through the merchant's score weights.

#### Scenario: A theme sold

- **WHEN** a product of the idea "Retro slasher VHS" sold 4 units
- **THEN** the merchant's working memory lists it under what sold

#### Scenario: A product older than the snapshots

- **WHEN** a product went on sale before the merchant's first sales snapshot and has no sales since
- **THEN** its idea is not counted and is not listed under what didn't sell
