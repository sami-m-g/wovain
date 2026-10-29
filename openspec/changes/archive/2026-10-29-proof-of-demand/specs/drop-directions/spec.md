# Spec Delta

## ADDED Requirements

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
