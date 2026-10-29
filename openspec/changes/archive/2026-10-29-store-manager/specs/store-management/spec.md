# Spec Delta

## ADDED Requirements

### Requirement: Store page

The website SHALL give the designer one Store page at `/dashboard/store`, named Store in the rail, the breadcrumb and the title; `/dashboard/products` SHALL redirect there. A summary strip (site status, readiness as one line with its fix, 28-day sales and orders, waiting actions, payouts) SHALL sit over four tabs: Products, Orders, Promotions and Approvals. Drops SHALL NOT be listed on it. Without Fourthwall, the page SHALL show only the connect state.

#### Scenario: Coming-soon shop

- **WHEN** the designer opens the Store while their shop is coming soon
- **THEN** the summary names the failing check on one line and offers Go live

#### Scenario: Old link

- **WHEN** someone opens `/dashboard/products`
- **THEN** they land on `/dashboard/store`

### Requirement: Impact before every store write

Every write the Store page asks for SHALL show its impact before it is sent (what buyers will see, the old and new price, the products a bulk action touches, Fourthwall's cost preview for a refund or cancel, the credit a batch of gift cards creates), and SHALL go through the approval queue. Bulk actions SHALL queue one action per product.

#### Scenario: Bulk hide

- **WHEN** the designer selects three live products and hides them
- **THEN** a dialog lists the three products and what hiding does, and confirming queues three unpublish actions

### Requirement: Gift cards and shop-wide codes

The designer SHALL be able to issue gift cards, as an R4 action that waits for their confirm with the total store credit on the card, and to plan a discount code for products they pick, scheduled and refused at a loss like a drop's launch code. A live code SHALL be endable from the Store.

#### Scenario: Gift cards confirmed

- **WHEN** the designer asks for four $25 gift cards and confirms
- **THEN** Fourthwall creates four cards and the approval records the action as done

### Requirement: Going live

Taking a coming-soon shop live SHALL be an R3 `store.site.set_status` action, sent only after the designer confirms its impact.

#### Scenario: Go live

- **WHEN** the designer confirms Go live
- **THEN** the shop's site status is set to live on Fourthwall

### Requirement: Store preview and Fourthwall links

The Store SHALL preview the shop as buyers see it, from the products' Fourthwall renders, with drafts on request, and SHALL link to the storefront and to Fourthwall's site editor. Wherever wovain doesn't cover something (all products, orders, promotions, settings, payouts), the Store SHALL link into the Fourthwall admin in a new tab.

#### Scenario: Preview a coming-soon shop

- **WHEN** the designer opens the preview while the shop is coming soon
- **THEN** it says buyers see Fourthwall's placeholder page and shows the products as they will appear once live
