# Spec Delta

## ADDED Requirements

### Requirement: Fast suggestions

The suggestions SHALL be kept per merchant and request and served at once. A kept answer older than 6 hours SHALL still be served, for up to 7 days, while a background refresh finds a new one. Opening the app SHALL start that refresh when the default answer is missing or stale. A new search SHALL stream the step under way and each card as soon as its checks finish, then again with its words. Qloo answers SHALL be reused for 30 minutes.

#### Scenario: Kept answer

- **WHEN** a merchant opens the new-drop step and an answer is kept for their request
- **THEN** the first card shows within 2 seconds

#### Scenario: Stale answer

- **WHEN** the kept answer is 8 hours old
- **THEN** it is shown, and a refresh is queued in the background

#### Scenario: Cold search

- **WHEN** nothing is kept for the request
- **THEN** the step shows card-shaped placeholders, the step under way and the seconds so far, and each card appears as soon as it is ready

### Requirement: The brief stays usable

The merchant SHALL be able to type and submit their own brief while the suggestions load.

#### Scenario: Typing while loading

- **WHEN** the suggestions are still loading
- **THEN** the brief box accepts text and Research trends starts the drop
