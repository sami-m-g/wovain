# Spec Delta

## ADDED Requirements

### Requirement: Several designs per run

A run SHALL draw one design for each of its top-ranked ideas, up to three, and SHALL charge each design's credits on its own. One design, product or campaign failing SHALL NOT fail the others: the run SHALL go on with those that worked and log each failure at error level, and SHALL fail a step only when every item in it failed.

#### Scenario: Merchant compares options

- **WHEN** research returns three or more ideas
- **THEN** the run draws a design for each of the top three, and the merchant sees all of them

#### Scenario: One design fails

- **WHEN** one of a run's designs fails to draw
- **THEN** the run waits for approval with the other designs and the failure reaches Error Tracking

### Requirement: Gate waits for every design

In manual mode the run SHALL wait at its approval gate until every design of the run is decided, and SHALL then make a product, publish it and stage a paused campaign for each approved design. The decision that opens the gate SHALL resume the run only after it is committed. When every design was decided before the run reached its gate, the gate SHALL open at once.

#### Scenario: Approve one, reject the rest

- **WHEN** the designer approves one of three designs and rejects the other two
- **THEN** the run resumes once, after the last decision, and lists only the approved design

#### Scenario: Two decisions at once

- **WHEN** the designer's calls on the last two pending designs land together
- **THEN** the run resumes exactly once

## MODIFIED Requirements

### Requirement: Autopilot inside gates

With `autopilot: true`, Nemotron SHALL pick the lead idea and review each design, but a design whose judge verdict is `revise` SHALL never be approved, and nothing SHALL be activated. The run SHALL go on with each approved design and SHALL stop only when none is approved.

#### Scenario: Judge says revise

- **WHEN** the judge returns `revise` for every design during an autopilot run
- **THEN** the run stops without approving any design
