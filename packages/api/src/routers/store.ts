import {
  ORDER_CURRENCIES,
  PROMO_CODE,
  MAX_PROMO_USES,
} from "@wovain/core/store";
import { z } from "zod";

import {
  listDrops,
  listStoreOrders,
  productVariants,
  requestCancel,
  requestDropPublish,
  requestLaunchPromotion,
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
  drops: protectedProcedure.handler(
    guarded(async (context) => await listDrops(context))
  ),
  launchPromotion: protectedProcedure
    .input(
      z.object({
        code: z.string().trim().toUpperCase().regex(PROMO_CODE),
        dropId: id,
        endsAt: z.coerce.date(),
        maxUses: z.number().int().min(1).max(MAX_PROMO_USES).optional(),
        percentage: z.number().int().min(1).max(MAX_PERCENT),
        startsAt: z.coerce.date(),
      })
    )
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
  products: protectedProcedure.handler(
    guarded(async (context) => await storeProducts(context))
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
