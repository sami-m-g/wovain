# Spec Delta

## ADDED Requirements

### Requirement: Each path keeps its own fields

The brand step SHALL keep one draft of the niche, references, voice and colours for each way in (Suggest for me, the questionnaire, "I already know my brand"). Switching paths SHALL keep the draft of the path left and show the draft of the path entered. A path not visited yet SHALL start clean, except "I already know my brand", which starts from what was saved. Values SHALL never carry over from one path to another.

#### Scenario: Back to a suggestion path

- **WHEN** the merchant types a niche under "I already know my brand" and then chooses the questionnaire
- **THEN** the questionnaire shows no fields until a card is picked, and going back to "I already know my brand" shows the typed niche

### Requirement: Colours from plain words

The colours field SHALL accept a few plain words, a feeling ("warmer", "bolder") or colour names ("rust and cream"), and SHALL answer with up to 3 colour sets. These are held to the blank's colours with ink contrast of at least 3:1, and the request is recorded in the decision trace. Hex entry SHALL stay behind an Advanced disclosure.

#### Scenario: Warmer

- **WHEN** the merchant types "warmer" with a palette already picked
- **THEN** up to 3 warmer colour sets appear on the shirt colours, every ink reading at 3:1 or better, and the first is picked
