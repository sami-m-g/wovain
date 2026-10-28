import { POLICY_DECIDER } from "@wovain/core/approvals";
import type { Approval, EnqueueInput } from "@wovain/core/approvals";
import type { ActionType } from "@wovain/core/autonomy";
import { discountKeepsProfit, sizePrices } from "@wovain/core/pricing";
import {
  activatePromotion,
  cancelOrder,
  canMove,
  createCollection,
  createInactivePromotion,
  evaluateReadiness,
  listOrders,
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
  setSizePrices,
  shopBaseUrl,
  deactivatePromotion,
} from "@wovain/core/store";
import type {
  LifecycleMove,
  OrderCurrency,
  ProductStatus,
} from "@wovain/core/store";
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

export const storeReadiness = async (actor: Actor) =>
  evaluateReadiness(
    await withProvider(
      actor,
      "fourthwall",
      async (call) => await readShopFacts(call)
    )
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
      "Open Products in wovain and fix the checks it lists, then approve again."
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

export const merchantAction = async (actor: Actor, proposal: StoreProposal) => {
  const queued = await proposeStoreAction(actor, {
    ...proposal,
    proposedBy: "merchant",
  });
  const { approval } = queued;
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
    .select({ id: product.id, offerId: product.offerId, title: design.brief })
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
    const firstProduct = await getProduct(actor, fresh[0]?.id ?? "");
    await actor.db.insert(dropItem).values(
      fresh.map((row, index) => ({
        catalogProductId: firstProduct.catalogProductId,
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
    inverse: { dropId, type: "store.product.unpublish" },
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
      "Refresh the products page and pick an action it offers."
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

export const requestDropPublish = async (actor: Actor, dropId: string) => {
  const found = await getDrop(actor, dropId);
  return await merchantAction(actor, {
    dropId,
    idempotencyKey: `store.drop.publish:${dropId}`,
    inverse: { dropId, type: "store.product.unpublish" },
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
// Samples: not an action wovain performs. The merchant pays on Fourthwall's
// checkout; wovain only prepares the link.

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
  const url = await withProvider(
    actor,
    "fourthwall",
    async (call) =>
      await sampleCheckout(call, {
        baseUrl: await shopBaseUrl(call),
        items: [{ quantity: 1, variantId }],
      })
  );
  actor.log?.set({ store: { sample: { productId } } });
  return { url };
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

const createPromotion = async (actor: Actor, approval: Approval) => {
  const { payload } = approval;
  const dropId = text(payload, "dropId");
  const products = await dropProducts(actor, dropId);
  const { maxUses } = payload;
  const promotionId = await withProvider(
    actor,
    "fourthwall",
    async (call) =>
      await once(actor, {
        key: `approval:${approval.id}:promotion`,
        operation: "create_promotion",
        perform: async () =>
          await createInactivePromotion(call, {
            code: text(payload, "code"),
            maxUses:
              typeof maxUses === "number"
                ? Math.min(maxUses, MAX_PROMO_USES)
                : undefined,
            offerIds: products.map((row) => row.offerId),
            percentage: num(payload, "percentage"),
          }),
        provider: "fourthwall",
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

// Store actions the executor below runs; activation has its own schedule.
export const SCHEDULED_ACTIONS: readonly ActionType[] = [
  "store.promotion.activate",
];

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

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
  } catch {
    return { skipped: "taken" };
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
    log.error({
      error: {
        message: `Store action ${current.actionType} failed: ${messageOf(error)}`,
        name: "StoreActionFailed",
        ...(error instanceof Error && error.stack !== undefined
          ? { stack: error.stack }
          : {}),
      },
      store: {
        actionType: current.actionType,
        approvalId,
        decidedBy: current.decidedBy ?? POLICY_DECIDER,
      },
      userId: actor.userId,
    });
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
