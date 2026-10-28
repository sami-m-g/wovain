# Spec Delta

## ADDED Requirements

### Requirement: Placement preview

Once a design's artwork exists, wovain SHALL render it with Fourthwall on the blank and front print region the product would use, save the mockup URLs on the design, and show them under "On a shirt" on the approval step, with "Flat art" showing the artwork alone. A failed preview SHALL be logged at error level and SHALL NOT fail the design.

#### Scenario: Preview rendered

- **WHEN** a design is drawn and the merchant's Fourthwall shop is connected
- **THEN** "On a shirt" shows Fourthwall's mockup of the art on that blank

#### Scenario: Preview failed

- **WHEN** Fourthwall's preview fails or returns no mockups
- **THEN** the error is logged at error level and the card shows the flat art with a notice

#### Scenario: Fourthwall not connected

- **WHEN** a design is drawn without a working Fourthwall connection
- **THEN** Fourthwall is not called and the card shows the flat art and asks to connect Fourthwall
