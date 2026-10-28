# Spec Delta

## MODIFIED Requirements

### Requirement: Gate waits for every design

In manual mode the run SHALL wait at its approval gate until every design of the run is decided, and SHALL then make a product for each approved design. Without the `store-management` flag, it SHALL publish each product and stage a paused campaign for it. With the flag, the products SHALL stay hidden as a drop in review, the drop's publish SHALL be queued as an approval, and the run SHALL stage campaigns only for products already live. The decision that opens the gate SHALL resume the run only after it is committed. When every design was decided before the run reached its gate, the gate SHALL open at once.

#### Scenario: Approve one, reject the rest

- **WHEN** the designer approves one of three designs and rejects the other two
- **THEN** the run resumes once, after the last decision, and lists only the approved design

#### Scenario: Two decisions at once

- **WHEN** the designer's calls on the last two pending designs land together
- **THEN** the run resumes exactly once

#### Scenario: Publish gate

- **WHEN** a run with `store-management` on makes its products and the designer's level is `suggest`
- **THEN** the products stay hidden, the drop is in review, and a drop publish waits in the designer's approvals
