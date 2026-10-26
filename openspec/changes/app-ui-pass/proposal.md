# Proposal

MR: none yet. Status: in progress.

## Why

The landing page and docs are moving to the editorial, restrained voice for independent labels (`add-product-landing-and-docs`). The signed-in app (dashboard, new-drop flow, runs, approvals, connections) still needs the same pass, so a designer sees one product from the landing page to a paused campaign.

## What Changes

- Apply `apps/web/DESIGN.md` and the voice in `.agents/product-marketing.md` to every signed-in screen: studio words (drop, piece, blank, margin, paused), no internal terms.
- One primary action per screen; the run shows where it is, what it is waiting for and why.
- Approval shows the design on its blank with price, profit, margin, the judge's verdict and, once `migrate-runs-to-mastra` lands, the scores.
- Empty, loading and error states for each screen, readable at phone width, light and dark.
- Account settings and billing screens from `add-better-auth-ui` and `add-polar-billing` follow the same system.

## Capabilities

### New Capabilities

- `app-ui`: how the signed-in app presents a drop, its run and its approvals.

### Modified Capabilities

None.

## Impact

`apps/web` app routes and components, `packages/ui` through the shadcn CLI only. No API or schema change.
