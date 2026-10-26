# Spec Delta

## ADDED Requirements

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

## MODIFIED Requirements

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
