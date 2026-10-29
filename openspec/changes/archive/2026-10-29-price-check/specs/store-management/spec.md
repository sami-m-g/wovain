# Spec Delta

## ADDED Requirements

### Requirement: Price check

Changing a product's price SHALL show, for each size, Fourthwall's cost to make it, the price, the profit after fees and the gross margin, with a verdict (loss, below wovain's floor, under the 60% DTC margin, or healthy) and one-click floor and 60% prices. The server SHALL refuse a price that loses money in any size.

#### Scenario: A size sells at a loss

- **WHEN** the designer asks for a price below what Fourthwall charges to make the 2XL
- **THEN** the dialog shows the loss on the 2XL, and the request is refused with the lowest price that works

#### Scenario: Thin margin

- **WHEN** the price clears wovain's floor but leaves under 60% gross margin in some size
- **THEN** the dialog says so and offers the price that reaches 60%
