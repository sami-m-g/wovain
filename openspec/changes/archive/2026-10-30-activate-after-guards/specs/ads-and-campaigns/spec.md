## ADDED Requirements

### Requirement: Spend rules before activation

Both when the merchant asks to start a campaign and before it publishes an approved activation, wovain SHALL check that the `ads-profit-rules` and `meta-backstop-rules` flags are on and that Meta holds every backstop rule of the campaign after a sync. Otherwise it SHALL refuse to activate.

#### Scenario: Spend rules missing

- **WHEN** the merchant asks to start a campaign while the spend rules or the backstop flag is off, or Meta doesn't hold the campaign's backstop rules
- **THEN** wovain refuses the request with a precondition error and nothing is activated on Meta

#### Scenario: Rules gone after approval

- **WHEN** an approved activation reaches the executor and the spend rules are no longer in place
- **THEN** the approval ends `failed`, the error is logged at error level, and nothing is activated on Meta
