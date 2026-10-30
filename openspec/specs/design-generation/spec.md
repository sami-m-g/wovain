# design-generation Specification

## Purpose

Turning a direction into ranked ideas with evidence, and an idea into a priced, judged print design on a real Fourthwall blank.

## Requirements

### Requirement: Evidence-backed ideas

Research SHALL ask Qloo for the direction's entities and taste themes, then Tavily for recent news and marketplace listings inside those themes, and SHALL save ranked ideas with their signals, source links and score inputs.

#### Scenario: Ideas returned

- **WHEN** a designer researches a direction
- **THEN** each saved idea shows its taste signal, moment signal, sources and score inputs

### Requirement: Never print matched names

Names Qloo matched for the direction SHALL be stored on the idea as names to avoid and SHALL never appear in the brief or the art prompt.

#### Scenario: Seed names a brand

- **WHEN** the direction names a brand or person
- **THEN** that name is excluded from the design brief and the art prompt

### Requirement: Priced design

A design SHALL have a Nemotron brief and listing, transparent print art from fal, and a price from the blank's base cost that keeps at least $10 profit and a 30% margin after card fees, sales tax and a refund reserve.

#### Scenario: Price floor

- **WHEN** a design is priced
- **THEN** the price meets both the $10 profit and the 30% margin floor

### Requirement: Judged design

Nemotron SHALL judge title, description, idea fit, originality and the garment rule from the brief, and a vision model SHALL judge the drawn artwork image. The judge SHALL return `ready` or `revise`, a score and up to five fixes. The print-size check SHALL be computed by code and the image checks SHALL come from the vision model; both SHALL override the text model.

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

### Requirement: Image checks

The vision model SHALL check that the drawn art's subject is not a garment, mockup or clothing; that it has no background and nothing is cropped; that its readable printed text matches the brief; and that it shows on each listed garment color.

#### Scenario: Art disappears on a garment color

- **WHEN** the art does not show on a listed garment color
- **THEN** that color is dropped, and the design is `revise` when no color is left

### Requirement: Relevant, recent sources

Each theme SHALL be searched with its own query, not the whole direction. Research SHALL keep a news source only when it is a web page that is not an archive or tag page, is at most 31 days old, has a Tavily relevance score of at least 0.4, and shares a word with the theme's query. Sources SHALL be deduped by page and headline and ranked by relevance and freshness.

#### Scenario: Archive page returned

- **WHEN** Tavily returns an archive page such as "Archive for March 2011"
- **THEN** that page is not saved as a source of any idea

### Requirement: Placement preview

Once a design's artwork exists, wovain SHALL render it with Fourthwall on the blank and front print region the product would use, save the mockup URLs on the design, and show them under "On a shirt" on the approval step, with "Flat art" showing the artwork alone. A failed preview SHALL be logged at error level and SHALL NOT fail the design.

#### Scenario: Preview rendered

- **WHEN** a design is drawn and the merchant's Fourthwall shop is connected
- **THEN** "On a shirt" shows Fourthwall's mockup of the art on that blank

#### Scenario: Preview failed

- **WHEN** Fourthwall's preview fails or returns no mockups
- **THEN** the error is logged at error level and the card shows the flat art with a notice

#### Scenario: Fourthwall not connected

- **WHEN** a design is drawn without a working Fourthwall connection
- **THEN** Fourthwall is not called and the card shows the flat art and asks to connect Fourthwall

### Requirement: Search failures stay local

Each Tavily search in trend research SHALL succeed or fail on its own. A failed search SHALL be logged at error level, and the theme SHALL keep the results of its other search and record which search failed. Research SHALL fail only when every search failed.

#### Scenario: Marketplace search fails

- **WHEN** a theme's marketplace search fails and its news search succeeds
- **THEN** the idea is saved from the news results, shows that the marketplace search failed, and the failure reaches error tracking

#### Scenario: Tavily is down

- **WHEN** every search for every theme fails
- **THEN** the research step fails instead of saving no ideas

### Requirement: Competitor prices from listings

While the `tavily-evidence` flag is on, research SHALL read up to 5 Redbubble, TeePublic and Etsy listing pages per theme with Tavily Extract, take one plausible price per page, and use their median for the margin score. Pages Tavily could not read SHALL be counted, and the margin SHALL fall back to search snippet prices when no page shows a price. The idea SHALL show the median with the listings it came from.

#### Scenario: Some listings can't be read

- **WHEN** Extract reads one listing and returns the others as failed results
- **THEN** the margin uses the one price read, and the idea links that listing

### Requirement: Research dossier

While the `tavily-evidence` flag is on, a merchant SHALL be able to start one Tavily Research dossier per idea, with the idea's and brand profile's Qloo taste data attached as a JSON file and a schema of why now, saturation, price band, risks and citations. The research model SHALL come from `TAVILY_RESEARCH_MODEL` (mini, pro or auto), set per environment from Pulumi config. The app SHALL save the finished dossier on the idea and show every part with its citations.

#### Scenario: Dossier finishes

- **WHEN** a merchant asks for research on an idea and Tavily completes it
- **THEN** the idea card shows why now, how crowded, the price range and the risks with numbered sources

#### Scenario: Flag off

- **WHEN** the `tavily-evidence` flag is off
- **THEN** the dossier procedures answer not found and the card shows no research button

### Requirement: Dossier failures

A dossier that Tavily fails, that Tavily finishes in a form the app can't read, or that is still pending after 15 minutes, SHALL be marked failed and logged at error level, and the merchant MAY start it again. A read of a pending dossier that errors SHALL fail the request; once the dossier is past 15 minutes, the same error SHALL mark it failed instead.

#### Scenario: Research times out

- **WHEN** a dossier is still pending 15 minutes after it started
- **THEN** the card says the research didn't finish and offers to research again

#### Scenario: Unreadable reply

- **WHEN** Tavily completes a dossier whose content doesn't match the schema
- **THEN** the dossier is marked failed at once, the error is logged, and the card offers to research again

#### Scenario: Request lost

- **WHEN** reading a pending dossier keeps erroring (for example, Tavily no longer knows its request ID)
- **THEN** each read fails while the dossier is under 15 minutes old, and the first read after that marks it failed

### Requirement: Trademark check on printed words

While the `tavily-evidence` flag is on, every phrase a design prints (except single words under 5 letters) SHALL be searched as an exact phrase on trademark registers and print-on-demand marketplaces before the judge decides. A register page whose title carries the phrase SHALL fail the design's `trademark` check. A phrase that could not be checked SHALL also fail it. The design card SHALL show each finding with its citations.

#### Scenario: Slogan matches a registered mark

- **WHEN** a brief prints a phrase whose exact text titles a trademark record
- **THEN** the design is sent back once for new words, and if still flagged the merchant sees the record linked before approving

#### Scenario: Search fails

- **WHEN** the trademark search for a phrase fails
- **THEN** the check fails closed, the failure reaches error tracking, and the merchant sees the phrase was not checked

### Requirement: Unchecked phrases hold the design without a redraw

A design whose only failed checks are trademark checks on phrases that could not be checked SHALL NOT be redrawn, since a redraw can't check them either. It SHALL be saved flagged revise for the merchant.

#### Scenario: Tavily is down while a design is judged

- **WHEN** every trademark search fails and the judge fails nothing else
- **THEN** fal draws the design once, and it is saved flagged revise with the phrase marked not checked

### Requirement: Marketplace matches are a caution

A printed phrase found only in marketplace listings SHALL NOT fail the design check; the design card SHALL show it as a caution with the listings linked.

#### Scenario: Slogan already sells

- **WHEN** a printed phrase appears in Etsy listings but on no trademark register
- **THEN** the design stays ready and its card shows the phrase already sells, with the listings

### Requirement: Product variants

With the `design-drops` flag on, a design's placement preview and its product SHALL be made in the brief's garment colors that match the blank's colors (up to 4, or the blank's first color when none matches) and in every size the blank comes in, spelled as Fourthwall lists them.

#### Scenario: Colors and sizes passed

- **WHEN** the brief lists "black" and the blank comes in White, Black and Sand Dune, sizes S to 2XL
- **THEN** the preview asks Fourthwall for Black in S, M, L and 2XL

### Requirement: Research themes are Qloo tags

Research SHALL study up to 3 distinct themes for a direction, each one a Qloo taste tag for the direction's matched entities, in Qloo's order. Research SHALL NOT make up themes from the direction, by a model or by design angles, and Tavily SHALL NOT name themes: when Qloo names fewer than 3 usable tags, research studies only those. A theme SHALL never be the direction itself, and reworded duplicates SHALL be dropped.

#### Scenario: Qloo names one theme

- **WHEN** Qloo names one usable tag for a direction
- **THEN** research saves at most one idea, titled with that tag

#### Scenario: Qloo's tag echoes the direction

- **WHEN** Qloo's only tag is the direction's own text
- **THEN** research stops with `QLOO_NO_MATCH` and searches nothing
