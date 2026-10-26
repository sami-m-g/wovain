# Proposal

MR: `feat/app-ui-pass` (link added on open). Status: in review.

## Why

The landing page and docs are moving to the editorial, restrained voice for independent labels (`add-product-landing-and-docs`). The signed-in app (dashboard, new-drop flow, runs, approvals, connections) still needs the same pass, so a designer sees one product from the landing page to a paused campaign. An audit of the app also found hand-rolled shell, cards, lists, menus and fields, placeholder provider icons, a native language select, and screens that showed vendor and model names.

## What Changes

- Apply `apps/web/DESIGN.md` and the voice in `.agents/product-marketing.md` to every signed-in screen: studio words (drop, piece, blank, margin, paused), no internal terms, no model or vendor names, no server error text.
- Replace the hand-rolled UI with shadcn components installed through the CLI: the `sidebar-07` shell (rail, sheet on phones, account menu), breadcrumb, card, item, empty, field, input-group, select, toggle-group, chart, and ReUI's frame and data grid.
- One primary action per screen; the run shows where it is, what it is waiting for and, when it stopped, at which step.
- The new-drop flow keeps its step in the URL (Stepperize) and reads the run from the TanStack Query cache as its single store.
- Connections list only the designer's own accounts: Fourthwall, Meta and fal (fal shows "coming soon" until `add-fal-byo-connector` ships its sign-in).
- An Insights page: shop sales and profit from Fourthwall's reports, ad spend, ROAS, CTR and cost per result from Meta, and design and ad scores per drop. Ad scores read through a scorer interface until `migrate-runs-to-mastra` lands.
- Empty, loading and error states for each screen, readable at phone width, light and dark, with motion that respects reduced motion.
- Account settings and billing screens from `add-better-auth-ui` and `add-polar-billing` follow the same system.

## Capabilities

### New Capabilities

- `app-ui`: how the signed-in app presents a drop, its run, its approvals, its connections and its results.

### Modified Capabilities

None.

## Impact

`apps/web` app routes and components, `packages/ui` through the shadcn CLI only, `packages/core` (Fourthwall and Meta report readers) and `packages/api` (`insights.overview`). No schema change.
