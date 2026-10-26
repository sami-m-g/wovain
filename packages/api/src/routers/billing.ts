import { OFFERS } from "@wovain/billing/plans";
import { z } from "zod";

import { billingStatus, openPortal, startCheckout } from "../flow/billing";
import { protectedProcedure } from "../index";

// wovain's own plan and credits (Polar): what the merchant has, a checkout
// for a plan or a credit pack, and the customer portal.
export const billingRouter = {
  checkout: protectedProcedure
    .input(z.object({ offer: z.enum(OFFERS) }))
    .handler(
      async ({ context, input }) => await startCheckout(context, input.offer)
    ),
  portal: protectedProcedure.handler(
    async ({ context }) => await openPortal(context)
  ),
  status: protectedProcedure.handler(
    async ({ context }) => await billingStatus(context)
  ),
};
