# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

1. **Hackathon judges** see the site first. They want a ready, good, real product they can sign up for and use, not a pitch deck.
2. **Creators and sellers**: YouTubers, streamers, bands and small brands who sell merch on Fourthwall and advertise on Meta. They want new products and ads without doing the research, artwork, listings and campaign set-up by hand. They work in ChatGPT or on the wovain website.

## Product Purpose

wovain turns one brief into a launched product drop. It researches what the creator's audience loves and what is moving this week, generates designs, waits for the creator's approval, publishes the products on Fourthwall at a price that clears a set profit, writes ad variants and builds a Meta campaign that is created paused. Autopilot runs the same flow with fewer stops. Success: real Fourthwall products and a ready, paused Meta campaign, while the creator only briefed and approved.

wovain starts with print-on-demand and grows into apparel-on-demand. Mention this lightly; the identity must outlive print.

## Positioning

Every step ends in something the creator can see and approve, built from real Fourthwall blanks, base costs, prices and margins, with the research sources attached. The campaign is always created paused, so the creator stays in control of spend.

## Operating Context

- Two surfaces with the same agents and approvals: the ChatGPT app (MCP server) and the web app.
- Connected per creator: Fourthwall (shop, catalog, publishing) and Meta (ad account, Page, pixel). Run on wovain's keys: Qloo (taste graph), Tavily (news and listing scans), Nebius Token Factory with NVIDIA Nemotron (judge, autopilot, ad copy) and fal (artwork).
- Pricing rule in code (`packages/core/src/pricing.ts`): at least $10 profit and a 30% margin after card fees, sales tax and a refund reserve. Daily ad budget $1 to $500.

## Capabilities and Constraints

- Seller flow: brief → trend picks → designs with a Nemotron check → approve or give feedback → Fourthwall products (created hidden, then published) → ad variants → paused campaign.
- Autopilot switch, run history, connections page, ChatGPT consent screen.
- Locales: English, French, Spanish.
- No billing exists in the product today; signing up needs no card.

## Brand Commitments

- Name: wovain, always lowercase.
- Feel: a blend of a friendly creator tool (warm, approachable, creator-first, like Canva, Shopify, Gumroad) and a craft atelier with AI precision (material honesty and calm, like Aesop, Arc'teryx, Patagonia, with Linear, Stripe, Vercel precision in the product UI).
- References: identity from Aesop, Arc'teryx, Patagonia; product UI from Linear, Stripe, Vercel; commerce from Everlane (transparent pricing), Ssense (editorial), Printful; SEO structure from Shopify, Canva, Zapier (integration, use-case and guide pages).
- Logo (approved 2026-10-25): the Flick w mark, a plain lockup for navigation and a seam lockup for brand moments; files in `apps/web/public/brand/`. Palette: cochineal #B0245F, plum ink #3B1530, calico #F7F1E8, saffron #F3B23A. Everything visual reads from the semantic tokens and the `<Logo/>` component.
- Anti-reference: the earlier "printer's ink swatch book" world. It was print-only and read as a gimmick.
- Voice: friendly coach. Warm, explains the why in one sentence, leads with the numbers.

## Evidence on Hand

- Real: the working seller flow, the ChatGPT MCP server, the pricing rule, the Fourthwall, Meta, Qloo, Tavily, Nebius and fal integrations, and the docs at docs.wovain.com.
- Absent: customers, sales, testimonials, logos of users, performance numbers. Never fabricate them. Example data shown in the product or on the site is labelled as an example.

## Product Principles

1. Approve, don't operate: the creator decides; wovain does the clicking.
2. Show the evidence: every price, margin and idea comes with its math or its sources.
3. Real over mock: real Fourthwall blanks, base costs and stock.
4. Nothing spends by itself: campaigns are created paused.
5. Reuse, don't rebuild: Fourthwall, Meta Advantage+ and the host agent do the heavy lifting.

## Accessibility & Inclusion

WCAG 2.2 AA: axe reports zero violations, keyboard and screen reader paths work through the whole flow, motion respects reduced-motion. Lighthouse 95 or more in every category, mobile performance included.
