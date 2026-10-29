# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/207

## Why

"Talk to wovain" in the header asks the merchant to say a command out of context and confirm a model's reading of it. Merchants more often want to say the words that go in a field: the brief of a drop, why a design is rejected, what the brand sounds like. Dictation puts the mic where the words go, and the merchant stays in control of what is submitted.

## What Changes

- A hold-to-talk mic inside the new-drop brief, the design "reject with a note" field and the brand questionnaire's free-text fields (niche, custom voice line). The transcript is inserted at the cursor and the merchant edits it before submitting. No intent parsing, no automatic action.
- `voice.dictate` returns the transcript only, behind the same `voice-input` flag, the same rate limit and the same speech models (fal, with its fallback).
- The header button and its confirm dialog are removed. The `voice.command` and `voice.confirm` endpoints stay: the mobile app's hold-to-talk (#88) is built on them.
- Labelled, keyboard operable (Space or Enter toggles), recording and transcribing announced to screen readers; en, es and fr.
- Not in this change: ad feedback and the approval rejection reason have no text field on main yet. They get the mic when their fields land (`DictationMic` takes a field id).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `voice-commands`: adds dictation.
