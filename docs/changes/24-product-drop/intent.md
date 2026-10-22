# Intent: Turn one idea into a priced multi-product drop on Fourthwall

Issue: #24

## Problem

> when the merchant asks wovain for designs, it uses Fourthwall to the max. One idea becomes a beautiful, coherent product set across multiple product types (tees, hoodies, sweatshirts, mugs, posters, stickers, hats, totes, whatever the merchant's Fourthwall catalog offers) and multiple placements (front, back, sleeve, all-over where supported), each priced from real costs with healthy margins. It should look like a real brand drop, not one tee.

Today one idea makes one tee with one front print. The merchant gets a single product, not a drop.

## Desired outcome

- The design playbook plans a product set per idea from the merchant's Fourthwall catalog: which blanks, which placements, which colors, with art variants per placement (back print, sleeve mark, pocket-size logo).
- Art per placement is generated on the merchant's own fal account.
- The design widget shows the whole set with each product's price, profit and margin, plus Approve, Skip and feedback.
- On approval, wovain creates every product, prices it from real costs, groups the set into one Fourthwall collection and publishes it.

## Constraints

- Nothing is created or published on Fourthwall before the merchant approves on the widget.
- Prices come from Fourthwall's per-size manufacturing costs and wovain's pricing rule, computed on the server.
- Fourthwall's own tools do the rendering and product creation; wovain orchestrates and checks the economics.
- Connections, Meta and ad files are owned by other work and stay untouched (`lib/connections.ts`, `lib/upstream.ts`, `tools/connections.ts`, `tools/ads.ts`, `playbooks/ads.ts`, the ad widgets).

## Open questions

None. The plan checkpoint is waived: the owner asked to build.
