# Spec Delta

## ADDED Requirements

### Requirement: Autonomy levels

Each merchant SHALL have an autonomy setting with a level (`suggest`, `draft` or `publish_ads_paused`), a daily and a monthly ad spend cap in US cents, and a pause switch. A merchant without a saved setting SHALL be treated as `suggest` with both caps at zero and not paused.

#### Scenario: New merchant

- **WHEN** a merchant who never saved a setting reads it
- **THEN** they get level `suggest`, caps of 0 and paused false

#### Scenario: Monthly cap below the daily cap

- **WHEN** a merchant saves a monthly cap lower than the daily cap
- **THEN** the change is refused

### Requirement: Action policy

Every write an agent proposes SHALL be a type from the closed action catalog, with a risk class from R0 (read) to R4 (money-moving). The policy SHALL return `allow`, `needs_approval` or `deny`. R3 and R4 actions (refunds and cancels included) and actions that start ad spend SHALL always need approval. Otherwise `suggest` allows R0, `draft` up to R1 and `publish_ads_paused` up to R2.

#### Scenario: Refund at the highest level

- **WHEN** an agent proposes `store.order.refund` for a merchant on `publish_ads_paused`
- **THEN** the policy answers `needs_approval`

#### Scenario: Spend past the cap

- **WHEN** an agent proposes `media.campaign.activate` with a budget that takes today's spend past the daily cap
- **THEN** the policy answers `deny`

#### Scenario: Publishing on publish_ads_paused

- **WHEN** an agent proposes `store.product.publish` for a merchant on `publish_ads_paused` who has not paused the agent
- **THEN** the policy answers `allow`

### Requirement: Hard limits and the pause switch

The policy SHALL deny an unknown action type and any action that commits ad spend past the daily or the monthly cap. While the merchant has paused the agent, every write SHALL need approval.

#### Scenario: Unknown action

- **WHEN** an agent proposes an action type outside the catalog
- **THEN** the policy answers `deny`

#### Scenario: Paused agent

- **WHEN** the merchant paused the agent and an agent proposes `store.product.create_hidden` on `draft`
- **THEN** the policy answers `needs_approval`

### Requirement: One approval queue

Store, media buying and autopilot actions SHALL share one approval queue. Each approval SHALL record the action type, its domain and risk class, the payload, an optional cost preview, the status, who proposed it, who decided it and when. Enqueueing SHALL apply the policy: allowed actions are stored as approved by `policy`, denied ones as denied, and the rest wait as pending. An enqueue with an idempotency key the merchant already used SHALL return the first approval.

#### Scenario: Retried enqueue

- **WHEN** a step enqueues the same action twice with one idempotency key
- **THEN** one approval exists and both calls return it

#### Scenario: Decided twice

- **WHEN** a merchant approves a pending approval and then tries to reject it
- **THEN** the second decision is refused and the approval stays approved

#### Scenario: Approval no longer within the cap

- **WHEN** a merchant approves a spending action after spend has moved past the cap
- **THEN** the approval becomes denied and the merchant is told why

#### Scenario: Expired approval

- **WHEN** a merchant decides an approval after its expiry
- **THEN** it becomes expired and is not executed

#### Scenario: Another merchant's approval

- **WHEN** a merchant decides or reads an approval that belongs to someone else
- **THEN** it is not found

### Requirement: Audit log

Every change of an approval's state, and every change of a merchant's autonomy setting, SHALL be appended to an audit log with the actor, the state before and after, and a note. Audit entries SHALL NOT be updated or deleted by the app.

#### Scenario: Settings change

- **WHEN** a merchant changes their autonomy level
- **THEN** an audit entry records the old and the new setting

### Requirement: Approval events

The queue SHALL send `wovain/approval.requested` when an action waits for the merchant and `wovain/approval.decided` when it is approved, rejected or denied, by the merchant or by the policy.

#### Scenario: Executor trigger

- **WHEN** the policy allows an action at enqueue
- **THEN** `wovain/approval.decided` is sent with status `approved` and `decidedBy` `policy`

### Requirement: Decision traces

Agents SHALL be able to record a decision trace: each step with its agent, model, a short input summary, its output, its sources and whether it succeeded, linked to a run, drop, approval or suggestion. A failed step SHALL be recorded and its error rethrown.

#### Scenario: Failed model call

- **WHEN** a traced model call fails
- **THEN** the trace holds the step with `ok` false and the caller gets the error

### Requirement: Approval procedures behind a flag

`approvals.list`, `approvals.decide`, `autonomy.get` and `autonomy.set` SHALL be available only while the `autonomy-approvals` flag is on for the merchant.

#### Scenario: Flag off in production

- **WHEN** a merchant in production calls `approvals.list`
- **THEN** the call fails with not found
