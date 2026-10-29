import { INSIGHT_RANGES } from "@wovain/core/insights";
import { listingSchema } from "@wovain/core/listing";
import {
  GIFT_CARD_MAX_COUNT,
  GIFT_CARD_MAX_USD,
  ORDER_CURRENCIES,
  PROMO_CODE,
  MAX_PROMO_USES,
} from "@wovain/core/store";
import { z } from "zod";

import { listingDraft } from "../flow/listing";
import {
  listDrops,
  listStoreOrders,
  requestGiftCards,
  requestPromotionEnd,
  requestShopPromotion,
  requestSiteLive,
  storeGiftCards,
  storePromotions,
  storeSales,
  productVariants,
  requestCancel,
  requestDropPublish,
  requestLaunchPromotion,
  requestListingEdit,
  requestProductMove,
  requestRefund,
  requestReprice,
  requireStoreManagement,
  sampleLink,
  storeProducts,
  storeReadiness,
} from "../flow/store";
import { protectedProcedure } from "../index";

// Running the store (openspec store-management), behind the
// store-management flag. Every write here is a request: it becomes an
// action in the approval queue (approvals.list / approvals.decide), and an
// executor performs it once approved. Refunds and cancels always wait for
// the merchant's confirm, with Fourthwall's cost preview.

const id = z.string().min(1).max(64);
const reason = z.string().trim().min(3).max(500);
// Dollars; the bounds refuse typos, not real prices.
const price = z.number().min(1).max(1000);
const MAX_PERCENT = 90;
const MAX_ORDER_PAGE = 100;
const MAX_REFUND_CENTS = 1_000_000;
const MAX_LIST_PAGE = 100;
const MAX_PICKED = 100;
const page = z.number().int().min(0).max(MAX_LIST_PAGE).default(0);
const promotion = {
  code: z.string().trim().toUpperCase().regex(PROMO_CODE),
  endsAt: z.coerce.date(),
  maxUses: z.number().int().min(1).max(MAX_PROMO_USES).optional(),
  percentage: z.number().int().min(1).max(MAX_PERCENT),
  startsAt: z.coerce.date(),
};

const guarded =
  <I, O>(
    work: (
      context: Parameters<typeof requireStoreManagement>[0],
      input: I
    ) => Promise<O>
  ) =>
  async ({
    context,
    input,
  }: {
    context: Parameters<typeof requireStoreManagement>[0];
    input: I;
  }) => {
    await requireStoreManagement(context);
    return await work(context, input);
  };

export const storeRouter = {
  cancel: protectedProcedure
    .input(
      z.object({ friendlyId: z.string().min(1).max(32), orderId: id, reason })
    )
    .handler(guarded(requestCancel)),
  // A product page rewrite: drafted for the preview (nothing is written),
  // then applied through the queue once the merchant approves it.
  draftListing: protectedProcedure
    .input(z.object({ productId: id }))
    .handler(
      guarded(
        async (context, input) => await listingDraft(context, input.productId)
      )
    ),
  drops: protectedProcedure.handler(
    guarded(async (context) => await listDrops(context))
  ),
  editListing: protectedProcedure
    .input(z.object({ listing: listingSchema, productId: id }))
    .handler(guarded(requestListingEdit)),
  endPromotion: protectedProcedure
    .input(z.object({ code: z.string().min(1).max(64), promotionId: id }))
    .handler(guarded(requestPromotionEnd)),
  giftCards: protectedProcedure
    .input(z.object({ page }))
    .handler(
      guarded(
        async (context, input) => await storeGiftCards(context, input.page)
      )
    ),
  goLive: protectedProcedure.handler(
    guarded(async (context) => await requestSiteLive(context))
  ),
  issueGiftCards: protectedProcedure
    .input(
      z.object({
        amountUsd: z.number().min(1).max(GIFT_CARD_MAX_USD),
        count: z.number().int().min(1).max(GIFT_CARD_MAX_COUNT),
        expiresAt: z.coerce.date().optional(),
      })
    )
    .handler(guarded(requestGiftCards)),
  launchPromotion: protectedProcedure
    .input(z.object({ ...promotion, dropId: id }))
    .handler(guarded(requestLaunchPromotion)),
  moveProduct: protectedProcedure
    .input(
      z.object({
        move: z.enum(["publish", "unpublish", "retire"]),
        productId: id,
      })
    )
    .handler(
      guarded(
        async (context, input) =>
          await requestProductMove(context, input.productId, input.move)
      )
    ),
  orders: protectedProcedure
    .input(
      z.object({
        dropId: id.optional(),
        page: z.number().int().min(0).max(MAX_ORDER_PAGE).default(0),
      })
    )
    .handler(guarded(listStoreOrders)),
  planPromotion: protectedProcedure
    .input(
      z.object({
        ...promotion,
        productIds: z.array(id).min(1).max(MAX_PICKED),
      })
    )
    .handler(guarded(requestShopPromotion)),
  products: protectedProcedure.handler(
    guarded(async (context) => await storeProducts(context))
  ),
  promotions: protectedProcedure
    .input(z.object({ page }))
    .handler(
      guarded(
        async (context, input) => await storePromotions(context, input.page)
      )
    ),
  publishDrop: protectedProcedure
    .input(z.object({ dropId: id }))
    .handler(
      guarded(
        async (context, input) =>
          await requestDropPublish(context, input.dropId)
      )
    ),
  readiness: protectedProcedure.handler(
    guarded(async (context) => await storeReadiness(context))
  ),
  refund: protectedProcedure
    .input(
      z.object({
        amountCents: z.number().int().min(1).max(MAX_REFUND_CENTS),
        currency: z.enum(ORDER_CURRENCIES),
        friendlyId: z.string().min(1).max(32),
        orderId: id,
        reason,
      })
    )
    .handler(guarded(requestRefund)),
  reprice: protectedProcedure
    .input(z.object({ price, productId: id }))
    .handler(
      guarded(
        async (context, input) =>
          await requestReprice(context, input.productId, input.price)
      )
    ),
  sales: protectedProcedure
    .input(z.object({ range: z.enum(INSIGHT_RANGES).default("28d") }))
    .handler(
      guarded(async (context, input) => await storeSales(context, input.range))
    ),
  sample: protectedProcedure
    .input(z.object({ productId: id, variantId: id }))
    .handler(guarded(sampleLink)),
  variants: protectedProcedure
    .input(z.object({ productId: id }))
    .handler(
      guarded(
        async (context, input) =>
          await productVariants(context, input.productId)
      )
    ),
};
