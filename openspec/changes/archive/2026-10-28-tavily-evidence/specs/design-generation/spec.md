# Spec Delta

## ADDED Requirements

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

While the `tavily-evidence` flag is on, a merchant SHALL be able to start one Tavily Research dossier per idea, with the idea's and brand profile's Qloo taste data attached as a JSON file and a schema of why now, saturation, price band, risks and citations. The app SHALL save the finished dossier on the idea and show every part with its citations.

#### Scenario: Dossier finishes

- **WHEN** a merchant asks for research on an idea and Tavily completes it
- **THEN** the idea card shows why now, how crowded, the price range and the risks with numbered sources

#### Scenario: Flag off

- **WHEN** the `tavily-evidence` flag is off
- **THEN** the dossier procedures answer not found and the card shows no research button

### Requirement: Dossier failures

A dossier that Tavily fails, or that is still pending after 15 minutes, SHALL be marked failed and logged at error level, and the merchant MAY start it again.

#### Scenario: Research times out

- **WHEN** a dossier is still pending 15 minutes after it started
- **THEN** the card says the research didn't finish and offers to research again

### Requirement: Trademark check on printed words

While the `tavily-evidence` flag is on, every phrase a design prints (except single words under 5 letters) SHALL be searched as an exact phrase on trademark registers and print-on-demand marketplaces before the judge decides. A register page whose title carries the phrase SHALL fail the design's `trademark` check. A phrase that could not be checked SHALL also fail it. The design card SHALL show each finding with its citations.

#### Scenario: Slogan matches a registered mark

- **WHEN** a brief prints a phrase whose exact text titles a trademark record
- **THEN** the design is sent back once for new words, and if still flagged the merchant sees the record linked before approving

#### Scenario: Search fails

- **WHEN** the trademark search for a phrase fails
- **THEN** the check fails closed, the failure reaches error tracking, and the merchant sees the phrase was not checked

### Requirement: Marketplace matches are a caution

A printed phrase found only in marketplace listings SHALL NOT fail the design check; the design card SHALL show it as a caution with the listings linked.

#### Scenario: Slogan already sells

- **WHEN** a printed phrase appears in Etsy listings but on no trademark register
- **THEN** the design stays ready and its card shows the phrase already sells, with the listings
