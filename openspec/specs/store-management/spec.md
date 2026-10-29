# store-management Specification

## Purpose

Running the designer's Fourthwall store after products exist: readiness, the product lifecycle, drop collections, launch promotions, order exceptions, samples and per-size prices, with every write through the approval queue.

## Requirements

### Requirement: Store writes go through the approval queue

Every write wovain makes to the designer's store SHALL be an action in the approval queue, settled by the autonomy policy or by the designer, and SHALL be performed at most once after it is approved. A failed action SHALL be recorded on its approval and SHALL reach Error Tracking. The whole capability SHALL be off unless the `store-management` flag is on.

#### Scenario: Delivered twice

- **WHEN** the same approval decision is delivered twice
- **THEN** the store action runs once and the second delivery does nothing

#### Scenario: Agent publishes a product

- **WHEN** `products.publish` is called through MCP (the `publish_product` tool) with `store-management` on and the designer's level is `suggest`
- **THEN** a product publish waits in the designer's approvals, the product is in review, and its Fourthwall offer stays hidden

#### Scenario: Designer publishes from the drop flow

- **WHEN** the designer clicks publish on a product in the website's drop flow with `store-management` on
- **THEN** the publish is queued and approved in their name, and the product goes live only when the executor runs it after the readiness check

### Requirement: Executor lock and undo

Only a lost race for the executor's lock SHALL be skipped without an error; any other failure to start an action SHALL reach Error Tracking. Each publish action SHALL store an inverse that its executor can run.

#### Scenario: Lock not taken for another reason

- **WHEN** taking an approved action's `executing` lock fails and the approval has not moved on
- **THEN** the error is logged at error level and thrown, and nothing is performed

#### Scenario: Undo a drop's publish

- **WHEN** a drop's publish is undone with its stored inverse
- **THEN** the drop's live products and its collection are hidden and the drop is paused

#### Scenario: Flag off

- **WHEN** the `store-management` flag is off
- **THEN** the store procedures answer not found and the Store page is not shown

### Requirement: Store readiness

The system SHALL report whether the shop is ready to sell: the site is live, the shop is not held for verification, the connected user is an owner or manager, shipping is on with at least one profile, and payouts are set up. Payouts SHALL only warn. Publishing SHALL fail with the failing checks named while any blocking check fails.

#### Scenario: Shop coming soon

- **WHEN** an approved drop publish runs while the shop's site is "coming soon"
- **THEN** nothing is published and the approval is recorded as failed with the reason

### Requirement: Product lifecycle

A product SHALL be draft, in review, live, paused or retired. Publish SHALL start from draft, in review or paused. Unpublish SHALL start from live and leave it paused. Retire SHALL archive it on Fourthwall, and a retired product SHALL NOT be published again.

#### Scenario: Move not allowed

- **WHEN** the designer asks to unpublish a product that isn't live
- **THEN** the request is refused and nothing is queued

### Requirement: One collection per drop

Each drop SHALL have one Fourthwall collection, created hidden with the drop's products, and published together with them.

#### Scenario: Drop published

- **WHEN** a drop's publish runs
- **THEN** its products and its collection are public and the drop is live

### Requirement: Scheduled launch promotions

A launch code for a drop SHALL be created switched off. Switching it on SHALL be its own action. Once approved, the code SHALL be switched on at its start and off at its end. A discount that would make a sale of any of the drop's products lose money SHALL be refused.

#### Scenario: Code planned

- **WHEN** the designer plans 15% off a drop from Friday to Sunday
- **THEN** the code exists but is off, and an activation action for Friday to Sunday is queued

#### Scenario: Code could not be switched off

- **WHEN** Fourthwall creates the code but switching it off fails every time it is tried
- **THEN** the action fails with an error, tracked in Error Tracking, that says the code is live, and the designer's retry finds that code and switches it off instead of creating it again

### Requirement: Refunds and cancels wait for the designer

Refunds and order cancels SHALL always wait for the designer's explicit confirm, at every autonomy level. The approval SHALL show Fourthwall's cost preview, including any charge to the shop's card. A cancel that Fourthwall says is no longer possible SHALL be refused before it is queued. A refund or cancel SHALL NOT be retried automatically.

#### Scenario: Refund at the highest autonomy level

- **WHEN** a designer at `publish_ads_paused` asks to refund $32.50 and $5.00 would be charged to the shop's card
- **THEN** the refund waits for their confirm and the card shows the $5.00 charge

### Requirement: Orders without customer contact details

The orders list SHALL show each order's number, status, total and items, and SHALL NOT include the customer's email, address or message.

#### Scenario: Orders page

- **WHEN** the designer opens their orders
- **THEN** they see the latest orders without customer contact details

### Requirement: Samples

The designer SHALL be able to get a Fourthwall checkout link to order one of a product's variants as a sample at cost. They pay on Fourthwall, and wovain moves no money. Each sample request SHALL be an R4 action in the approval queue, decided in the designer's name (paying on Fourthwall's checkout is their confirm), with the link as its result.

#### Scenario: Order a sample

- **WHEN** the designer picks a variant of a draft product
- **THEN** a Fourthwall sample checkout opens, and the request is recorded as done in the approval queue with the link

### Requirement: Per-size prices

When the pricing rules give size surcharges, a product's larger sizes SHALL cost the base price plus their surcharge. Sizes the product doesn't have SHALL NOT be sent.

#### Scenario: 2XL surcharge

- **WHEN** the rules add $2 to 2XL and a $30 tee is priced
- **THEN** its 2XL variants cost $32 and its other sizes $30

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

### Requirement: Price check

Changing a product's price SHALL show, for each size, Fourthwall's cost to make it, the price, the profit after fees and the gross margin, with a verdict (loss, below wovain's floor, under the 60% DTC margin, or healthy) and one-click floor and 60% prices. The server SHALL refuse a price that loses money in any size.

#### Scenario: A size sells at a loss

- **WHEN** the designer asks for a price below what Fourthwall charges to make the 2XL
- **THEN** the dialog shows the loss on the 2XL, and the request is refused with the lowest price that works

#### Scenario: Thin margin

- **WHEN** the price clears wovain's floor but leaves under 60% gross margin in some size
- **THEN** the dialog says so and offers the price that reaches 60%

### Requirement: Product pages that sell

The Store SHALL offer to rewrite a product's page: a title of at most 60 characters with the main keyword first, a hook and three or four benefit lines, using only facts the product already holds, shown next to the current page as a buyer sees it. Approving SHALL queue a `store.listing.edit` action that writes the page to Fourthwall; its undo SHALL write the old page back.

#### Scenario: Rewrite approved

- **WHEN** the designer opens Rewrite product page and chooses Use this page
- **THEN** Fourthwall's product gets the new name and description, and the Store lists the product under its new title

#### Scenario: A rule still broken

- **WHEN** the rewritten title is still over 60 characters after one retry
- **THEN** the dialog says search results cut it, and the designer decides

### Requirement: Store setup checklist

The Store page SHALL show a setup checklist for the connected shop: shop connected as owner or manager, payouts, shop live, shipping and the Meta pixel on the shop (required), plus custom domain and policies (optional). Each open step SHALL be done by wovain through the approval queue or offer a one-click deep link into Fourthwall. While a required step is open, the page SHALL poll so a step finished in Fourthwall ticks off without a reload.

#### Scenario: Payouts finished in Fourthwall

- **WHEN** the designer follows the payouts link and finishes payouts in Fourthwall
- **THEN** the payouts step ticks off on the Store page within seconds, without a reload

#### Scenario: Go live for me

- **WHEN** the designer asks wovain to take a coming-soon shop live and confirms
- **THEN** a `store.site.set_status` action is queued and recorded in the decision trace

### Requirement: Pixel on the shop

The pixel step SHALL show the pixel wovain found on the designer's Meta ad account, to paste in Fourthwall, and SHALL be done when Meta reports events from one of the shop's hosts in the last 7 days. Without a Meta connection, the step SHALL wait on Meta and link to connect it.

#### Scenario: Test visit

- **WHEN** the designer pastes the pixel ID in Fourthwall and opens their storefront
- **THEN** the pixel step ticks off once Meta reports the visit from the shop's host

### Requirement: Setup reads fail soft

A part of the checklist that can't be read SHALL be logged at error level and shown as not known, and SHALL NOT fail the rest of the checklist.

#### Scenario: Meta answers an error

- **WHEN** Meta's dataset stats fail
- **THEN** the error reaches Error Tracking and the other steps still show

### Requirement: Guided pixel and payouts steps

The pixel and payouts steps SHALL give plain steps and open the exact Fourthwall page (Tracking pixels; Billing and payouts). The pixel step SHALL show the pixel ID with a copy button. When payouts can't be read as active, the designer SHALL be able to mark them set up by Fourthwall support, as a `store.setup.confirm` action, and the step SHALL then show as done on their word.

#### Scenario: Payouts set up by support

- **WHEN** Fourthwall reports payouts as inactive and the designer chooses Fourthwall support set up my payouts
- **THEN** the payouts step shows as done and says it was marked by the designer

#### Scenario: Pixel steps

- **WHEN** the pixel isn't firing on the shop yet
- **THEN** the step shows the pixel ID to copy, the steps, and a link to Fourthwall's Tracking pixels page
