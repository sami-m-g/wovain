# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegated during `3-prd`: a TypeScript MCP server (`@modelcontextprotocol/sdk` + `@modelcontextprotocol/ext-apps`) serving React 19 widgets built on OpenAI's `@openai/apps-sdk-ui`, bundled with Vite into single-file `ui://` resources. `devpost/spec.md` (`4-spec`) confirms or overrides it.

## Users

A solo print-on-demand merchant: the learner first, then any solo POD seller who wants AI to run more of their process. They work inside ChatGPT; voice is a nice-to-have, since widget support in ChatGPT Voice is unverified. Their job: go from a trend to live products and a running Meta campaign without switching between five tools.

## Product Purpose

wovain is a ChatGPT plugin that researches trends, designs products for the merchant's Fourthwall catalog, publishes them, and launches and manages their Meta Advantage+ ads from one conversation. Success: real Fourthwall products and a live Advantage+ campaign with automated rules exist, and the merchant only talked and approved.

## Positioning

Every step ends in an approval widget built from real Fourthwall products, placements, sizes and prices, and from each product's real margin and breakeven. Nothing else is manual.

## Operating Context

- Lives inside a ChatGPT conversation; widgets appear inline in journey order (trend, design, ad, campaign, optimization). See `devpost/prd.md > Screens and Layout`.
- Connected services: Fourthwall (products, publishing, reports) and Meta Ads (campaigns, creatives, insights).
- Merchant gives feedback by typing in chat or with the widget's own controls; feedback regenerates the whole widget.

## Capabilities and Constraints

- Defined in `devpost/prd.md`: widget fields, pricing rule, breakeven math, campaign rules, and 10 failure states with copy.
- Every number shown on a widget has a source link or a visible calculation.
- ChatGPT plugin rules: system fonts and colors, brand color only on primary buttons, badges and icons, at most 2 buttons per widget, no tabs or inner scrolling.
- No API starts ChatGPT image generation from a plugin; a wovain skill asks ChatGPT to generate and hand the image to wovain's tool (to verify in `4-spec`).

## Brand Commitments

- Name: wovain (lowercase).
- Accent: indigo dye #3B4CCA, used only where ChatGPT allows brand color.
- Voice: friendly coach. Warm, explains the why in one sentence, still leads with the numbers. Example: "Video A wasn't selling, so I paused it to save budget: $30.96 spent, no sales."

## Evidence on Hand

- Real shop: Fourthwall "Wovain" (status Coming soon), real catalog blanks and base costs.
- Real Meta ad account (active, no payment method yet).
- No customers, sales, testimonials or performance data yet. Do not fabricate any.

## Product Principles

1. Approve, don't operate: the merchant decides at widgets; wovain does the clicking.
2. Show the evidence: trends, prices and margins come with sources or math.
3. Real over mock: widgets use real Fourthwall products, prices and stock.
4. Reuse, don't rebuild: Fourthwall, Meta Advantage+ and ChatGPT's own capabilities do the heavy lifting.
