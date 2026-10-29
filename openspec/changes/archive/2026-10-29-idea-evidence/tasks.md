# Tasks

## 1. Core (#194)

- [x] 1.1 `sweet-spot.ts`: demand and supply points, the gate, the saturated rules and the Wilson lower bound
- [x] 1.2 `idea-card.ts`: the one card contract (`make`, `why`, `audience`, `competition`), with `ok | unavailable(reason)` per section
- [x] 1.3 `idea-words.ts` and the `idea_words` agent: a title and concept from the evidence, the grounding guard and a raw-tag check, one retry
- [x] 1.4 `drop-directions.ts`: the gate, the card and checked words behind `gate`
- [x] 1.5 `trends.ts`: marketplace proof and the listings read per theme; gated, ranked ideas
- [x] 1.6 `who-buys.ts`: scope, brief demographics for tag-only ideas, off-topic audiences left out
- [x] 1.7 The `idea-evidence-gate` flag (development and next on, production off)

## 2. API and workflow

- [x] 2.1 `researchSourcesFor` reads the flag; `listIdeas` returns `card`
- [x] 2.2 The run workflow's `name` step (`nameIdeas`)
- [x] 2.3 Directions: the gate, the `withdrawn` event and a separate cache key
- [x] 2.4 Who buys reads each idea's tag, and reads answers kept before scopes again

## 3. Web

- [x] 3.1 `IdeaCard` copy in en, es and fr; the stream drops a withdrawn card

## 4. Tests

- [x] 4.1 The ranking (thin below proven, open above crowded, the gap bonus)
- [x] 4.2 Both extremes dropped; the double count removed; the gate
- [x] 4.3 Words: grounded retry, ungrounded twice, the raw tag, a failed call
- [x] 4.4 Directions and trends behind the gate; the card; the who-buys scope
