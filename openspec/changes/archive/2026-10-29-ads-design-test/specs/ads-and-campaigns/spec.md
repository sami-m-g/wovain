## ADDED Requirements

### Requirement: A drop launches as a multi-design test

A drop of 2 to 5 live designs SHALL be staged as one paused campaign on Meta's campaign budget, with one ad set per design and one ad per copy variant. Each ad set SHALL carry `daily_min_spend_target` equal to half the daily budget split evenly across the designs. More than 5 designs SHALL be split into tests of at most 5. A single design SHALL stay a plain campaign under the key a product's campaign always had. A retry SHALL make no Meta object twice.

#### Scenario: Three designs

- **WHEN** a drop with three live designs launches at $30 a day
- **THEN** Meta gets one campaign with a $30 daily budget, three ad sets each with a $5 minimum daily spend, and an ad per copy variant in each

#### Scenario: Retried launch

- **WHEN** the same drop's test is asked for again
- **THEN** the saved campaign is returned and no Meta call is made

### Requirement: Design results and rule status

For a test campaign, the system SHALL report each design's spend, CTR, add-to-carts, sales and profit (sales times the profit per sale, minus spend) and its rule status: `testing` while any of its ads runs, `paused` with the rule's reason once all its ads are off, or `winner` for the most profitable design with a sale. The kill rules SHALL judge each ad on its own design's profit per sale.

#### Scenario: A winner

- **WHEN** one design has a sale and the highest profit, and the others have none
- **THEN** that design is the winner and the others are testing

#### Scenario: A cheap design burns its profit

- **WHEN** a design's ad spends more than its own product's profit per sale with no sale, while another design's product earns more per sale
- **THEN** only the cheap design's ad is paused
