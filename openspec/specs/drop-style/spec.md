# drop-style Specification

## Purpose

Give each drop its own tone and palette, suggested from its Qloo audience and the brand defaults, held to the blank's real colours, picked by the merchant and used by the brief and ad writers, with the brand voice as guardrails.

## Requirements

### Requirement: A tone and palette per drop

While the `drop-style` flag is on, the system SHALL suggest for each idea three tones (a label and an example listing line) and up to three palettes, starting from the brand's voice and colours and adapted to the idea's Qloo audience cues, and SHALL save them on the idea. The suggestion SHALL be recorded in the decision trace. With the flag off, `ideas.style` and `ideas.pickStyle` SHALL answer 404 and the writers SHALL get no style.

#### Scenario: Two audiences

- **WHEN** one idea's Qloo cues are gothic and moody and another's are pastoral and cosy
- **THEN** their suggested tones and palettes differ

### Requirement: Palettes held to the blank

Each suggested palette SHALL use only garment colours the blank comes in, and each ink colour SHALL have a contrast ratio of at least 3:1 on every chosen garment colour. When the drop's blank changes, the palettes SHALL be re-checked against the new blank's colours.

#### Scenario: Another blank

- **WHEN** a drop's palette is on Black and the drop moves to a blank that only comes in White
- **THEN** the palettes are re-fitted to White, and none lists Black

### Requirement: Picked, then used by the writers

The new-drop flow SHALL show the suggested tones as example lines and the palettes as swatch sets on the shirt colours, each with an info tooltip, and the merchant SHALL pick one of each. The pick SHALL be saved and recorded in the decision trace. The brief writer SHALL write in the picked tone and draw in the picked inks and garments; the ad writer SHALL write in the picked tone.

#### Scenario: Pick a palette

- **WHEN** the merchant picks the second colour set
- **THEN** the idea's style saves that palette and the next brief uses its inks

### Requirement: Brand voice as guardrails

The brand voice SHALL reach the brief writer and the ad writer as guardrails that the drop's tone never breaks. A failed style suggestion SHALL be logged at error level, and the drop SHALL continue without a style.

#### Scenario: Never crude

- **WHEN** the brand voice says "never crude" and a drop's tone is playful
- **THEN** both writers get "never crude" as a guardrail with the playful tone
