import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/server";
import {
  adRatioSchema,
  adResultSchema,
  conceptRevisionSchema,
  decisionSchema,
} from "@wovain/shared/ad";
import { breakeven } from "@wovain/shared/economics";
import { ruleThresholds } from "@wovain/shared/rules";
import { z } from "zod";

import {
  AD_IMAGE_ENDPOINT,
  AD_IMAGE_USD,
  adImageInputs,
} from "../lib/ad-images.ts";
import { checkConcepts } from "../lib/ad-media.ts";
import { isFalMedia, jobHandles, mediaUrls } from "../lib/fal-media.ts";
import type { VideoPricing } from "../lib/fal-pricing.ts";
import { text } from "../lib/tool-result.ts";
import { upstreamReply } from "../lib/upstream.ts";
import type { Upstream } from "../lib/upstream.ts";
import { planVideos } from "../lib/video-plan.ts";
import type { Store } from "../store.ts";
import { widgetUri } from "../widgets.ts";

const falMediaUrl = z.url().refine(isFalMedia, "a clip URL on fal.media");

const conceptsInput = z.array(conceptRevisionSchema).min(1).max(6);

const imagesInput = z
  .array(
    z.object({
      color: z.string().optional(),
      ratio: adRatioSchema,
      // The lifestyle or studio scene: people, place, light and mood.
      scene: z.string().min(10).max(1200),
    })
  )
  .min(1)
  .max(8);

const spends = {
  destructiveHint: false,
  openWorldHint: true,
  readOnlyHint: false,
};

// wovain's calls on the merchant's own fal account.
const falClient = (store: Store, upstream: Upstream | undefined) => {
  const fal = async (tool: string, args: Record<string, unknown>) =>
    await upstreamReply(upstream, {
      args,
      id: "fal",
      tool,
      userId: store.userId,
    });

  // The merchant's own fal account runs requests wovain builds: the agent
  // picks the design and the scene, never the model or the references.
  // wovain keeps the accepted job handles, so collect_ad_media can fetch
  // only results of jobs it submitted.
  const submit = async (
    designId: string,
    requests: Record<string, unknown>[]
  ) => {
    const reply = await fal("submit_jobs", { requests });
    const jobs = jobHandles(reply);
    if (jobs.length > 0) {
      await store.recordAdMedia(designId, { jobs });
    }
    return reply;
  };
  return { fal, submit };
};
type Submit = ReturnType<typeof falClient>["submit"];

// The optional UGC clips: plan, generate and add audio.
const registerVideoTools = (
  server: McpServer,
  store: Store,
  videoPricing: VideoPricing,
  submit: Submit
) => {
  const planFor = async (designId: string) => {
    const [design, settings, prices] = await Promise.all([
      store.requireDesign(designId),
      store.getSettings(),
      videoPricing(),
    ]);
    return planVideos(design, settings, prices);
  };

  server.registerTool(
    "video_plan",
    {
      annotations: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: true,
      },
      description:
        "Plan the ad videos for a live design from wovain's settings: one fal request per clip, the background-audio request for each finished clip, and the estimated cost. Say the estimate, then run the clips with generate_videos and the audio with add_video_audio.",
      inputSchema: z.object({ designId: z.string() }),
      title: "Plan ad videos",
    },
    async ({ designId }) => {
      const plan = await planFor(designId);
      return { content: text(JSON.stringify(plan)) };
    }
  );

  server.registerTool(
    "generate_videos",
    {
      annotations: spends,
      description:
        "Generate a live design's ad clips on the merchant's own fal account, exactly as video_plan planned them (fal submit_jobs). Spends the merchant's fal credits: say video_plan's estimate first. Returns the job handles; wait for them with the fal tool's wait_for_jobs and don't call this again for the same clips. If the merchant hasn't connected fal, the result has needsConnection and a link to show them.",
      inputSchema: z.object({ designId: z.string() }),
      title: "Generate ad videos",
    },
    async ({ designId }) => {
      const plan = await planFor(designId);
      return await submit(
        designId,
        plan.clips.map((clip, index) => ({
          endpoint_id: clip.endpointId,
          index,
          input: clip.input,
        }))
      );
    }
  );

  server.registerTool(
    "add_video_audio",
    {
      annotations: spends,
      description:
        "Add the plan's background audio to finished clips on the merchant's own fal account (fal submit_jobs, one job per clip). Pass the clip URLs fal returned. Spends a little of the merchant's fal credits. Returns the job handles for the fal tool's wait_for_jobs. Says so when the plan has no audio step.",
      inputSchema: z.object({
        designId: z.string(),
        videoUrls: z.array(falMediaUrl).min(1).max(4),
      }),
      title: "Add background audio",
    },
    async ({ designId, videoUrls }) => {
      const [{ audio }, media] = await Promise.all([
        planFor(designId),
        store.getAdMedia(designId),
      ]);
      const collected = new Set(media.urls);
      if (videoUrls.some((url) => !collected.has(url))) {
        throw new Error(
          "Pass clips collect_ad_media returned for this design."
        );
      }
      if (audio === undefined) {
        return {
          content: text(
            "This plan has no separate audio step: use the clips as they are."
          ),
        };
      }
      return await submit(
        designId,
        videoUrls.map((url, index) => ({
          endpoint_id: audio.endpointId,
          index,
          input: { ...audio.perClip, video_url: url },
        }))
      );
    }
  );
};

export const registerAdTools = (
  server: McpServer,
  store: Store,
  videoPricing: VideoPricing,
  upstream: Upstream | undefined
) => {
  const { fal, submit } = falClient(store, upstream);
  registerVideoTools(server, store, videoPricing, submit);

  server.registerTool(
    "generate_ad_images",
    {
      annotations: spends,
      description: `Generate ad images for a live design on the merchant's own fal account. Each one edits the design's Fourthwall mockup (pick the color by name) into the scene you write, at Meta's ratio (1:1 or 4:5 for Feed, 9:16 for Stories and Reels), and keeps the print. About $${AD_IMAGE_USD.toFixed(2)} per image at fal's list price: say the total first. Returns job handles for the fal tool's wait_for_jobs. If the merchant hasn't connected fal, the result has needsConnection and a link to show them.`,
      inputSchema: z.object({ designId: z.string(), images: imagesInput }),
      title: "Generate ad images",
    },
    async ({ designId, images }) => {
      const design = await store.requireDesign(designId);
      return await submit(
        designId,
        adImageInputs(design, images).map((input, index) => ({
          endpoint_id: AD_IMAGE_ENDPOINT,
          index,
          input,
        }))
      );
    }
  );

  server.registerTool(
    "collect_ad_media",
    {
      annotations: {
        destructiveHint: false,
        openWorldHint: true,
        readOnlyHint: false,
      },
      description:
        "After wait_for_jobs, fetch the results of the fal jobs wovain submitted for a design (images, clips, audio) from the merchant's account and keep their media URLs. Returns each job's URLs; only these, the design's mockups and its artwork can go in an ad. A job still running returns no URLs yet.",
      inputSchema: z.object({ designId: z.string() }),
      title: "Collect ad media",
    },
    async ({ designId }) => {
      const { jobs } = await store.getAdMedia(designId);
      const replies = await Promise.all(
        jobs.map(
          async (job) =>
            await fal("get_job_result", {
              endpoint_id: job.endpointId,
              request_id: job.requestId,
            })
        )
      );
      const connect = replies.find(
        (reply) =>
          typeof reply.structuredContent === "object" &&
          reply.structuredContent !== null &&
          "needsConnection" in reply.structuredContent
      );
      if (connect !== undefined) {
        return connect;
      }
      const results = jobs.map((job, index) => ({
        ...job,
        urls: mediaUrls(replies[index] ?? {}),
      }));
      await store.recordAdMedia(designId, {
        urls: results.flatMap((result) => result.urls),
      });
      return { content: text(JSON.stringify({ jobs: results })) };
    }
  );

  registerAppTool(
    server,
    "show_ad_widget",
    {
      _meta: {
        "openai/toolInvocation/invoked": "Ads ready",
        "openai/toolInvocation/invoking": "Putting the ad concepts together…",
        ui: { resourceUri: widgetUri("ad") },
      },
      annotations: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description:
        "Show the ad widget for a live design: its ad concepts (each with a hook, angle, audience, signals, visuals per ratio, up to 5 primary texts and 5 headlines, and a CTA) and one coach line. After feedback, pass only the revised or new concepts, each with the merchant's feedback: wovain keeps the others and their choices, bumps the revision and redraws. Visuals must be fal output or this design's mockups; carousel cards must be live designs. wovain adds the breakeven math and the rule thresholds itself.",
      inputSchema: z.object({
        coach: z.string().min(1).max(160),
        concepts: conceptsInput,
        designId: z.string(),
      }),
      outputSchema: adResultSchema,
      title: "Show ad widget",
    },
    async ({ coach, concepts, designId }) => {
      const [design, settings] = await Promise.all([
        store.requireDesign(designId),
        store.getSettings(),
      ]);
      await checkConcepts(store, design, concepts);
      const { baseCost, price } = design.quote;
      const math = breakeven(price, baseCost, settings.economics);
      const [mockup] = design.mockups;
      const ad = await store.saveConcepts(
        {
          coach,
          designId,
          economics: {
            baseCost,
            breakevenPerSale: math.perSale,
            cardFees: math.cardFees,
            price,
            refundReserve: math.refundReserve,
            roas: math.roas,
            roasOnOrderValue: math.roasOnOrderValue,
          },
          productTitle: design.listing.title,
          rules: {
            ...ruleThresholds(math.perSale, settings.rules),
            scaleStepPct: settings.rules.scaleStepPct,
          },
          staticImage: {
            alt: mockup?.alt ?? design.listing.title,
            url: mockup?.url ?? design.artwork.url,
          },
        },
        concepts
      );
      return {
        content: text(
          `Showing ${ad.concepts.length} ad concept(s) for ${designId}. Wait for the merchant to approve, skip or give feedback on each.`
        ),
        structuredContent: { ad },
      };
    }
  );

  registerAppTool(
    server,
    "record_ad",
    {
      _meta: {
        ui: { resourceUri: widgetUri("ad"), visibility: ["model", "app"] },
      },
      annotations: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description:
        "Record the merchant's choice on one ad concept: approved for the campaign or skipped. Returns the product's ads and how many ad widgets still have undecided concepts.",
      inputSchema: z.object({
        conceptId: z.string(),
        designId: z.string(),
        status: decisionSchema,
      }),
      outputSchema: adResultSchema.extend({ waiting: z.int() }),
      title: "Record ad choice",
    },
    async ({ conceptId, designId, status }) => {
      const { ad, waiting } = await store.recordConcept(
        designId,
        conceptId,
        status
      );
      return {
        content: text(
          `Ad ${conceptId} for design ${designId} ${status}. ${waiting} ad widget(s) still waiting.`
        ),
        structuredContent: { ad, waiting },
      };
    }
  );
};
