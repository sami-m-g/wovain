# Tasks

## 1. Core (#113)

- [x] 1.1 Qloo `insights` and `tagsFor`; at most 4 Qloo requests in flight, retried on 429 and 5xx
- [x] 1.2 `discoverBrands`: one Qloo input per card, references, themes, buyers, Tavily momentum and saturation, ranking in code
- [x] 1.3 `brand_discovery` agent (default job), one Zod-checked call per card
- [x] 1.4 `garment-colors.ts`: the blank's known colours, WCAG contrast at 3:1, inks shifted or dropped
- [x] 1.5 `buyersPanel` for the merchant's own references
- [x] 1.6 Every step in the decision trace; every failure at error level; a Qloo failure throws
- [x] 1.7 `brand-discovery` flag (development and next on, production off)

## 2. API

- [x] 2.1 `onboarding.discover` (auto, questions, references), free with an hourly limit
- [x] 2.2 `onboarding.buyers` and `onboarding.searchTaste`; `status.discovery`
- [x] 2.3 The Fourthwall blank's colours, cached a day, with a stated stand-in

## 3. UI

- [x] 3.1 The chooser, the five-question questionnaire with Qloo autocomplete, starter cards with skeletons and a retry
- [x] 3.2 Field descriptions and tooltips, the Niche field, suggestion chips per field
- [x] 3.3 References checked on blur with plain status; the "Look up on Qloo" button removed
- [x] 3.4 "Your buyers" panel; voice from example lines; colours as swatch sets on the shirt colours, hex behind Advanced
- [x] 3.5 en, es and fr copy; "Taste data by Qloo" credit

## 4. Tests

- [x] 4.1 Different answers give different niches, references and palettes; Suggest for me differs from the questionnaire
- [x] 4.2 A failing ink is fixed; a garment colour the blank doesn't offer is never suggested
- [x] 4.3 Qloo failing throws and never calls the writer; thin Qloo answers give fewer cards
