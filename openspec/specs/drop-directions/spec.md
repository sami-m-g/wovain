# drop-directions Specification

## Purpose

Open each new drop with what to sell now, with or without a brand: directions Qloo finds rising (across audiences, or among the brand's fans), ranked in code with Tavily momentum and marketplace saturation, shown as one-click cards with their evidence, and never made without Qloo.

## Requirements

### Requirement: What to sell now, no brand needed

The new-drop step SHALL open with up to 5 directions to sell now, without a brand and without a typed seed. With no brand (or "Ignore my brand this time" on), each direction SHALL grow from one Qloo audience: the genre tag shared by what is rising among its fans. "Show me others" SHALL ask for a new set of audiences. The free-text brief SHALL stay.

#### Scenario: No brand

- **WHEN** a merchant with no brand opens the new-drop step
- **THEN** they see 3 to 5 directions, each naming the Qloo audience it is for, and no step asks them to set a brand first

#### Scenario: Show me others

- **WHEN** the merchant clicks "Show me others"
- **THEN** the directions come from a different set of Qloo audiences

### Requirement: Behind the drop-directions flag

The directions SHALL show only while the `drop-directions` flag is on. With the flag off, `runs.directions` SHALL answer 404 and the step SHALL show the brief only.

#### Scenario: Flag off

- **WHEN** the `drop-directions` flag is off
- **THEN** `runs.directions` answers 404 and the step shows the free-text brief only

### Requirement: Within the brand when there is one

When the merchant has a brand with Qloo references, the directions SHALL stay within it: the tags carried by what Qloo finds rising among the fans of the brand's references, a tag that only restates the brand's niche left out. "Ignore my brand this time" SHALL switch to the audience directions for this drop only.

#### Scenario: Different brands

- **WHEN** two brands with different Qloo references open the new-drop step
- **THEN** their directions differ

#### Scenario: Ignore the brand

- **WHEN** a merchant with a brand turns on "Ignore my brand this time"
- **THEN** the directions come from Qloo audiences, and the brand is unchanged

### Requirement: Ranked by sales potential

The system SHALL rank directions in code by Qloo affinity x momentum (Tavily news in the past month) x low saturation (near-identical marketplace listings). Nemotron SHALL only write the title, the brief and the "why now" line, validated by a schema; when the words fail, the directions SHALL still be shown with plain words from their facts.

#### Scenario: Crowded theme

- **WHEN** one direction's theme has many near-identical listings and another's has none
- **THEN** the crowded one ranks lower and says how many similar listings there are

### Requirement: Evidence gate behind the flag

While the `idea-evidence-gate` flag is on, directions SHALL pass the evidence gate and rank by the sweet spot's lower bound (capability `idea-evidence`), by demand against supply, and each SHALL carry the one idea card. A direction whose words fail the evidence check twice SHALL be withdrawn.

#### Scenario: Crowded theme behind the gate

- **WHEN** the `idea-evidence-gate` flag is on and a theme has 8 or more near-identical listings of 20
- **THEN** it is not suggested, and the decision trace records it as `saturated`

### Requirement: One-click cards with evidence

Each direction SHALL be a card with a title, a "why now" line, the audience (when it grew from one), the rising Qloo entities, the news count with links, and the similar-listings count. Clicking it SHALL start the drop with its brief.

#### Scenario: Start from a direction

- **WHEN** the merchant clicks a direction
- **THEN** a run starts with that direction's brief as its seed

### Requirement: Never without Qloo

Every direction SHALL come from Qloo. When every Qloo call fails, the request SHALL fail with `DISCOVERY_QLOO_FAILED`, the step SHALL offer a retry, and no Tavily or Nemotron call SHALL be made. With the `trends-qloo` kill switch off, the request SHALL answer `QLOO_OFF`.

#### Scenario: Qloo down

- **WHEN** Qloo answers 503 to every call
- **THEN** the step shows the failure and a Try again button, and no direction is shown

### Requirement: Traced, free and limited

Each request SHALL be saved as a decision trace (agent `drop_directions`, with the scope: brand or open). Directions SHALL cost no credits, and each merchant SHALL make at most 20 requests an hour.

#### Scenario: Over the limit

- **WHEN** a merchant asks for directions a 21st time in an hour
- **THEN** the request answers 429 `DIRECTIONS_LIMIT`

### Requirement: Fast suggestions

The suggestions SHALL be kept per merchant and request and served at once. A kept answer older than 6 hours SHALL still be served, for up to 7 days, while a background refresh finds a new one. Opening the app SHALL start that refresh when the default answer is missing or stale. A new search SHALL stream the step under way and each card as soon as its checks finish, then again with its words. Qloo answers SHALL be reused for 30 minutes.

#### Scenario: Kept answer

- **WHEN** a merchant opens the new-drop step and an answer is kept for their request
- **THEN** the first card shows within 2 seconds

#### Scenario: Stale answer

- **WHEN** the kept answer is 8 hours old
- **THEN** it is shown, and a refresh is queued in the background

#### Scenario: Cold search

- **WHEN** nothing is kept for the request
- **THEN** the step shows card-shaped placeholders, the step under way and the seconds so far, and each card appears as soon as it is ready

### Requirement: Only whole answers kept

An answer with no suggestion, or one whose news or listings read failed, SHALL never be kept. One already kept SHALL be read as missing.

#### Scenario: Empty answer

- **WHEN** a search finds no suggestion
- **THEN** the answer is not kept, and the next visit searches again

### Requirement: The brief stays usable

The merchant SHALL be able to type and submit their own brief while the suggestions load.

#### Scenario: Typing while loading

- **WHEN** the suggestions are still loading
- **THEN** the brief box accepts text and Research trends starts the drop

### Requirement: Proof of demand

A suggested direction SHALL be proven to sell: a shop running an apparel ad on it for 14 days or more (Meta Ad Library, when the merchant's Meta account is connected), a bestseller listing, or at least 50 reviews on matching listings (Etsy, Amazon or Redbubble). Themes without proof SHALL be dropped, never shown to fill the list. Directions SHALL be ranked by demand x Qloo audience fit x market openness. The card SHALL show the proof and who buys it.

#### Scenario: Nothing sells

- **WHEN** no shop advertises a theme and no listing for it is a bestseller or reviewed
- **THEN** it is not suggested, and the decision trace records it as dropped

#### Scenario: Evergreen ads

- **WHEN** four shops have advertised a theme for 30 days or more
- **THEN** it ranks above an otherwise equal theme without such ads, and its card says so

### Requirement: Apparel ads only

An Ad Library ad SHALL count as proof only when it names the theme and shows a product (an apparel word, or shop words with a landing on a shop platform such as Etsy, Amazon, Redbubble or a Shopify store), and is not an ad for books, stories, cars, classes, apps, games, tickets or money.

#### Scenario: Gothic t-shirt noise

- **WHEN** a search for "gothic t-shirt" returns a novel, a baseball academy, a car tee shop and a gothic moth tee shop
- **THEN** only the gothic moth tee shop counts

### Requirement: Who buys each suggestion

Each suggestion SHALL offer "Who buys this": the age and gender lean, audiences, cities and fashion brands from Qloo for the entities rising for it, read when the merchant opens it.

#### Scenario: Opening who buys

- **WHEN** the merchant chooses Who buys this on a suggestion
- **THEN** the card shows who buys it and where, from Qloo

### Requirement: A Home pick opens the drop at its designs

Picking a direction on the Home SHALL start a drop whose one idea is that direction, saved with the evidence and checked words it was shown with. The drop SHALL open at its designs, with its brief and trends done, and draw that idea without new research or an ideas gate. The pick SHALL cost the research credits a typed brief's research does. A kept answer older than 6 hours SHALL have the direction's news, listings and proof of demand read again first. A typed brief SHALL keep its Trends step.

#### Scenario: Pick a fresh idea

- **WHEN** the merchant clicks "Start this drop" on a Home idea kept less than 6 hours ago
- **THEN** a drop opens at its designs with that idea, the research credits are charged once, and no research runs

#### Scenario: Pick a stale idea

- **WHEN** the picked idea was kept more than 6 hours ago
- **THEN** its news, listings and proof of demand are read again before the idea is saved

#### Scenario: The suggestions changed

- **WHEN** the picked idea is no longer in the kept suggestions
- **THEN** the pick is refused with 409, and no drop is saved and no credits are charged
