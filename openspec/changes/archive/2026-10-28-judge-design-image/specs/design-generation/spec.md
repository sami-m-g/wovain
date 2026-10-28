## MODIFIED Requirements

### Requirement: Judged design

Nemotron SHALL judge title, description, idea fit, originality and the garment rule from the brief, and a vision model SHALL judge the drawn artwork image: its subject is not a garment, mockup or clothing; it has no background and nothing is cropped; its readable printed text matches the brief; and it shows on each listed garment color. The judge SHALL return `ready` or `revise`, a score and up to five fixes. The print-size check SHALL be computed by code and the image checks SHALL come from the vision model; both SHALL override the text model.

#### Scenario: Art too small

- **WHEN** the art does not meet the blank's print size
- **THEN** the verdict is `revise` whatever the model said

#### Scenario: Art is a picture of a garment

- **WHEN** the drawn artwork shows a T-shirt or other clothing as its subject
- **THEN** the `garment` check fails and the verdict is `revise`

#### Scenario: Art disappears on a listed color

- **WHEN** the art is dark and the brief lists black and sand
- **THEN** black is dropped from the brief's garment colors and the design can still be `ready`

#### Scenario: Art shows on no listed color

- **WHEN** the art disappears on every listed garment color
- **THEN** the `contrast` check fails and the verdict is `revise`

#### Scenario: Printed text differs from the brief

- **WHEN** the readable text in the art differs from the brief's printed text
- **THEN** the `printed_text` check fails and the verdict is `revise`
