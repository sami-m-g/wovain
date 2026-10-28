## ADDED Requirements

### Requirement: Revise designs are redrawn once, then flagged

A design the judge marks `revise` SHALL be redrawn once, from a new brief that applies the judge's fixes, without charging the merchant a second time. If the redraw is still `revise`, it SHALL be saved as `pending_approval` and shown flagged: the failed checks are named and approving it is labeled as approving anyway.

#### Scenario: Redraw passes

- **WHEN** the first drawing is `revise` and the redraw is `ready`
- **THEN** only the redraw is saved and the merchant sees it as ready

#### Scenario: Redraw still fails

- **WHEN** both drawings are `revise`
- **THEN** the redraw is saved, its card names the failed checks and its approve button reads "Approve anyway"
