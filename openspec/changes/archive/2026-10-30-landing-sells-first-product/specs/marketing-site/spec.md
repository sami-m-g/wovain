# Spec Delta

## MODIFIED Requirements

### Requirement: Product positioning

The landing page SHALL present wovain as print-on-demand for people with no selling experience: from an idea that sells to a live product on their Fourthwall shop and Meta ads built paused, with no design skills and no inventory. It SHALL claim only what the product does today, SHALL say that ads need the seller's own Meta ad account and run only after the seller approves them, and SHALL NOT invent customers, metrics, results or testimonials.

#### Scenario: Copy review

- **WHEN** landing copy is changed
- **THEN** it matches the flow as it runs on next, claims no users, sales or ad results, and says campaigns are built paused until the seller approves them

### Requirement: Product-first hero

The landing hero SHALL pair a short server-rendered headline and one primary call to action with an animated demo of an example run in the app's own UI, in the order the app runs it: an idea picked on Home, the Designs review with its research report, tone and colours, the designs drawn and checked, the product published to Fourthwall and the campaign built paused under its spend rules.

#### Scenario: First screen

- **WHEN** a visitor opens the landing page at 1440 or 390 pixels wide
- **THEN** the headline, the primary call to action and the demo are visible without scrolling, and the headline is the largest contentful paint

#### Scenario: Demo order

- **WHEN** the demo plays through once
- **THEN** it shows Home, Designs, Products and Campaign in that order and ends on a campaign marked as built paused, waiting for approval

### Requirement: Show, then ask

After the hero, the landing page SHALL show how a first product is made in five steps, the evidence behind each idea and the spend rules, the accounts to connect, the plans from the billing catalog, a short FAQ and a closing call to action, each led by one headline.

#### Scenario: Page length

- **WHEN** the landing page is viewed at 1440 by 900
- **THEN** it is about six screens tall and repeats no section

#### Scenario: Pricing matches the catalog

- **WHEN** the landing page shows the plans
- **THEN** their names, prices and credits come from the billing catalog, and plans not on sale are marked coming soon
