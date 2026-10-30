## ADDED Requirements

### Requirement: The drop's Campaign step

After its products are live, a drop SHALL continue to a Campaign step showing the ad creatives, the copy once written, Qloo's audience, the budget and the spend rules, with one Launch campaign action. Its confirm SHALL be the designer's approval to activate, inside their caps. Without Meta, the step SHALL show the creatives and how to connect Meta, and SHALL NOT launch.

#### Scenario: Last product published

- **WHEN** the designer publishes the drop's last hidden product
- **THEN** the drop opens its Campaign step with the products' creatives

#### Scenario: Launch with live media buying

- **WHEN** the designer confirms Launch campaign with Meta connected and live media buying on
- **THEN** the paused campaign is staged if needed, asked to go live and approved in their name, and the drop moves to done

#### Scenario: Meta not connected

- **WHEN** the Campaign step opens without a Meta connection
- **THEN** it shows the creatives and Connect Meta to launch, and Launch campaign is disabled
