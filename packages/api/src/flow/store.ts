import { ApprovalError, POLICY_DECIDER } from "@wovain/core/approvals";
import type { Approval, EnqueueInput } from "@wovain/core/approvals";
import type { ActionType } from "@wovain/core/autonomy";
import { rangeDates, shopInsights } from "@wovain/core/insights";
import type { InsightRange } from "@wovain/core/insights";
import type { Listing } from "@wovain/core/listing";
import { discountKeepsProfit, sizePrices } from "@wovain/core/pricing";
import {
  activatePromotion,
  cancelOrder,
  canMove,
  createCollection,
  createGiftCards,
  createInactivePromotion,
  endFreshPromotion,
  evaluateReadiness,
  findPromotionByCode,
  hideCollection,
  listGiftCards,
  listOrders,
  listPromotions,
  MAX_PROMO_USES,
  nextStatus,
  offerVariants,
  orderCancellation,
  previewCancel,
  previewRefund,
  publishCollection,
  readShopFacts,
  refundOrder,
  sampleCheckout,
  setOfferVisibility,
  setSiteLive,
  setSizePrices,
  shopBaseUrl,
  deactivatePromotion,
} from "@wovain/core/store";
import type {
  LifecycleMove,
  OrderCurrency,
  ProductStatus,
} from "@wovain/core/store";
import type { ConfirmableStep } from "@wovain/core/store-setup";
import { drop, dropItem } from "@wovain/db/schema/autonomy";
import { design, product, run } from "@wovain/db/schema/seller";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { createError, log } from "evlog";

import type { Actor } from "./actor";
import { notFound } from "./actor";
import {
  approvalsFor,
  autonomyOf,
  requireAutonomyApprovals,
  spendToDate,
} from "./approvals";
import { withProvider } from "./connections";
import { flagContextOf } from "./flags";
import { applyListing, listingEdit } from "./listing";
import { once } from "./once";
import { getProduct, publishDesignProduct } from "./products";

// Store management on Fourthwall (openspec store-management), behind the
// store-management flag. Every write is an action in the approval queue
// (@wovain/core/approvals): a run or the merchant proposes it, the autonomy
// policy or the merchant approves it, and the executor below performs it
// once and records the outcome. Refunds and cancels (R4) always wait for
// the merchant, with Fourthwall's cost preview on the card.

// ---------------------------------------------------------------------------
// Flag

export const storeManagementOn = async (actor: Actor) =>
  await actor.core.flags.isOn("store-management", flagContextOf(actor));

export const requireStoreManagement = async (actor: Actor) => {
  await requireAutonomyApprovals(actor);
  if (!(await storeManagementOn(actor))) {
    throw createError({
      fix: "Turn on the store-management flag for this environment.",
      message: "Store management isn't available yet",
      status: 404,
      why: "The store-management flag is off.",
    });
  }
};

const storeError = (message: string, why: string, fix: string) =>
  createError({ fix, message, status: 412, why });

// ---------------------------------------------------------------------------
// Readiness

// The readiness checks, with the shop as the Store page's summary shows it.
export const storeReadiness = async (actor: Actor) => {
  const facts = await withProvider(
    actor,
    "fourthwall",
    async (call) => await readShopFacts(call)
  );
  return {
    ...evaluateReadiness(facts),
    shop: {
      baseUrl: facts.baseUrl ?? null,
      name: facts.name ?? null,
      payoutStatus: facts.payoutStatus ?? null,
      siteStatus: facts.siteStatus ?? null,
    },
  };
};

// Sales, orders and per-product units from Fourthwall's reports.
export const storeSales = async (actor: Actor, range: InsightRange) =>
  await withProvider(
    actor,
    "fourthwall",
    async (call) => await shopInsights(call, rangeDates(range))
  );

export const storePromotions = async (actor: Actor, page: number) =>
  await withProvider(
    actor,
    "fourthwall",
    async (call) => await listPromotions(call, { page })
  );

export const storeGiftCards = async (actor: Actor, page: number) =>
  await withProvider(
    actor,
    "fourthwall",
    async (call) => await listGiftCards(call, { page })
  );

// Publishing waits until the shop can take orders.
const assertReady = async (actor: Actor) => {
  const readiness = await storeReadiness(actor);
  if (!readiness.ready) {
    const failing = readiness.checks
      .filter((check) => check.blocking && !check.ok)
      .map((check) => check.id);
    throw storeError(
      "Your shop isn't ready to sell yet",
      `Readiness checks failing: ${failing.join(", ")}`,
      "Open the Store in wovain and fix the checks it lists, then approve again."
    );
  }
};

// ---------------------------------------------------------------------------
// Proposing actions

export type StoreProposal = Omit<EnqueueInput, "userId">;

// Queues a store action under the merchant's autonomy settings.
export const proposeStoreAction = async (
  actor: Actor,
  proposal: StoreProposal
) => {
  const [settings, spent] = await Promise.all([
    autonomyOf(actor),
    spendToDate(actor),
  ]);
  return await approvalsFor(actor).enqueue(
    { ...proposal, userId: actor.userId },
    settings,
    spent
  );
};

// R1–R2 actions the merchant asks for themselves: the request is their
// decision, so a pending action is approved in their name at once (and
// audited as theirs). R3–R4 wait for a second, explicit confirm on the
// approval card.
const HUMAN_CONFIRM: ReadonlySet<string> = new Set(["R3", "R4"]);

// An earlier request with the same key that ended without running: asking
// again queues a new action instead of returning the old one. A done action
// is returned as is, so a refund is never repeated by a double click.
const RETRYABLE: ReadonlySet<string> = new Set([
  "denied",
  "expired",
  "failed",
  "rejected",
]);

// Queues a proposal; a key whose earlier action ended without running
// (RETRYABLE) queues a fresh one.
const queueAction = async (actor: Actor, proposal: StoreProposal) => {
  const queued = await proposeStoreAction(actor, proposal);
  if (
    queued.created ||
    proposal.idempotencyKey === undefined ||
    !RETRYABLE.has(queued.approval.status)
  ) {
    return queued.approval;
  }
  const again = await proposeStoreAction(actor, {
    ...proposal,
    idempotencyKey: `${proposal.idempotencyKey}:${Date.now()}`,
  });
  return again.approval;
};

export const merchantAction = async (actor: Actor, proposal: StoreProposal) => {
  const approval = await queueAction(actor, {
    ...proposal,
    proposedBy: "merchant",
  });
  if (approval.status !== "pending" || HUMAN_CONFIRM.has(approval.risk)) {
    return approval;
  }
  const [settings, spent] = await Promise.all([
    autonomyOf(actor),
    spendToDate(actor),
  ]);
  return await approvalsFor(actor).decide(
    {
      approvalId: approval.id,
      approve: true,
      decidedBy: actor.userId,
      note: "Requested by the merchant",
      userId: actor.userId,
    },
    settings,
    spent
  );
};

// ---------------------------------------------------------------------------
// Drops: a run's products as one drop with one collection

const runDrop = async (actor: Actor, runId: string) =>
  await actor.db.query.drop.findFirst({
    where: { runId, userId: actor.userId },
  });

// After a run makes its hidden products: they become a drop in review, with
// a hidden Fourthwall collection, and the drop's publish goes to the queue.
// With the autonomy level at publish_ads_paused it is approved at once;
// otherwise the merchant approves it.
export const stageRunDrop = async (
  actor: Actor,
  runId: string,
  { autopilot, productIds }: { autopilot: boolean; productIds: string[] }
) => {
  if (productIds.length === 0) {
    return;
  }
  const rows = await actor.db
    .select({
      catalogProductId: product.catalogProductId,
      id: product.id,
      offerId: product.offerId,
      title: design.brief,
    })
    .from(product)
    .innerJoin(design, eq(design.id, product.designId))
    .where(
      and(eq(product.userId, actor.userId), inArray(product.id, productIds))
    );
  const [source] = await actor.db
    .select({ seed: run.seed })
    .from(run)
    .where(and(eq(run.id, runId), eq(run.userId, actor.userId)));
  const name = (source?.seed ?? rows[0]?.title.title ?? "New drop").slice(
    0,
    120
  );
  let staged = await runDrop(actor, runId);
  if (staged === undefined) {
    await actor.db
      .insert(drop)
      .values({ name, runId, status: "in_review", userId: actor.userId });
    staged = await runDrop(actor, runId);
  }
  if (staged === undefined) {
    throw new Error("The drop wasn't saved");
  }
  const dropId = staged.id;
  const known = await actor.db
    .select({ productId: dropItem.productId })
    .from(dropItem)
    .where(eq(dropItem.dropId, dropId));
  const have = new Set(known.map((row) => row.productId));
  const fresh = rows.filter((row) => !have.has(row.id));
  if (fresh.length > 0) {
    await actor.db.insert(dropItem).values(
      fresh.map((row, index) => ({
        catalogProductId: row.catalogProductId,
        dropId,
        position: known.length + index,
        productId: row.id,
        status: "ready" as const,
        userId: actor.userId,
      }))
    );
  }
  await actor.db
    .update(product)
    .set({ status: "in_review" })
    .where(
      and(
        eq(product.userId, actor.userId),
        inArray(product.id, productIds),
        eq(product.status, "hidden")
      )
    );
  const collectionId = await withProvider(
    actor,
    "fourthwall",
    async (call) =>
      await once(actor, {
        key: `drop:${dropId}:collection`,
        operation: "create_collection",
        perform: async () =>
          await createCollection(call, {
            description: `${name}, made with wovain.`,
            name,
            offerIds: rows.map((row) => row.offerId),
          }),
        provider: "fourthwall",
        runId,
      })
  );
  await actor.db.update(drop).set({ collectionId }).where(eq(drop.id, dropId));
  const { approval } = await proposeStoreAction(actor, {
    dropId,
    idempotencyKey: `store.drop.publish:${dropId}`,
    inverse: { dropId, type: "store.drop.unpublish" },
    payload: { dropId },
    proposedBy: autopilot ? "autopilot" : "store_agent",
    reason:
      "The run's approved designs are on Fourthwall, hidden, in their own collection.",
    runId,
    title: `Publish the drop "${name}"`,
    type: "store.drop.publish",
  });
  return { approvalId: approval.id, dropId, status: approval.status };
};

export const listDrops = async (actor: Actor) => {
  const drops = await actor.db
    .select()
    .from(drop)
    .where(eq(drop.userId, actor.userId))
    .orderBy(desc(drop.createdAt));
  const items = await actor.db
    .select({ dropId: dropItem.dropId, productId: dropItem.productId })
    .from(dropItem)
    .where(eq(dropItem.userId, actor.userId))
    .orderBy(asc(dropItem.position));
  return drops.map((row) => ({
    ...row,
    productIds: items
      .filter((item) => item.dropId === row.id)
      .flatMap((item) => (item.productId === null ? [] : [item.productId])),
  }));
};

// The Store page: each product with its design's title and the drop (and
// run) it came from.
export const storeProducts = async (actor: Actor) => {
  const rows = await actor.db
    .select({
      brief: design.brief,
      dropId: dropItem.dropId,
      dropName: drop.name,
      id: product.id,
      mockups: product.mockups,
      offerId: product.offerId,
      price: product.price,
      productUrl: product.productUrl,
      runId: design.runId,
      status: product.status,
    })
    .from(product)
    .innerJoin(design, eq(design.id, product.designId))
    .leftJoin(dropItem, eq(dropItem.productId, product.id))
    .leftJoin(drop, eq(drop.id, dropItem.dropId))
    .where(eq(product.userId, actor.userId))
    .orderBy(desc(product.createdAt));
  return rows.map(({ brief, ...row }) => ({ ...row, title: brief.title }));
};

const getDrop = async (actor: Actor, dropId: string) => {
  const found = await actor.db.query.drop.findFirst({
    where: { id: dropId, userId: actor.userId },
  });
  if (found === undefined) {
    throw notFound.product({ id: dropId });
  }
  return found;
};

const dropProducts = async (actor: Actor, dropId: string) => {
  const items = await actor.db
    .select({ productId: dropItem.productId })
    .from(dropItem)
    .where(and(eq(dropItem.dropId, dropId), eq(dropItem.userId, actor.userId)));
  const ids = items.flatMap((item) =>
    item.productId === null ? [] : [item.productId]
  );
  if (ids.length === 0) {
    return [];
  }
  return await actor.db
    .select()
    .from(product)
    .where(and(eq(product.userId, actor.userId), inArray(product.id, ids)));
};

// ---------------------------------------------------------------------------
// Merchant requests: each becomes an action in the queue

const MOVE_ACTION: Record<Exclude<LifecycleMove, "review">, ActionType> = {
  publish: "store.product.publish",
  retire: "store.product.archive",
  unpublish: "store.product.unpublish",
};

const MOVE_TITLE: Record<Exclude<LifecycleMove, "review">, string> = {
  publish: "Publish",
  retire: "Retire (archive)",
  unpublish: "Unpublish",
};

// How to undo each move; retiring has no undo.
const MOVE_INVERSE: Partial<
  Record<
    Exclude<LifecycleMove, "review">,
    (productId: string) => Record<string, unknown>
  >
> = {
  publish: (productId) => ({ productId, type: "store.product.unpublish" }),
  unpublish: (productId) => ({ productId, type: "store.product.publish" }),
};

export const requestProductMove = async (
  actor: Actor,
  productId: string,
  move: Exclude<LifecycleMove, "review">
) => {
  const row = await getProduct(actor, productId);
  if (!canMove(row.status, move)) {
    throw storeError(
      `A ${row.status} product can't be moved that way`,
      `The move ${move} doesn't start from ${row.status}.`,
      "Refresh the Store page and pick an action it offers."
    );
  }
  const designRow = await actor.db.query.design.findFirst({
    where: { id: row.designId, userId: actor.userId },
  });
  const title = designRow?.brief.title ?? "product";
  return await merchantAction(actor, {
    inverse: MOVE_INVERSE[move]?.(productId),
    payload: { productId },
    proposedBy: "merchant",
    title: `${MOVE_TITLE[move]} "${title}"`,
    type: MOVE_ACTION[move],
  });
};

// products.publish with store-management on. From the website it is the
// merchant's own request (decided in their name, like requestProductMove).
// Through MCP (the publish_product tool and its widget) the caller may be
// an agent, so the publish is queued under the autonomy policy and waits
// for the merchant unless their level publishes alone. Either way the
// executor checks readiness before anything goes live. A hidden product
// moves to in review while it waits. Returns the product as it is now,
// with its approval.
export const proposeProductPublish = async (
  actor: Actor,
  productId: string,
  { byMerchant }: { byMerchant: boolean }
) => {
  const row = await getProduct(actor, productId);
  if (row.status === "public") {
    return { ...row, approval: null };
  }
  if (!canMove(row.status, "publish")) {
    throw storeError(
      `A ${row.status} product can't be published`,
      `Publish doesn't start from ${row.status}.`,
      "Make a new product from its design."
    );
  }
  const [reviewed] = canMove(row.status, "review")
    ? await actor.db
        .update(product)
        .set({ status: nextStatus("review") })
        .where(and(eq(product.id, productId), eq(product.userId, actor.userId)))
        .returning()
    : [row];
  const current = reviewed ?? row;
  const designRow = await actor.db.query.design.findFirst({
    where: { id: current.designId, userId: actor.userId },
  });
  const proposal: StoreProposal = {
    // One request per state of the product: asking twice returns the same
    // approval; asking again after an unpublish queues a new one.
    idempotencyKey: `store.product.publish:${productId}:${current.updatedAt.getTime()}`,
    inverse: MOVE_INVERSE.publish?.(productId),
    payload: { productId },
    proposedBy: "store_agent",
    reason: byMerchant
      ? "Asked for in the drop flow."
      : "Asked for through an agent tool.",
    title: `Publish "${designRow?.brief.title ?? "product"}"`,
    type: "store.product.publish",
  };
  const approval = byMerchant
    ? await merchantAction(actor, proposal)
    : await queueAction(actor, proposal);
  return {
    ...current,
    approval: { id: approval.id, status: approval.status },
  };
};

export const requestDropPublish = async (actor: Actor, dropId: string) => {
  const found = await getDrop(actor, dropId);
  return await merchantAction(actor, {
    dropId,
    idempotencyKey: `store.drop.publish:${dropId}`,
    inverse: { dropId, type: "store.drop.unpublish" },
    payload: { dropId },
    proposedBy: "merchant",
    title: `Publish the drop "${found.name}"`,
    type: "store.drop.publish",
  });
};

const CENTS = 100;

export const requestReprice = async (
  actor: Actor,
  productId: string,
  price: number
) => {
  const row = await getProduct(actor, productId);
  return await merchantAction(actor, {
    costPreview: {
      amountCents: Math.round(price * CENTS),
      currency: "USD",
      label: `New price $${price.toFixed(2)} (larger sizes add their surcharge)`,
    },
    inverse: { price: row.price, productId, type: "store.product.reprice" },
    payload: { price, productId },
    proposedBy: "merchant",
    title: `Reprice to $${price.toFixed(2)}`,
    type: "store.product.reprice",
  });
};

// The merchant approves wovain's rewrite of a product page (R1): it is
// applied at once in their name, and the page it replaces is the undo.
export const requestListingEdit = async (
  actor: Actor,
  { listing, productId }: { listing: Listing; productId: string }
) => {
  const { next, previous } = await listingEdit(actor, productId, listing);
  return await merchantAction(actor, {
    inverse: { ...previous, type: "store.listing.edit" },
    payload: { ...next },
    proposedBy: "merchant",
    title: `Rewrite the product page as "${next.name}"`,
    type: "store.listing.edit",
  });
};

export interface LaunchPromotionInput {
  dropId: string;
  code: string;
  percentage: number;
  maxUses?: number | undefined;
  startsAt: Date;
  endsAt: Date;
}

// Plans a launch code for a drop. Refused when the discount would make a
// sale of any of the drop's products lose money.
export const requestLaunchPromotion = async (
  actor: Actor,
  input: LaunchPromotionInput
) => {
  const found = await getDrop(actor, input.dropId);
  const products = await dropProducts(actor, input.dropId);
  if (products.length === 0) {
    throw storeError(
      "This drop has no products",
      "A launch code applies to the drop's products.",
      "Add products to the drop first."
    );
  }
  const losing = products.filter(
    (row) => !discountKeepsProfit(row.price, input.percentage)
  );
  if (losing.length > 0) {
    throw storeError(
      `${input.percentage}% off would sell at a loss`,
      `${losing.length} of the drop's products would lose money at that discount.`,
      "Pick a smaller discount."
    );
  }
  if (input.endsAt <= input.startsAt) {
    throw storeError(
      "The promotion ends before it starts",
      "endsAt must be after startsAt.",
      "Pick an end after the start."
    );
  }
  return await merchantAction(actor, {
    dropId: input.dropId,
    idempotencyKey: `store.promotion.create:${input.dropId}:${input.code}`,
    payload: {
      code: input.code,
      dropId: input.dropId,
      endsAt: input.endsAt.toISOString(),
      maxUses: input.maxUses ?? null,
      percentage: input.percentage,
      startsAt: input.startsAt.toISOString(),
    },
    proposedBy: "merchant",
    title: `Launch code ${input.code}: ${input.percentage}% off "${found.name}"`,
    type: "store.promotion.create",
  });
};

const productsByIds = async (actor: Actor, ids: string[]) =>
  ids.length === 0
    ? []
    : await actor.db
        .select()
        .from(product)
        .where(and(eq(product.userId, actor.userId), inArray(product.id, ids)));

export interface ShopPromotionInput {
  productIds: string[];
  code: string;
  percentage: number;
  maxUses?: number | undefined;
  startsAt: Date;
  endsAt: Date;
}

// Plans a discount code for products the merchant picked on the Store
// page, scheduled like a drop's launch code. Refused when the discount
// would make a sale of any of them lose money.
export const requestShopPromotion = async (
  actor: Actor,
  input: ShopPromotionInput
) => {
  const picked = await productsByIds(actor, input.productIds);
  const products = picked.filter((row) => row.status !== "retired");
  if (products.length === 0) {
    throw storeError(
      "Pick at least one product",
      "A discount code applies to the products it lists.",
      "Choose the products the code is for."
    );
  }
  const losing = products.filter(
    (row) => !discountKeepsProfit(row.price, input.percentage)
  );
  if (losing.length > 0) {
    throw storeError(
      `${input.percentage}% off would sell at a loss`,
      `${losing.length} of the products would lose money at that discount.`,
      "Pick a smaller discount."
    );
  }
  if (input.endsAt <= input.startsAt) {
    throw storeError(
      "The promotion ends before it starts",
      "endsAt must be after startsAt.",
      "Pick an end after the start."
    );
  }
  return await merchantAction(actor, {
    idempotencyKey: `store.promotion.create:shop:${input.code}`,
    payload: {
      code: input.code,
      endsAt: input.endsAt.toISOString(),
      maxUses: input.maxUses ?? null,
      percentage: input.percentage,
      productIds: products.map((row) => row.id),
      startsAt: input.startsAt.toISOString(),
    },
    proposedBy: "merchant",
    title: `Discount code ${input.code}: ${input.percentage}% off ${products.length} product${products.length === 1 ? "" : "s"}`,
    type: "store.promotion.create",
  });
};

// Ends a live discount code now (its own approval, decided in the
// merchant's name: it is their request).
export const requestPromotionEnd = async (
  actor: Actor,
  { code, promotionId }: { code: string; promotionId: string }
) =>
  await merchantAction(actor, {
    idempotencyKey: `store.promotion.deactivate:${promotionId}`,
    inverse: { promotionId, type: "store.promotion.activate" },
    payload: { promotionId },
    proposedBy: "merchant",
    title: `End the code ${code}`,
    type: "store.promotion.deactivate",
  });

const usd = (dollars: number) => `$${dollars.toFixed(2)}`;

// Gift cards are store credit (R4): the request waits for the merchant's
// confirm on its approval card, with the credit it creates.
export const requestGiftCards = async (
  actor: Actor,
  {
    amountUsd,
    count,
    expiresAt,
  }: { amountUsd: number; count: number; expiresAt?: Date | undefined }
) => {
  const totalCents = Math.round(amountUsd * CENTS) * count;
  return await merchantAction(actor, {
    costPreview: {
      amountCents: totalCents,
      currency: "USD",
      label: `${count} gift card${count === 1 ? "" : "s"} of ${usd(amountUsd)}: up to ${usd(totalCents / CENTS)} of store credit${expiresAt === undefined ? ", no expiry" : `, until ${expiresAt.toISOString().slice(0, 10)}`}`,
    },
    payload: {
      amountUsd,
      count,
      expiresAt: expiresAt?.toISOString() ?? null,
    },
    proposedBy: "merchant",
    title: `Issue ${count} gift card${count === 1 ? "" : "s"} of ${usd(amountUsd)}`,
    type: "store.gift_card.create",
  });
};

// Takes a coming-soon shop live (R3): buyers see the storefront once the
// merchant confirms it on the approval card.
export const requestSiteLive = async (actor: Actor) =>
  await merchantAction(actor, {
    idempotencyKey: `store.site.set_status:LIVE:${new Date().toISOString().slice(0, 10)}`,
    payload: { status: "LIVE" },
    proposedBy: "merchant",
    reason: "Asked for on the Store page.",
    title: "Take your shop live",
    type: "store.site.set_status",
  });

// The merchant marks payouts set up by Fourthwall support (PayPal or
// bill.com), which get-payout-info can't see. R1, decided in their name.
export const requestSetupConfirm = async (
  actor: Actor,
  step: ConfirmableStep
) =>
  await merchantAction(actor, {
    idempotencyKey: `store.setup.confirm:${step}`,
    payload: { step },
    proposedBy: "merchant",
    reason: "Marked done on the Store page: set up by Fourthwall support.",
    title: "Payouts set up by Fourthwall support",
    type: "store.setup.confirm",
  });

export const listStoreOrders = async (
  actor: Actor,
  { dropId, page }: { dropId?: string | undefined; page: number }
) => {
  const inDrop =
    dropId === undefined ? undefined : await dropProducts(actor, dropId);
  const offerIds = inDrop?.map((row) => row.offerId);
  return await withProvider(
    actor,
    "fourthwall",
    async (call) => await listOrders(call, { offerIds, page })
  );
};

const money = (cents: number, currency: string) =>
  `${(cents / CENTS).toFixed(2)} ${currency}`;

// A refund request: Fourthwall's preview goes on the approval card, and the
// refund waits for the merchant's confirm.
export const requestRefund = async (
  actor: Actor,
  input: {
    orderId: string;
    friendlyId: string;
    amountCents: number;
    currency: OrderCurrency;
    reason: string;
  }
) => {
  const preview = await withProvider(
    actor,
    "fourthwall",
    async (call) => await previewRefund(call, input)
  );
  return await merchantAction(actor, {
    costPreview: {
      amountCents: input.amountCents,
      chargeToCardCents: preview.chargeToCardCents,
      currency: input.currency,
      label: `Refund ${money(input.amountCents, input.currency)} on order ${input.friendlyId}: ${money(preview.fromBalanceCents, input.currency)} from your balance, ${money(preview.chargeToCardCents, input.currency)} charged to your card`,
    },
    idempotencyKey: `store.order.refund:${input.orderId}:${input.amountCents}`,
    payload: {
      amountCents: input.amountCents,
      currency: input.currency,
      orderId: input.orderId,
      reason: input.reason,
    },
    proposedBy: "merchant",
    reason: input.reason,
    title: `Refund order ${input.friendlyId}`,
    type: "store.order.refund",
  });
};

export const requestCancel = async (
  actor: Actor,
  input: { orderId: string; friendlyId: string; reason: string }
) => {
  const { eligibility, preview } = await withProvider(
    actor,
    "fourthwall",
    async (call) => {
      const checked = await orderCancellation(call, input.orderId);
      return {
        eligibility: checked,
        preview: checked.cancellable
          ? await previewCancel(call, input.orderId)
          : undefined,
      };
    }
  );
  if (!eligibility.cancellable || preview === undefined) {
    throw storeError(
      "This order can't be cancelled anymore",
      `Fourthwall says: ${eligibility.reason ?? "not cancellable"}.`,
      "Refund it instead, or contact Fourthwall support."
    );
  }
  const currency = eligibility.currency ?? "USD";
  const refund = preview.refundCents ?? eligibility.remainingCents ?? 0;
  return await merchantAction(actor, {
    costPreview: {
      amountCents: refund,
      chargeToCardCents: preview.chargeToCardCents,
      currency,
      label: `Cancel order ${input.friendlyId} and refund ${money(refund, currency)}: ${money(preview.fromBalanceCents, currency)} from your balance, ${money(preview.chargeToCardCents, currency)} charged to your card`,
    },
    idempotencyKey: `store.order.cancel:${input.orderId}`,
    payload: { orderId: input.orderId, reason: input.reason },
    proposedBy: "merchant",
    reason: input.reason,
    title: `Cancel order ${input.friendlyId}`,
    type: "store.order.cancel",
  });
};

// ---------------------------------------------------------------------------
// Samples (R4: the designer pays). wovain only prepares Fourthwall's
// checkout link, and paying there is the designer's confirm. The request is
// still an action in the queue, decided in the designer's name and
// performed here at once, so it is audited like every other store write.

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const logStoreFailure = (
  actor: Actor,
  approval: Approval,
  error: unknown,
  what: string
) => {
  log.error({
    error: {
      message: `Store action ${approval.actionType} ${what}: ${messageOf(error)}`,
      name: "StoreActionFailed",
      ...(error instanceof Error && error.stack !== undefined
        ? { stack: error.stack }
        : {}),
    },
    store: {
      actionType: approval.actionType,
      approvalId: approval.id,
      decidedBy: approval.decidedBy ?? POLICY_DECIDER,
    },
    userId: actor.userId,
  });
};

export const productVariants = async (actor: Actor, productId: string) => {
  const row = await getProduct(actor, productId);
  return await withProvider(
    actor,
    "fourthwall",
    async (call) => await offerVariants(call, row.offerId)
  );
};

export const sampleLink = async (
  actor: Actor,
  { productId, variantId }: { productId: string; variantId: string }
) => {
  const variants = await productVariants(actor, productId);
  if (!variants.some((variant) => variant.id === variantId)) {
    throw notFound.product({ id: variantId });
  }
  const row = await getProduct(actor, productId);
  const designRow = await actor.db.query.design.findFirst({
    where: { id: row.designId, userId: actor.userId },
  });
  const approvals = approvalsFor(actor);
  const { approval: queued } = await proposeStoreAction(actor, {
    payload: { productId, variantId },
    proposedBy: "merchant",
    reason: "The designer pays for the sample on Fourthwall's checkout.",
    title: `Order a sample of "${designRow?.brief.title ?? "product"}"`,
    type: "store.sample.checkout",
  });
  const [settings, spent] = await Promise.all([
    autonomyOf(actor),
    spendToDate(actor),
  ]);
  const approval =
    queued.status === "pending"
      ? await approvals.decide(
          {
            approvalId: queued.id,
            approve: true,
            decidedBy: actor.userId,
            note: "Requested by the designer, who confirms by paying on Fourthwall's checkout",
            userId: actor.userId,
          },
          settings,
          spent
        )
      : queued;
  if (approval.status !== "approved") {
    throw storeError(
      "The sample couldn't be ordered",
      `The sample request is ${approval.status}.`,
      "Open your approvals to see why, then try again."
    );
  }
  await approvals.record({
    actor: "store_agent",
    approvalId: approval.id,
    status: "executing",
    userId: actor.userId,
  });
  try {
    const url = await withProvider(
      actor,
      "fourthwall",
      async (call) =>
        await sampleCheckout(call, {
          baseUrl: await shopBaseUrl(call),
          items: [{ quantity: 1, variantId }],
        })
    );
    await approvals.record({
      actor: "store_agent",
      approvalId: approval.id,
      result: { url },
      status: "done",
      userId: actor.userId,
    });
    return { approvalId: approval.id, url };
  } catch (error) {
    logStoreFailure(actor, approval, error, "failed");
    await approvals.record({
      actor: "store_agent",
      approvalId: approval.id,
      error: messageOf(error).slice(0, 500),
      status: "failed",
      userId: actor.userId,
    });
    throw error;
  }
};

// ---------------------------------------------------------------------------
// Executor: performs an approved store action once

const text = (payload: Record<string, unknown>, key: string) => {
  const value = payload[key];
  if (typeof value !== "string" || value === "") {
    throw new Error(`The approval's payload has no ${key}`);
  }
  return value;
};

const num = (payload: Record<string, unknown>, key: string) => {
  const value = payload[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`The approval's payload has no ${key}`);
  }
  return value;
};

const setProductStatus = async (
  actor: Actor,
  productId: string,
  status: ProductStatus
) => {
  await actor.db
    .update(product)
    .set({ status })
    .where(and(eq(product.id, productId), eq(product.userId, actor.userId)));
};

const publishDrop = async (actor: Actor, dropId: string) => {
  await assertReady(actor);
  const found = await getDrop(actor, dropId);
  const products = await dropProducts(actor, dropId);
  const published = [];
  // One product at a time: Fourthwall rate-limits writes per shop.
  for (const row of products) {
    if (row.status !== "retired") {
      // oxlint-disable-next-line no-await-in-loop -- sequential on purpose
      published.push(await publishDesignProduct(actor, row.id));
    }
  }
  const { collectionId } = found;
  const collectionUrl =
    collectionId === null
      ? undefined
      : await withProvider(
          actor,
          "fourthwall",
          async (call) =>
            await publishCollection(call, collectionId, await shopBaseUrl(call))
        );
  await actor.db
    .update(drop)
    .set({ status: "live" })
    .where(eq(drop.id, dropId));
  await actor.db
    .update(dropItem)
    .set({ status: "published" })
    .where(eq(dropItem.dropId, dropId));
  return {
    collectionUrl: collectionUrl ?? null,
    productUrls: published.map((row) => row.productUrl),
  };
};

// The undo of a drop's publish: its collection and its live products are
// hidden again, and the drop is paused.
const unpublishDrop = async (actor: Actor, dropId: string) => {
  const found = await getDrop(actor, dropId);
  const products = await dropProducts(actor, dropId);
  const live = products.filter((row) => canMove(row.status, "unpublish"));
  const { collectionId } = found;
  await withProvider(actor, "fourthwall", async (call) => {
    if (collectionId !== null) {
      await hideCollection(call, collectionId);
    }
    // One product at a time: Fourthwall rate-limits writes per shop.
    for (const row of live) {
      // oxlint-disable-next-line no-await-in-loop -- sequential on purpose
      await setOfferVisibility(call, row.offerId, "HIDDEN");
    }
  });
  if (live.length > 0) {
    await actor.db
      .update(product)
      .set({ status: nextStatus("unpublish") })
      .where(
        and(
          eq(product.userId, actor.userId),
          inArray(
            product.id,
            live.map((row) => row.id)
          )
        )
      );
  }
  await actor.db
    .update(drop)
    .set({ status: "paused" })
    .where(and(eq(drop.id, dropId), eq(drop.userId, actor.userId)));
  return { hidden: live.map((row) => row.id) };
};

const createPromotion = async (actor: Actor, approval: Approval) => {
  const { payload } = approval;
  // A drop's launch code, or a code for products picked on the Store page.
  const dropId =
    typeof payload.dropId === "string" && payload.dropId !== ""
      ? payload.dropId
      : undefined;
  const picked = Array.isArray(payload.productIds)
    ? payload.productIds.filter((id): id is string => typeof id === "string")
    : [];
  const products =
    dropId === undefined
      ? await productsByIds(actor, picked)
      : await dropProducts(actor, dropId);
  if (products.length === 0) {
    throw new Error("The promotion's payload names no products");
  }
  const scope = dropId === undefined ? "shop" : `drop:${dropId}`;
  const { maxUses } = payload;
  const code = text(payload, "code");
  const promotionId = await withProvider(
    actor,
    "fourthwall",
    async (call) =>
      await once(actor, {
        // Keyed by the drop and the code, not the approval: a merchant's
        // retry is a new approval, and must repair the code an earlier
        // attempt made instead of creating it again.
        key: `${scope}:promotion:${code}`,
        operation: "create_promotion",
        perform: async () =>
          await createInactivePromotion(call, {
            code,
            maxUses:
              typeof maxUses === "number"
                ? Math.min(maxUses, MAX_PROMO_USES)
                : undefined,
            offerIds: products.map((row) => row.offerId),
            percentage: num(payload, "percentage"),
          }),
        provider: "fourthwall",
        // An earlier attempt died after creating the code, which may still
        // be live: find it by its code and finish switching it off.
        recover: async () => {
          const found = await findPromotionByCode(call, code);
          if (found !== undefined) {
            await endFreshPromotion(call, found, code);
          }
          return found;
        },
      })
  );
  // Switching it on is visible to customers (R2): its own action, which the
  // schedule (../workflows/store) runs from startsAt to endsAt.
  const { approval: activation } = await proposeStoreAction(actor, {
    dropId,
    idempotencyKey: `store.promotion.activate:${promotionId}`,
    inverse: { promotionId, type: "store.promotion.deactivate" },
    payload: {
      code: payload.code,
      endsAt: payload.endsAt,
      promotionId,
      startsAt: payload.startsAt,
    },
    proposedBy: "store_agent",
    reason: "The launch code exists and is switched off until its start.",
    title: `Switch on ${String(payload.code)} from ${String(payload.startsAt)} to ${String(payload.endsAt)}`,
    type: "store.promotion.activate",
  });
  return { activationApprovalId: activation.id, promotionId };
};

// The work of one approved action. Promotion activation is not here: it
// spans the launch window, so the schedule in ../workflows/store runs it.
const perform = async (actor: Actor, approval: Approval): Promise<unknown> => {
  const { payload } = approval;
  switch (approval.actionType) {
    case "store.drop.publish": {
      return await publishDrop(actor, text(payload, "dropId"));
    }
    case "store.drop.unpublish": {
      return await unpublishDrop(actor, text(payload, "dropId"));
    }
    case "store.product.publish": {
      await assertReady(actor);
      const row = await publishDesignProduct(actor, text(payload, "productId"));
      return { productUrl: row.productUrl };
    }
    case "store.product.unpublish":
    case "store.product.archive": {
      const productId = text(payload, "productId");
      const row = await getProduct(actor, productId);
      const move =
        approval.actionType === "store.product.archive"
          ? "retire"
          : "unpublish";
      if (!canMove(row.status, move)) {
        throw new Error(`A ${row.status} product can't ${move}`);
      }
      // wovain's Meta campaigns are always paused today (campaign.status),
      // so there are no live ads to pause before hiding the product.
      await withProvider(
        actor,
        "fourthwall",
        async (call) =>
          await setOfferVisibility(
            call,
            row.offerId,
            move === "retire" ? "ARCHIVED" : "HIDDEN"
          )
      );
      await setProductStatus(actor, productId, nextStatus(move));
      return { status: nextStatus(move) };
    }
    case "store.product.reprice": {
      const productId = text(payload, "productId");
      const price = num(payload, "price");
      const row = await getProduct(actor, productId);
      const bySize = sizePrices(price);
      await withProvider(
        actor,
        "fourthwall",
        async (call) => await setSizePrices(call, row.offerId, price, bySize)
      );
      await actor.db
        .update(product)
        .set({ price })
        .where(
          and(eq(product.id, productId), eq(product.userId, actor.userId))
        );
      return { price, sizes: bySize };
    }
    case "store.listing.edit": {
      const { description } = payload;
      return await applyListing(actor, {
        // An undo may write back an empty description.
        description: typeof description === "string" ? description : "",
        name: text(payload, "name"),
        productId: text(payload, "productId"),
      });
    }
    case "store.promotion.create": {
      return await createPromotion(actor, approval);
    }
    case "store.promotion.deactivate": {
      const promotionId = text(payload, "promotionId");
      await withProvider(
        actor,
        "fourthwall",
        async (call) => await deactivatePromotion(call, promotionId)
      );
      return { promotionId };
    }
    case "store.order.refund": {
      return await withProvider(
        actor,
        "fourthwall",
        async (call) =>
          await refundOrder(call, {
            amountCents: num(payload, "amountCents"),
            currency: text(payload, "currency") as OrderCurrency,
            orderId: text(payload, "orderId"),
            reason: text(payload, "reason"),
          })
      );
    }
    case "store.gift_card.create": {
      const { expiresAt } = payload;
      return await withProvider(
        actor,
        "fourthwall",
        async (call) =>
          await createGiftCards(call, {
            amountUsd: num(payload, "amountUsd"),
            count: num(payload, "count"),
            expiresAt: typeof expiresAt === "string" ? expiresAt : undefined,
          })
      );
    }
    case "store.setup.confirm": {
      // The merchant's word is the record; the Store setup reads it back.
      return { step: text(payload, "step") };
    }
    case "store.site.set_status": {
      const status = await withProvider(
        actor,
        "fourthwall",
        async (call) => await setSiteLive(call)
      );
      return { status };
    }
    case "store.order.cancel": {
      return await withProvider(
        actor,
        "fourthwall",
        async (call) =>
          await cancelOrder(call, {
            orderId: text(payload, "orderId"),
            reason: text(payload, "reason"),
          })
      );
    }
    default: {
      throw new Error(`No store executor for ${approval.actionType}`);
    }
  }
};

// Taking the `executing` lock failed. Only a lost race counts as taken: the
// transition was refused and the approval has since moved on. Anything else
// (a database outage, a missing approval) is a real error.
const LOCK_HELD: ReadonlySet<string> = new Set(["executing", "done", "failed"]);

const lostTheLock = async (
  actor: Actor,
  approvalId: string,
  error: unknown
) => {
  const refused =
    error instanceof ApprovalError &&
    (error.code === "BAD_TRANSITION" || error.code === "NOT_PENDING");
  if (!refused) {
    return false;
  }
  const latest = await approvalsFor(actor).get(actor.userId, approvalId);
  return LOCK_HELD.has(latest.status);
};

// Runs an approved store action once: `executing` is the lock (a second
// delivery of the same decision finds it taken and does nothing). A failure
// is recorded on the approval and logged at error level; it is never
// retried, since refunds and cancels must not run twice.
export const executeStoreApproval = async (
  actor: Actor,
  approvalId: string
) => {
  const approvals = approvalsFor(actor);
  const current = await approvals.get(actor.userId, approvalId);
  if (current.domain !== "store" || current.status !== "approved") {
    return { skipped: current.status };
  }
  try {
    await approvals.record({
      actor: "store_agent",
      approvalId,
      status: "executing",
      userId: actor.userId,
    });
  } catch (error) {
    if (await lostTheLock(actor, approvalId, error)) {
      return { skipped: "taken" };
    }
    logStoreFailure(actor, current, error, "couldn't start");
    throw error;
  }
  try {
    const result = await perform(actor, current);
    await approvals.record({
      actor: "store_agent",
      approvalId,
      result,
      status: "done",
      userId: actor.userId,
    });
    return { done: approvalId };
  } catch (error) {
    logStoreFailure(actor, current, error, "failed");
    await approvals.record({
      actor: "store_agent",
      approvalId,
      error: messageOf(error).slice(0, 500),
      status: "failed",
      userId: actor.userId,
    });
    return { failed: approvalId };
  }
};

// The promotion schedule's steps (../workflows/store).
export const promotionWindow = (approval: Approval) => ({
  endsAt: text(approval.payload, "endsAt"),
  promotionId: text(approval.payload, "promotionId"),
  startsAt: text(approval.payload, "startsAt"),
});

export const switchPromotion = async (
  actor: Actor,
  promotionId: string,
  on: boolean
) => {
  await withProvider(actor, "fourthwall", async (call) =>
    on
      ? await activatePromotion(call, promotionId)
      : await deactivatePromotion(call, promotionId)
  );
};
