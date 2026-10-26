# Spec Delta

## Purpose

How the signed-in app presents a drop, its run and its approvals, in the visual system of `apps/web/DESIGN.md` and the voice of `.agents/product-marketing.md`.

## ADDED Requirements

### Requirement: Run status in plain words

The run view SHALL show the current step, what the run is waiting for and, when it failed, which step failed and the next action, without internal terms.

#### Scenario: Waiting for approval

- **WHEN** a run is waiting for the designer's decision
- **THEN** the run view says so and links to the design to approve

### Requirement: Approval shows the math

The approval screen SHALL show the design on its blank with price, profit, margin and the judge's verdict and fixes.

#### Scenario: Design ready

- **WHEN** a design is pending approval
- **THEN** the designer sees its price breakdown and verdict before choosing approve or reject

### Requirement: Every state designed

Each signed-in screen SHALL have empty, loading and error states, and SHALL work at phone width in light and dark themes.

#### Scenario: No drops yet

- **WHEN** a designer with no runs opens the dashboard
- **THEN** they see the setup checklist and one action to start a drop
