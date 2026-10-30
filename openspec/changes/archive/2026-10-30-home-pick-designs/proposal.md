# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/283

## Why

Picking an idea in "What sells now" on the Home restarts the drop at its brief and researches the brief text again. The idea already went through Qloo and the evidence check, and is kept for 6 hours. The merchant waits for Trends to re-decide an idea they already picked.

## What Changes

- `runs.startFromDirection` starts a drop from a picked direction: the direction, read from the kept answer the page showed, is saved as the run's one idea with its evidence and checked words. The run opens at its designs and draws that idea.
- The run workflow takes the pick as input (`input.pick`): research, naming and the ideas gate pass it through. The typed-brief flow keeps its Trends step.
- A pick costs the research credits a typed brief's research does (`charge("research")`, given back when the pick can't be saved): its research was done.
- A kept answer older than 6 hours has the picked direction's news, listings and proof of demand read again first; its Qloo evidence and words stay.
- A pick no longer in the kept answer is refused (409), saving and charging nothing.

## Capabilities

### Modified Capabilities

- `drop-directions`: a Home pick opens the drop at its designs.
