# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/158

## Why

A product's page carries the short listing written with its design: a title and two lines. Someone with no e-commerce experience can't tell what an expert page looks like, and a weak page wastes the ad traffic sent to it. Fourthwall's MCP server can now update a product's name and HTML description (`ecommerce_update-offer`), so wovain can write the page and apply it once the merchant approves.

## What Changes

- **Rewrite product page** in each product's menu on the Store: wovain drafts a new title, a hook and three or four benefit lines, and shows the page now and the new page side by side, as a buyer sees them.
- The writer follows the copywriting skill (clarity, benefits, specifics, no AI tells) and the nexscope product-title and landing-page skills (main keyword first, a title that fits a search result). Code checks what it can count (title length, capitals, AI-tell phrases, exclamation marks) and asks for one rewrite when a rule breaks; anything still broken is shown to the merchant.
- The page adds trust lines the shop can back: printed to order, and Fourthwall's shipping time for the product.
- Approving queues `store.listing.edit` (R1, decided in the merchant's name), which reads the product and writes the name and HTML description; the old page is the undo. The Store's title follows the new name.

## Capabilities

### Modified Capabilities

- `store-management`: product page rewrites.

## Impact

`packages/core` (`listing.ts`, the `product_listing` agent), `packages/api` (listing flow, `store.draftListing` and `store.editListing`, the `store.listing.edit` executor), `apps/web` (the rewrite dialog, messages in en, es and fr).
