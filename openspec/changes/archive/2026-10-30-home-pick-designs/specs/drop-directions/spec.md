## ADDED Requirements

### Requirement: A Home pick opens the drop at its designs

Picking a direction on the Home SHALL start a drop whose one idea is that direction, saved with the evidence and checked words it was shown with. The drop SHALL open at its designs, with its brief and trends done, and draw that idea without new research or an ideas gate. The pick SHALL cost the research credits a typed brief's research does. A kept answer older than 6 hours SHALL have the direction's news, listings and proof of demand read again first. A typed brief SHALL keep its Trends step.

#### Scenario: Pick a fresh idea

- **WHEN** the merchant clicks "Start this drop" on a Home idea kept less than 6 hours ago
- **THEN** a drop opens at its designs with that idea, the research credits are charged once, and no research runs

#### Scenario: Pick a stale idea

- **WHEN** the picked idea was kept more than 6 hours ago
- **THEN** its news, listings and proof of demand are read again before the idea is saved

#### Scenario: The suggestions changed

- **WHEN** the picked idea is no longer in the kept suggestions
- **THEN** the pick is refused with 409, and no drop is saved and no credits are charged
