import { z } from "zod";

import { createProductCampaign, listCampaigns } from "../flow/campaigns";
import {
  decideDesign,
  generateDesign,
  getDesign,
  listDesigns,
} from "../flow/designs";
import { listIdeas, researchIdeas } from "../flow/ideas";
import {
  browseCatalog,
  createDesignProduct,
  listProducts,
  publishDesignProduct,
} from "../flow/products";
import { getRun, listRuns, startRun } from "../flow/runs";
import { funnelProcedure, protectedProcedure } from "../index";

// The seller flow, one procedure per step: research → design → approve →
// product → publish → paused campaign, or all of it in one autopilot run.

const id = z.string().min(1).max(64);
const seed = z.string().trim().min(1).max(200);
const reason = z.string().trim().max(500);
const countries = z
  .array(z.string().regex(/^[A-Z]{2}$/u))
  .min(1)
  .max(25);
// Dollars a day; the upper bound stops a typo from staging a runaway budget.
const dailyBudget = z.number().min(1).max(500);

// Shared with the MCP tools, which leave the defaults to these procedures.
export const fields = { countries, dailyBudget, id, reason, seed };

const byId = z.object({ id });
const byRun = z.object({ runId: id.optional() });

export const ideasRouter = {
  list: protectedProcedure
    .input(byRun)
    .handler(
      async ({ context, input }) => await listIdeas(context, input.runId)
    ),
  research: protectedProcedure
    .input(z.object({ seed }))
    .handler(
      async ({ context, input }) => await researchIdeas(context, input.seed)
    ),
};

export const designsRouter = {
  approve: funnelProcedure("design_approved")
    .input(byId)
    .handler(
      async ({ context, input }) =>
        await decideDesign(context, input.id, { approve: true, by: "merchant" })
    ),
  generate: protectedProcedure
    .input(z.object({ ideaId: id }))
    .handler(
      async ({ context, input }) => await generateDesign(context, input.ideaId)
    ),
  get: protectedProcedure
    .input(byId)
    .handler(async ({ context, input }) => await getDesign(context, input.id)),
  list: protectedProcedure
    .input(byRun)
    .handler(
      async ({ context, input }) => await listDesigns(context, input.runId)
    ),
  reject: protectedProcedure
    .input(z.object({ id, reason: reason.optional() }))
    .handler(
      async ({ context, input }) =>
        await decideDesign(context, input.id, {
          approve: false,
          by: "merchant",
          reason: input.reason,
        })
    ),
};

export const productsRouter = {
  catalog: protectedProcedure
    .input(z.object({ query: z.string().trim().min(1).max(100).optional() }))
    .handler(
      async ({ context, input }) => await browseCatalog(context, input.query)
    ),
  create: protectedProcedure
    .input(z.object({ catalogProductId: id.optional(), designId: id }))
    .handler(
      async ({ context, input }) => await createDesignProduct(context, input)
    ),
  list: protectedProcedure.handler(
    async ({ context }) => await listProducts(context)
  ),
  publish: funnelProcedure("product_published")
    .input(byId)
    .handler(
      async ({ context, input }) =>
        await publishDesignProduct(context, input.id)
    ),
};

export const campaignsRouter = {
  create: funnelProcedure("campaign_created")
    .input(
      z.object({
        adAccountId: z.string().regex(/^\d+$/u).optional(),
        countries: countries.default(["US"]),
        dailyBudget: dailyBudget.default(15),
        pageId: z.string().regex(/^\d+$/u).optional(),
        productId: id,
      })
    )
    .handler(
      async ({ context, input }) => await createProductCampaign(context, input)
    ),
  list: protectedProcedure.handler(
    async ({ context }) => await listCampaigns(context)
  ),
};

export const runsRouter = {
  get: protectedProcedure
    .input(byId)
    .handler(async ({ context, input }) => await getRun(context, input.id)),
  list: protectedProcedure.handler(
    async ({ context }) => await listRuns(context)
  ),
  start: funnelProcedure("run_started")
    .input(
      z.object({
        autopilot: z.boolean().default(false),
        countries: countries.default(["US"]),
        dailyBudget: dailyBudget.default(15),
        seed,
      })
    )
    .handler(async ({ context, input }) => await startRun(context, input)),
};
