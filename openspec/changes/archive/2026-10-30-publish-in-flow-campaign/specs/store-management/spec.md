## MODIFIED Requirements

### Requirement: Store writes go through the approval queue

Every write wovain makes to the designer's store, except their own confirmed publish in the drop flow, SHALL be an approval-queue action, settled by the autonomy policy or the designer and performed at most once. A failed action SHALL be recorded on its approval and SHALL reach Error Tracking. The capability SHALL be off unless the `store-management` flag is on.

#### Scenario: Delivered twice

- **WHEN** the same approval decision is delivered twice
- **THEN** the store action runs once and the second delivery does nothing

#### Scenario: Agent publishes a product

- **WHEN** `products.publish` is called through MCP (the `publish_product` tool) with `store-management` on and the designer's level is `suggest`
- **THEN** a product publish waits in the designer's approvals, the product is in review, and its Fourthwall offer stays hidden

#### Scenario: Designer publishes from the drop flow

- **WHEN** the designer confirms publish on a product in the website's drop flow with `store-management` on and the shop is ready
- **THEN** the product goes live at once and nothing is queued

#### Scenario: Shop not ready

- **WHEN** the designer confirms publish in the drop flow while the shop isn't ready to sell
- **THEN** the publish is refused with the failing checks and the offer stays hidden
