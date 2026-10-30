# Spec Delta

## ADDED Requirements

### Requirement: Dictation into text fields

The web SHALL offer a hold-to-talk microphone inside the new-drop brief, the design rejection note and the brand questionnaire's free-text fields, shown only while the `voice-input` flag is on. Releasing it SHALL insert the transcript at the field's cursor, replacing any selection and within the field's length limit. The merchant SHALL edit the text before submitting. Dictation SHALL NOT parse intent, call a model beyond speech to text, or run any action.

#### Scenario: Dictating a brief

- **WHEN** a merchant holds the mic beside the brief, speaks and releases
- **THEN** the words appear at the cursor in the brief and nothing is submitted

#### Scenario: Flag off

- **WHEN** the `voice-input` flag is off
- **THEN** no field shows a microphone and `voice.dictate` fails with not found

### Requirement: Dictation shares the voice limits and privacy

`voice.dictate` SHALL use the same speech models, fallback, clip limits and rate limit as voice commands, and SHALL return the transcript to the merchant only. Analytics and logs SHALL receive the model and fallback, never the words. The first use SHALL show the disclosure that wovain doesn't store the recording and that fal turns it into text.

#### Scenario: Rate limit

- **WHEN** a merchant dictates past the voice rate limit
- **THEN** the request fails with `VOICE_RATE_LIMITED` before any paid call

### Requirement: Dictation is accessible

Each microphone SHALL have a label that names its field, SHALL work from the keyboard (Space or Enter starts and stops), and SHALL announce listening and transcribing to screen readers.

#### Scenario: Keyboard

- **WHEN** a merchant focuses the mic and presses Space
- **THEN** recording starts, a screen reader announces it, and Space again stops and transcribes
