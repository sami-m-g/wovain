## ADDED Requirements

### Requirement: A test favours winning angles

While the `feedback-loop` flag is on, a drop's test SHALL split its spend floor (half the daily budget) as follows. Half SHALL be split evenly across the designs. The other half SHALL be split in proportion to each design's outcome multiplier. The shares SHALL sum to the floor. Without a track record, or when the multipliers can't be read, the split SHALL be even.

#### Scenario: One design's angles sold before

- **WHEN** a $30 test has three designs, and the first has twice the multiplier of the others
- **THEN** the first ad set's minimum daily spend is higher than the others', every ad set keeps at least $2.50, and the three add up to at most $15

### Requirement: Kill rules on the real cost per sale

While the `feedback-loop` flag is on and the merchant's ads have made at least `realCpaMinPurchases` purchases (10 by default, a setting the merchant can override), the target cost per sale SHALL be the lower of two values. One is the profit per sale. The other is the real cost per sale: total ad spend plus 3 purchases at the profit per sale, divided by total purchases plus 3. The target SHALL never be above the profit per sale. A kill's reason SHALL say when it used the real cost per sale.

#### Scenario: Sales cost less than they earn

- **WHEN** a merchant's 12 purchases cost $60 in ads and a sale earns $10
- **THEN** the target cost per sale is $6, and an ad that spends $7 with no sale and no add-to-cart is paused

#### Scenario: Too few purchases

- **WHEN** the merchant's ads have made 9 purchases
- **THEN** the target cost per sale is the profit per sale
