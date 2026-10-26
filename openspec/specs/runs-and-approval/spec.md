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

A design SHALL be created as `pending_approval` and SHALL change only through an explicit approve or reject, which stores who decided (`merchant` or `autopilot`) and the reason.

#### Scenario: Designer rejects

- **WHEN** the designer rejects a design with a reason
- **THEN** the design becomes `rejected`, the reason is stored and no product is created

#### Scenario: Designer approves

- **WHEN** the designer approves a pending design
- **THEN** the design becomes `approved` and the product step can run

### Requirement: Autopilot inside gates

With `autopilot: true`, Nemotron SHALL pick the idea and review the design, but a design whose judge verdict is `revise` SHALL never be approved, and nothing SHALL be activated.

#### Scenario: Judge says revise

- **WHEN** the judge returns `revise` during an autopilot run
- **THEN** the run stops without approving the design

### Requirement: Same steps on both surfaces

The website and the MCP tools (`start_run`, `get_run`, `approve_design`, `reject_design`) SHALL call the same router procedures.

#### Scenario: Run from ChatGPT

- **WHEN** a designer calls `start_run` in ChatGPT
- **THEN** the run is created and processed exactly as from the website
