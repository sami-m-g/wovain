# Spec Delta

## MODIFIED Requirements

### Requirement: Drops chosen by taste

With the `design-drops` flag on, the ideas step of a drop SHALL offer "Make it a capsule": the first picked idea becomes 4 to 6 products that share one palette and one set of art, shown in the same step. Code SHALL choose a style family from the Qloo tags of the idea's run and the brand's niches, and the product mix from the family. The choice and the tags behind it SHALL be saved in the decision trace with the Qloo tags as sources and shown on the capsule.

#### Scenario: Skate tags

- **WHEN** the run's Qloo tags include "Skate punk" and "Grunge revival"
- **THEN** the capsule's style family is skate and punk, its products are a heavyweight tee, a long-sleeve tee, a beanie and a sticker, and the step names the two tags

#### Scenario: No matching tag

- **WHEN** no tag matches a style family
- **THEN** the capsule uses streetwear and says so

#### Scenario: Flag off

- **WHEN** the flag is off for the merchant
- **THEN** the drops procedures answer 404 and the ideas step shows no capsule panel

## ADDED Requirements

### Requirement: One concept, drop

The app SHALL call one pass through the flow a drop in every user-facing word: the nav, the history page, the copy in every locale and the docs. The Drops page SHALL list every drop, newest first, and the old Runs address SHALL redirect to it. There SHALL be no separate capsule page. The breadcrumb SHALL read Overview › Drops on the Drops page and Overview › Drops › New drop in the flow. Database tables and API names MAY keep "run".

#### Scenario: Old address

- **WHEN** a merchant opens `/dashboard/runs`
- **THEN** they land on `/dashboard/drops`, titled Drops

#### Scenario: Capsule after the idea

- **WHEN** a merchant picks an idea and clicks "Make it a capsule"
- **THEN** the capsule is planned from that idea and shows in the same step, with its products and its publish button
