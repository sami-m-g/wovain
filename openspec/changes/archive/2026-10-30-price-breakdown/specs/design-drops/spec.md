# Spec Delta

## ADDED Requirements

### Requirement: Price breakdown

Each product in the drop's products step, and the confirm before it is published, SHALL show Fourthwall's cost to make it in its cheapest size, the profit per sale and the margin after card fees, tax and the refund reserve, and one line with the pricing rule's minimum profit and margin. When the cost can't be read, it SHALL show only the price.

#### Scenario: Cost read

- **WHEN** a $28 tee costs $12 to make in M and $15 in 2XL
- **THEN** its card shows a $12.00 base cost, $14.33 profit per sale, a 51% margin and the rule

#### Scenario: Cost not read

- **WHEN** Fourthwall's pricing can't be read for a product
- **THEN** its card shows only the price
