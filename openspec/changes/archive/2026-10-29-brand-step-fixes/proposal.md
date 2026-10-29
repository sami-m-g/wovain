# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/126

## Why

Testing #117 on next, the user found three problems in the brand step:

- Switching between "I already know my brand" and the suggestion paths carries field values over.
- The copy promises colours described in plain words, but only a hex field exists.
- The chooser cards can paint over the sticky top bar.

## What Changes

- **One draft per path.** Suggest for me, the questionnaire and "I already know my brand" each keep their own draft of the fields. Leaving a path keeps its draft; a path starts clean, or from what was saved for the manual path, until a card is picked.
- **Colours in plain words.** A "Describe your colours" field (for example "warmer", "bolder", "rust and cream") asks `onboarding.recolour` for 3 colour sets. They are held to the blank's colours with ink contrast of at least 3:1, like every suggestion, and recorded in the decision trace (`palette.words`), at most 30 an hour. Hex entry stays behind Advanced.
- **Top bar above the page.** The dashboard's page content is its own stacking context (`isolate`) and the sticky bar sits at `z-30`, so no element in the page, such as a focused toggle with `z-10`, can paint over it.

## Capabilities

### Modified Capabilities

- `brand-discovery`: per-path drafts and colours from plain words.
