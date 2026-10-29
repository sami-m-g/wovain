import { z } from "zod";

import { createProductCampaign, listCampaigns } from "../flow/campaigns";
import { campaignCompetition, readIdeaCompetition } from "../flow/competition";
import { connectionErrors } from "../flow/connections";
import {
  decideDesign,
  generateDesign,
  getDesign,
  listDesigns,
} from "../flow/designs";
import { streamDirections, warmDirections } from "../flow/drop-directions";
import { ideaStyle, pickStyle } from "../flow/drop-style";
import { readIdeaDossier, startIdeaDossier } from "../flow/evidence";
import { listIdeas, researchErrors, researchIdeas } from "../flow/ideas";
import {
  browseCatalog,
  createDesignProduct,
  listProducts,
  publishDesignProduct,
} from "../flow/products";
import { approveIdeas, getRun, listRuns, startRun } from "../flow/runs";
import { proposeProductPublish, storeManagementOn } from "../flow/store";
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
  // Reads the idea's competition again (tavily-competition): a read that
  // failed ("competition unknown") is retried; a finished one is returned.
  competition: protectedProcedure
    .input(z.object({ ideaId: id }))
    .handler(
      async ({ context, input }) =>
        await readIdeaCompetition(context, input.ideaId)
    ),
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
  // The drop's tone and colours (drop-style): suggested once, then the
  // merchant's pick.
  pickStyle: protectedProcedure
    .input(
      z.object({
        ideaId: id,
        palette: z.number().int().min(0).max(3).optional(),
        tone: z.number().int().min(0).max(2).optional(),
        toneLine: z.string().trim().min(1).max(140).optional(),
      })
    )
    .handler(
      async ({ context, input }) =>
        await pickStyle(context, input.ideaId, input)
    ),
  // QLOO_OFF while the kill switch is off; QLOO_NO_MATCH when Qloo knows
  // nothing in the seed.
  research: protectedProcedure
    .errors(researchErrors)
    .input(z.object({ seed }))
    .handler(
      async ({ context, input }) => await researchIdeas(context, input.seed)
    ),
  startDossier: protectedProcedure
    .input(z.object({ ideaId: id }))
    .handler(
      async ({ context, input }) =>
        await startIdeaDossier(context, input.ideaId)
    ),
  style: protectedProcedure
    .input(z.object({ ideaId: id }))
    .handler(
      async ({ context, input }) => await ideaStyle(context, input.ideaId)
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
  // With store-management on, publishing is an action in the approval
  // queue (flow/store proposeProductPublish): the product comes back as it
  // is now, with its approval, and goes live when the executor runs it.
  // Without the flag it is published at once (approval null).
  publish: protectedProcedure
    .input(byId)
    .handler(async ({ context, input }) => {
      const published = (await storeManagementOn(context))
        ? await proposeProductPublish(context, input.id, {
            byMerchant: context.mcpUserId === undefined,
          })
        : {
            ...(await publishDesignProduct(context, input.id)),
            approval: null,
          };
      // Counted only once it is live, whatever path it took.
      if (published.status === "public") {
        await context.analytics?.capture({
          distinctId: context.userId,
          event: "product_published",
          properties: {
            via: context.mcpUserId === undefined ? "web" : "chatgpt",
          },
        });
      }
      return published;
    }),
};

export const campaignsRouter = {
  // The competition the campaign's ads were written against, for the ad
  // approval view (tavily-competition); null when none was read.
  competition: protectedProcedure
    .input(z.object({ campaignId: id }))
    .handler(
      async ({ context, input }) =>
        await campaignCompetition(context, input.campaignId)
    ),
  create: funnelProcedure("campaign_created")
    .input(
      z.object({
        adAccountId: z.string().regex(/^\d+$/u).optional(),
        countries: countries.default(["US"]),
        dailyBudget: dailyBudget.default(15),
        pageId: z.string().regex(/^\d+$/u).optional(),
        pixelId: z.string().regex(/^\d+$/u).optional(),
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
  // What to sell next (drop-directions): from Qloo trends, within the
  // saved brand unless ignored; never made without Qloo.
  directions: protectedProcedure
    .errors(researchErrors)
    .input(
      z.object({
        ignoreBrand: z.boolean().default(false),
        round: z.number().int().min(0).max(1000).default(0),
      })
    )
    // Streams: what was kept at once, or each card as it is written.
    .handler(({ context, input }) => streamDirections(context, input)),
  get: protectedProcedure
    .input(byId)
    .handler(async ({ context, input }) => await getRun(context, input.id)),
  list: protectedProcedure.handler(
    async ({ context }) => await listRuns(context)
  ),
  // Every run's ideas come from Qloo: with the trends-qloo kill switch off
  // it is refused (QLOO_OFF), and there is no switch to run without Qloo.
  start: funnelProcedure("run_started")
    .errors({ ...connectionErrors, ...researchErrors })
    .input(
      z.object({
        autopilot: z.boolean().default(false),
        countries: countries.default(["US"]),
        dailyBudget: dailyBudget.default(15),
        seed,
      })
    )
    .handler(async ({ context, input }) => await startRun(context, input)),
  // Opening the app finds the suggestions in the background when the kept
  // ones are missing or stale.
  warmDirections: protectedProcedure.handler(
    async ({ context }) => await warmDirections(context)
  ),
};
