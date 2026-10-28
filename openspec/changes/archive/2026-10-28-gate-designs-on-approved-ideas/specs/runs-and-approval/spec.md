## ADDED Requirements

### Requirement: Ideas gate before any design

In manual mode a run SHALL stop after research, as `awaiting_approval` at step `ideas`, and SHALL draw no design and charge no design credits until the merchant approves one or more of its ideas.

#### Scenario: Research ends

- **WHEN** a manual run's research saves five ideas
- **THEN** the run waits at step `ideas` and no design is drawn

### Requirement: Designs only for approved ideas

Approving ideas (the wizard's **See designs**, or the MCP tool `approve_ideas`) SHALL resume the run, which SHALL draw one design for each approved idea and for no other idea, then wait at the design gate. It SHALL be accepted once per run, and an idea that is not one of the run's ideas SHALL be refused before the run moves. The design gate SHALL never open while the run waits for ideas.

#### Scenario: Merchant sees designs for two ideas

- **WHEN** the merchant approves two of the run's ideas
- **THEN** the run draws exactly two designs, one for each approved idea, and waits for their approval

#### Scenario: Second click

- **WHEN** the merchant approves ideas on a run that is no longer waiting for them
- **THEN** the call is refused with a conflict and no further design is drawn

#### Scenario: Resume fails

- **WHEN** the run can't be resumed after the merchant approves ideas
- **THEN** the run waits at step `ideas` again and the merchant is told to try again

## MODIFIED Requirements

### Requirement: Same steps on both surfaces

The website and the MCP tools (`start_run`, `get_run`, `approve_ideas`, `approve_design`, `reject_design`) SHALL call the same router procedures.

#### Scenario: Run from ChatGPT

- **WHEN** a designer calls `start_run` in ChatGPT
- **THEN** the run is created and processed exactly as from the website

### Requirement: Several designs per run

A manual run SHALL draw one design for each idea the merchant approved; an autopilot run SHALL draw one design for each of its top-ranked ideas, up to three, led by autopilot's pick. Each design's credits SHALL be charged on its own. One design, product or campaign failing SHALL NOT fail the others: the run SHALL go on with those that worked and log each failure at error level, and SHALL fail a step only when every item in it failed.

#### Scenario: Merchant compares options

- **WHEN** the merchant approves three ideas
- **THEN** the run draws a design for each of the three, and the merchant sees all of them

#### Scenario: Autopilot compares options

- **WHEN** an autopilot run's research returns three or more ideas
- **THEN** the run draws a design for each of the top three without waiting

#### Scenario: One design fails

- **WHEN** one of a run's designs fails to draw
- **THEN** the run waits for approval with the other designs and the failure reaches Error Tracking
