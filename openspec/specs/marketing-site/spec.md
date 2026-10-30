# marketing-site Specification

## Purpose

The public landing page and user docs: who wovain is for, what it does, and how to use it, in the voice set in `.agents/product-marketing.md`.

## Requirements

### Requirement: Product positioning

The landing page SHALL present wovain as print-on-demand for independent fashion designers and small labels, without internal terms (agent, MCP, model or protocol names) and without invented customers, metrics or testimonials.

#### Scenario: Copy review

- **WHEN** landing copy is changed
- **THEN** it uses the words in `.agents/product-marketing.md` and claims no users, sales or results

### Requirement: Docs for designers and developers

The docs site SHALL separate a Guide for designers from Developer internals, keep old URLs working, and ship English, French and Spanish together.

#### Scenario: Old link

- **WHEN** someone opens a docs URL from before the split
- **THEN** they reach the same page in its new location

### Requirement: Single logo source

The logo SHALL render only through the `<Logo/>` component.

#### Scenario: New mark

- **WHEN** the logo changes
- **THEN** only `<Logo/>` and its assets change

### Requirement: Product-first hero

The landing hero SHALL pair a short server-rendered headline and one primary call to action with an animated demo of an example drop in the app's own UI, from the brief to a paused campaign, labelled as an example.

#### Scenario: First screen

- **WHEN** a visitor opens the landing page at 1440 or 390 pixels wide
- **THEN** the headline, the "Start a drop" call to action and the demo are visible without scrolling, and the headline is the largest contentful paint

### Requirement: Considerate motion

Landing motion SHALL play only while on screen, SHALL pause on hover, focus or the visitor's toggle, and SHALL show a still final frame when the visitor prefers reduced motion. Animated pictures SHALL be hidden from assistive technology and carry a text alternative.

#### Scenario: Reduced motion

- **WHEN** a visitor with reduced motion opens the landing page
- **THEN** the demo shows the paused-campaign frame and does not move

#### Scenario: Off screen

- **WHEN** the demo scrolls out of view
- **THEN** its sequence stops until it is back in view

### Requirement: Show, then ask

After the hero, the landing page SHALL show results rather than describe features: the product page, the ad, the Insights chart, the connected accounts, the free start, a short FAQ and a closing call to action, each led by one headline.

#### Scenario: Page length

- **WHEN** the landing page is viewed at 1440 by 900
- **THEN** it is about five screens tall and repeats no section
