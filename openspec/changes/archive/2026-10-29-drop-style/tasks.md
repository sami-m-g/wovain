# Tasks

## 1. Core (#120)

- [x] 1.1 `suggestDropStyle`: 3 tones and 3 palettes from the brand defaults and the idea's Qloo cues; palettes held to the blank; traced
- [x] 1.2 `refitStyle` for another blank; `writerStyle` for the writers
- [x] 1.3 `draftBrief` and `writeAdCopy` take the style, with the brand voice as guardrails
- [x] 1.4 `drop_style` agent (default job); `drop-style` flag

## 2. Data and API

- [x] 2.1 `idea.style` column and migration
- [x] 2.2 `ideas.style` and `ideas.pickStyle`, the pick recorded in the trace
- [x] 2.3 The design and campaign steps read the style; a failure is logged and the drop goes on

## 3. UI

- [x] 3.1 "This drop's tone and colours" panel on picked ideas, with tooltips and swatch sets; en, es and fr

## 4. Tests

- [x] 4.1 Drops with different Qloo audiences get different tones and palettes
- [x] 4.2 The brand voice reaches the brief and the ad writer as guardrails
- [x] 4.3 Palettes pass contrast on the blank and are re-checked on another blank
