# Verify: Turn one idea into a priced multi-product drop on Fourthwall

## Tests added

- `apps/server/test/unit/publish-design.test.ts`: the publish order for one product (shop, create, price, public, slugs); a drop priced per product and grouped in one public collection; a refusal names the product and keeps the created offers, and the retry creates only the missing ones; a reused collection; a per-variant price refusal stops the publish; an unreadable create reply stops before saving; no shop address stops before creating anything.
- `apps/server/test/unit/art-plan.test.ts`: transparent PNG at print size per shape; the edit route when a piece references earlier art; https-only references.
- `apps/server/test/unit/drop.test.ts`: one-of-each totals and margin; blurry prints anywhere in the drop are named.
- `apps/server/test/integration/design-tools.test.ts`: wovain prices the hero and every range product itself and ignores agent prices; the model can't record `publishing` or `live`; approval only for the hashed content; publishing needs the approval and one publish holds it at a time (a stale claim gives way after 10 minutes); a redraw clears the approval; a redraw keeps offers only for unchanged products and drops the hero offer and collection when the hero's customization changes; `publish_design` without connections answers `configured: false`.
- `apps/server/test/integration/confirm.test.ts`: the merchant signs in through the (fake) AuthKit, sees the drop's prices and confirms, and the design is approved for its hash; the form works once; a link works once; another wovain account gets 403; a cross-site POST gets 403 and another browser's cookie gets 400; a design changed after the link was made isn't approved.
- `apps/widgets/src/design/design-widget-view.stories.tsx`: `Drop`, `DropDark`, `DropLowResolution`, `DropLive`, `ApproveWaitsForConfirmation`.

## Checks run

All pass on the final commit: `pnpm check`, `pnpm typecheck`, `pnpm knip`, `pnpm arch`, `pnpm dupes` (0 clones), `pnpm test` (98 unit), `pnpm test:integration` (91), `pnpm build`, `pnpm test:stories` (37, axe included). Storybook was checked by eye in light and dark.

`oxlint.config.ts`: `max-lines` lowered from 428 to 402 and `max-lines-per-function` from 225 to 224, today's worst files.

## Review findings

`/simplify` ran four reviewers (reuse, simplification, efficiency, altitude), plus a silent-failure review. The `pr-review-toolkit` agents aren't installed here.

Fixed:

- The shop was fetched twice per publish: now once, inside the publish.
- The blur logic was duplicated in the widget, and the hero's print was found by object identity: `printsOf` in shared, and `lowPrints` flags `hero`.
- The rejection logic was copied from `record_design`: now one `rejectDesign`, in one transaction. Only Fourthwall's own refusals count toward the designer fallback.
- Silent failures: an unreadable reply now raises "couldn't read Fourthwall's reply". A per-variant price or status error stops the publish. A missing shop address stops before anything is created. A non-PUBLIC collection state is reported. A redraw while a publish holds the claim is refused.
- Progress is saved only when offers were created. `get-offers-by-ids` and the collection steps run in parallel.
- A redraw kept stale identity: see the security fixes below.

Security review (coordinator), all fixed:

- **HIGH, approval controllable by the model.** No tool approves now. Approve opens `/confirm/<ticket>`: a single-use, 5-minute link that only redeems for the merchant it was made for. It signs them in to wovain with AuthKit in the browser, binds the flow to the tab with a cookie, shows every product with price, profit and margin, and takes a same-origin Confirm POST with a single-use secret. The approval stores the content hash, and `publish_design` requires the current content to match. `record_design` no longer accepts `publishing` or `live`. Tool output never carries an approval token; the approval has no nonce, and the link only leads to the sign-in.
- **MEDIUM, publish TOCTOU.** `claimPublish` marks the approval claimed in one Firestore transaction and returns the stored design with every offer id created so far. A second publish is refused while the claim is fresh.
- **MEDIUM, stale identity.** A redraw replaces the design whole. It keeps the hero's offer only for the same customization, the collection only for the same set of products, and each range offer only for its customization.

Skipped:

- One MCP session per publish instead of one per call. It needs a session API in `lib/upstream.ts`, which another change owns.
- Renaming the hero's `productId` to `offerId`. Ads and campaigns read `productId` and `productUrl`.
- Parsing one fixed reply envelope per Fourthwall tool. The envelopes aren't documented; the zod scan stays, and a miss now fails loudly.
- Batching `get-offers-by-ids` past 10 ids. A drop is capped at 8 products.

## Try it

1. Connect Fourthwall and fal to wovain (connect links), then in ChatGPT: "design a drop for Japanese cat sunset".
2. The agent quotes the art cost, generates the art on your fal, uploads it and renders every product in one Fourthwall call. The design widget then shows the tee plus the drop cards, each with price, profit and margin, and the one-of-each total.
3. Press Approve 5 products. A wovain tab opens: sign in, check the prices, press Confirm and publish. Back in the chat, the widget posts "Approve design d1", the agent screens the trademark and calls `publish_design`, and the widget shows Live with View the drop.
4. In Fourthwall: every product is public at the widget's price, and the collection holds the drop.
5. Storybook: `pnpm storybook`, Widgets/Design, the Drop stories.

## Departures from the plan

- `publish_design` lives in `tools/publish.ts` (with `approval_link`), not `tools/design.ts`, so that file stays under the function-length cap.
- The approval path (`lib/approval.ts`, `lib/browser-confirm.ts`, `routes/confirm.ts`) and the wiring changes come from the security review. `lib/oauth-client.ts` lists `/confirm/callback` in wovain's client metadata; AuthKit takes redirect URIs from that document, as it already does for `/oauth/callback/wovain` (not in `wovain:workosRedirectUris`), so no WorkOS or `infra/` change is needed. Not verified against live AuthKit.
