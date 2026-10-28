import { z } from "zod";

import { createProductCampaign, listCampaigns } from "../flow/campaigns";
import { connectionErrors } from "../flow/connections";
import {
  decideDesign,
  generateDesign,
  getDesign,
  listDesigns,
} from "../flow/designs";
import { readIdeaDossier, startIdeaDossier } from "../flow/evidence";
import { listIdeas, researchIdeas, tasteMapStatus } from "../flow/ideas";
import {
  browseCatalog,
  createDesignProduct,
  listProducts,
  publishDesignProduct,
} from "../flow/products";
import { approveIdeas, getRun, listRuns, startRun } from "../flow/runs";
import { transitionErrors } from "../flow/transitions";
import { funnelProcedure, protectedProcedure } from "../index";

// The seller flow, one procedure per step: research → design → approve →
// product → publish → paused campaign, or all of it in one run. runs.start
// returns the run at once; the run goes on in the background (../workflows).

const id = z.string().min(1).max(64);
const seed = z.string().trim().min(1).max(200);
const reason = z.string().trim().max(500);
const countries = z
  .array(z.string().regex(/^[A-Z]{2}$/u))
  .min(1)
  .max(25);
// Makes a create idempotent (AIP-155): the same ID returns the same row.
const requestId = z.uuid();
// The ideas one "See designs" may approve; research saves fewer.
const MAX_IDEAS = 20;
// Dollars a day; the upper bound stops a typo from staging a runaway budget.
const dailyBudget = z.number().min(1).max(500);

// Shared with the MCP tools, which leave the defaults to these procedures.
export const fields = { countries, dailyBudget, id, reason, seed };

const byId = z.object({ id });
const byRun = z.object({ runId: id.optional() });

export const ideasRouter = {
  // The idea's research dossier (tavily-evidence), read back from Tavily
  // while it's pending; null before one is started.
  dossier: protectedProcedure
    .input(z.object({ ideaId: id }))
    .handler(
      async ({ context, input }) => await readIdeaDossier(context, input.ideaId)
    ),
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
  // Whether runs show Qloo's taste map and offer an LLM-only run.
  tasteMap: protectedProcedure.handler(
    async ({ context }) => await tasteMapStatus(context)
  ),
  startDossier: protectedProcedure
    .input(z.object({ ideaId: id }))
    .handler(
      async ({ context, input }) =>
        await startIdeaDossier(context, input.ideaId)
    ),
};

export const designsRouter = {
  approve: funnelProcedure("design_approved")
    .errors(transitionErrors)
    .input(byId)
    .handler(
      async ({ context, input }) =>
        await decideDesign(context, input.id, { approve: true, by: "merchant" })
    ),
  generate: protectedProcedure
    .errors(connectionErrors)
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
    .errors(transitionErrors)
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
    .input(
      z.object({
        catalogProductId: id.optional(),
        designId: id,
        requestId: requestId.optional(),
      })
    )
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
        requestId: requestId.optional(),
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
  // "See designs": the run draws a design for each of these ideas, and for
  // no other. Returns the run, now drawing.
  approveIdeas: protectedProcedure
    .errors(transitionErrors)
    .input(z.object({ id, ideaIds: z.array(id).min(1).max(MAX_IDEAS) }))
    .handler(async ({ context, input }) => {
      await approveIdeas(context, input.id, input.ideaIds);
      return await getRun(context, input.id);
    }),
  get: protectedProcedure
    .input(byId)
    .handler(async ({ context, input }) => await getRun(context, input.id)),
  list: protectedProcedure.handler(
    async ({ context }) => await listRuns(context)
  ),
  start: funnelProcedure("run_started")
    .errors(connectionErrors)
    .input(
      z.object({
        autopilot: z.boolean().default(false),
        countries: countries.default(["US"]),
        dailyBudget: dailyBudget.default(15),
        // false: an LLM-only run, to compare with Qloo (qloo-taste-map).
        qloo: z.boolean().optional(),
        seed,
      })
    )
    .handler(async ({ context, input }) => await startRun(context, input)),
};
