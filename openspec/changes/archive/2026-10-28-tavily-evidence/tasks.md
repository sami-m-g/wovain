# Tasks

## 1. Research (#62)

- [x] 1.1 Settle each Tavily search separately; log a failure at error level and keep the other results; fail the step only when every search fails
- [x] 1.2 Read competitor prices off Redbubble, TeePublic and Etsy listings with Tavily Extract, handling `failed_results`, and feed the median to the margin score
- [x] 1.3 Start and read back a Tavily Research dossier per idea with an `output_schema` and the Qloo taste JSON attached as a file

## 2. Guardrail

- [x] 2.1 Search each printed phrase with `exact_match` on trademark registers and marketplaces
- [x] 2.2 Add the fact-only `trademark` judge rule so a match sends the design back for new words; fail closed when a search fails

## 3. UI and docs

- [x] 3.1 Citations, competitor prices, failed searches and the dossier on idea cards; trademark findings on design cards (en, es, fr)
- [x] 3.2 Say "past month" where the docs said "past week"; document the evidence layer

## 4. Ship

- [x] 4.1 Tests in `packages/core` and `packages/api`
- [x] 4.2 Open the PR that closes #62; archive this change in it
