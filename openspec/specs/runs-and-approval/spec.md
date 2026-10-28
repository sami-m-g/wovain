# runs-and-approval Specification

## Purpose

A run takes one direction from research to a paused campaign. In manual mode the designer approves each design; in autopilot Nemotron decides inside code gates.

## Requirements

### Requirement: Run lifecycle

The system SHALL record each run with its seed, autopilot flag, status (`running`, `awaiting_approval`, `completed`, `failed`), current step and error.

#### Scenario: Step failure

- **WHEN** any step of a run throws
- **THEN** the run is marked `failed` with the step and the error message

### Requirement: Manual approval

A design SHALL be created as `pending_approval` and SHALL change only through an explicit approve or reject from `pending_approval`, which stores who decided (`merchant` or `autopilot`) and the reason. A decision on a design that is no longer pending SHALL be refused.

#### Scenario: Designer rejects

- **WHEN** the designer rejects a design with a reason
- **THEN** the design becomes `rejected`, the reason is stored and no product is created

#### Scenario: Designer approves

- **WHEN** the designer approves a pending design
- **THEN** the design becomes `approved` and the product step can run

#### Scenario: Approve after reject

- **WHEN** a rejected design is approved
- **THEN** the request fails with a precondition error and the design stays `rejected`

### Requirement: Autopilot inside gates

With `autopilot: true`, Nemotron SHALL pick the lead idea and review each design, but a design whose judge verdict is `revise` SHALL never be approved, and nothing SHALL be activated. The run SHALL go on with each approved design and SHALL stop only when none is approved.

#### Scenario: Judge says revise

- **WHEN** the judge returns `revise` for every design during an autopilot run
- **THEN** the run stops without approving any design

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

### Requirement: Gate waits for every design

In manual mode the run SHALL wait at its approval gate until every design of the run is decided, and SHALL then make a product, publish it and stage a paused campaign for each approved design. The decision that opens the gate SHALL resume the run only after it is committed. When every design was decided before the run reached its gate, the gate SHALL open at once.

#### Scenario: Approve one, reject the rest

- **WHEN** the designer approves one of three designs and rejects the other two
- **THEN** the run resumes once, after the last decision, and lists only the approved design

#### Scenario: Two decisions at once

- **WHEN** the designer's calls on the last two pending designs land together
- **THEN** the run resumes exactly once

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

### Requirement: Revise designs are redrawn once, then flagged

A design the judge marks `revise` SHALL be redrawn once, from a new brief that applies the judge's fixes, without charging the merchant a second time. If the redraw is still `revise`, it SHALL be saved as `pending_approval` and shown flagged: the failed checks are named and approving it is labeled as approving anyway.

#### Scenario: Redraw passes

- **WHEN** the first drawing is `revise` and the redraw is `ready`
- **THEN** only the redraw is saved and the merchant sees it as ready

#### Scenario: Redraw still fails

- **WHEN** both drawings are `revise`
- **THEN** the redraw is saved, its card names the failed checks and its approve button reads "Approve anyway"

### Requirement: Durable runs

Runs SHALL execute as Mastra workflows with their state stored in Postgres: `runs.start` SHALL return the run before the work is done, and a run SHALL resume from its last completed step after a restart.

#### Scenario: Instance restarts mid-run

- **WHEN** the instance stops while a run is between steps
- **THEN** the run continues from its last completed step and does not stay `running` forever

### Requirement: Approval suspends and resumes

In manual mode the run workflow SHALL suspend at the approval step and SHALL resume to product, publish and campaign when the designer approves.

#### Scenario: Approve resumes the run

- **WHEN** the designer approves a design in a suspended run
- **THEN** the same run continues to the product and campaign steps

### Requirement: Idempotent external writes

A retried product or campaign step SHALL reuse the external ids it already created and SHALL NOT create a second Fourthwall product or Meta campaign.

#### Scenario: Retry after a crash

- **WHEN** the campaign step is retried after Meta created the campaign
- **THEN** no second campaign is created
