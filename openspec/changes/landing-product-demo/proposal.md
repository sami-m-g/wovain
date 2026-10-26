# Proposal

MR: `feat/hero-product-demo`. Issue: not filed yet (to link before merge).

## Why

The first screen decides whether a judge or a designer stays. The old hero led with a paragraph and put a still product window below it, and the page then told the story again in four text-heavy sections. The product is more convincing than the copy, so the page should show it.

## What Changes

- The hero is the product: a short headline, one supporting line, "Start a drop" (sign-up) and "See how it works" (scrolls to the results), beside an animated demo of one example drop in the app's own UI. The demo types the brief, shows trend ideas with their evidence, four designs on blanks with print scores, approves one with a cursor click, lists it on Fourthwall with its price and profit, and shows the Meta ad with a "Campaign: Paused" badge. The Shuttle loader runs between steps.
- The demo plays only on screen, pauses on hover, focus or a visible toggle, and shows the finished frame, still, under reduced motion. It is hidden from assistive tech, with a text alternative in its caption. The headline stays the server-rendered LCP element; the demo box has a fixed aspect ratio, so nothing shifts.
- The rest of the page becomes results (the product page, the ad and the Insights chart with example data), the connected accounts as Magic UI animated beams, "Free to start", a four-question FAQ and the closing call to action. The how-it-works timeline and the outcomes bullets are removed.
- en, fr and es copy changed together.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `marketing-site`: the landing page's structure and motion rules (delta on `add-product-landing-and-docs`).

## Impact

`apps/web` landing route, marketing components and messages; `packages/ui` gains Magic UI's `animated-beam` (via the shadcn CLI). Header and footer "How it works" links now point at the results section.
