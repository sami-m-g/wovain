## MODIFIED Requirements

### Requirement: What to sell now, no brand needed

The Home SHALL show up to 5 directions to sell now, without a brand and without a typed seed. With no brand (or "Ignore my brand this time" on), each direction SHALL grow from one Qloo audience: the genre tag shared by what is rising among its fans. "Show me others" SHALL ask for a new set of audiences. The brief step SHALL show the brief first, with 3 to 4 starters from the kept directions that only fill it, and never the direction cards.

#### Scenario: No brand

- **WHEN** a merchant with no brand opens the Home
- **THEN** they see 3 to 5 directions, each naming the Qloo audience it is for, and no step asks them to set a brand first

#### Scenario: Show me others

- **WHEN** the merchant clicks "Show me others"
- **THEN** the directions come from a different set of Qloo audiences

#### Scenario: A starter fills the brief

- **WHEN** the merchant clicks a starter in the brief step
- **THEN** its line fills the brief box for them to edit, and no drop starts until they choose "Research trends"
