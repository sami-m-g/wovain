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
import { chargeRun } from "../lib/autopilot.ts";
import type { Spend } from "../lib/autopilot.ts";
import {
  gpuSeconds,
  isFalMedia,
  jobHandles,
  mediaUrls,
} from "../lib/fal-media.ts";
import type { VideoPricing } from "../lib/fal-pricing.ts";
import { text } from "../lib/tool-result.ts";
import { upstreamReply } from "../lib/upstream.ts";
import type { Upstream } from "../lib/upstream.ts";
import { planVideos, REFRAME_USD, reframeRequests } from "../lib/video-plan.ts";
import type { Store } from "../store.ts";
import { widgetUri } from "../widgets.ts";

const falMediaUrl = z.url().refine(isFalMedia, "a clip URL on fal.media");
const clipsInput = z.object({
  designId: z.string(),
  videoUrls: z.array(falMediaUrl).min(1).max(4),
});

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
const falClient = (store: Store, { autopilotOn, upstream }: AdToolDeps) => {
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
  // only results of jobs it submitted. An autopilot run is charged first,
  // so a request over its cap is never sent.
  const submit = async (
    designId: string,
    requests: Record<string, unknown>[],
    cost: { usd: number; what: Spend }
  ) => {
    await chargeRun(store, { on: autopilotOn, ...cost });
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
  // Only fal output collect_ad_media returned for this design goes back to fal.
  const requireCollected = async (designId: string, urls: string[]) => {
    const media = await store.getAdMedia(designId);
    const collected = new Set(media.urls);
    if (urls.some((url) => !collected.has(url))) {
      throw new Error("Pass URLs collect_ad_media returned for this design.");
    }
  };
  const planFor = async (designId: string, start?: string) => {
    const [design, settings, prices] = await Promise.all([
      store.requireDesign(designId),
      store.getSettings(),
      videoPricing(),
      requireCollected(designId, start === undefined ? [] : [start]),
    ]);
    return planVideos(design, settings, prices, start);
  };
  const planInput = z.object({
    designId: z.string(),
    startImageUrl: falMediaUrl.optional(),
  });

  server.registerTool(
    "video_plan",
    {
      annotations: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: true,
      },
      description:
        "Plan the ad video for a live design from wovain's settings: one short fal clip, its background audio, the crops to 9:16, 4:5 and 1:1, and the estimated cost. Pass startImageUrl (a 9:16 ad image collect_ad_media returned for this design) to start the clip from it instead of the mockup. Say the estimate, then run the clip with generate_videos, the audio with add_video_audio and the crops with reframe_videos.",
      inputSchema: planInput,
      title: "Plan ad videos",
    },
    async ({ designId, startImageUrl }) => {
      const plan = await planFor(designId, startImageUrl);
      return { content: text(JSON.stringify(plan)) };
    }
  );

  server.registerTool(
    "generate_videos",
    {
      annotations: spends,
      description:
        "Generate a live design's ad clip on the merchant's own fal account, exactly as video_plan planned it with the same startImageUrl (fal submit_jobs). Spends the merchant's fal credits: say video_plan's estimate first. Returns the job handles; wait for them with the fal tool's wait_for_jobs and don't call this again for the same clip. If the merchant hasn't connected fal, the result has needsConnection and a link to show them.",
      inputSchema: planInput,
      title: "Generate ad videos",
    },
    async ({ designId, startImageUrl }) => {
      const plan = await planFor(designId, startImageUrl);
      const laterUsd =
        ((plan.audio?.usdPerClip ?? 0) + plan.reframe.usdPerClip) *
        plan.clips.length;
      return await submit(
        designId,
        plan.clips.map((clip, index) => ({
          endpoint_id: clip.endpointId,
          index,
          input: clip.input,
        })),
        { usd: plan.estimate.usd - laterUsd, what: "video" }
      );
    }
  );

  server.registerTool(
    "add_video_audio",
    {
      annotations: spends,
      description:
        "Add the plan's background audio to finished clips on the merchant's own fal account (fal submit_jobs, one job per clip). Pass the clip URLs fal returned. Spends a little of the merchant's fal credits. Returns the job handles for the fal tool's wait_for_jobs. Says so when the plan has no audio step.",
      inputSchema: clipsInput,
      title: "Add background audio",
    },
    async ({ designId, videoUrls }) => {
      const [{ audio }] = await Promise.all([
        planFor(designId),
        requireCollected(designId, videoUrls),
      ]);
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
        })),
        { usd: audio.usdPerClip * videoUrls.length, what: "audio" }
      );
    }
  );

  server.registerTool(
    "reframe_videos",
    {
      annotations: spends,
      description: `Crop finished clips to Meta's 9:16, 4:5 and 1:1 on the merchant's own fal account (fal's ffmpeg scale-video, three jobs per clip), so one generated clip covers every placement. Pass the clip URLs collect_ad_media returned (after add_video_audio when the plan has audio). About $${(3 * REFRAME_USD).toFixed(2)} per clip. Returns the job handles for the fal tool's wait_for_jobs; the jobs for each clip come in the order 1:1, 4:5, 9:16.`,
      inputSchema: clipsInput,
      title: "Crop ad videos",
    },
    async ({ designId, videoUrls }) => {
      await requireCollected(designId, videoUrls);
      const requests = videoUrls.flatMap((url) => reframeRequests(url));
      return await submit(
        designId,
        requests.map((request, index) => ({
          endpoint_id: request.endpointId,
          index,
          input: request.input,
        })),
        { usd: requests.length * REFRAME_USD, what: "video" }
      );
    }
  );
};

// During an autopilot run, every paid fal request counts against the run's
// cap before it's sent (lib/autopilot.ts chargeRun).
interface AdToolDeps {
  autopilotOn: boolean;
  upstream?: Upstream | undefined;
  videoPricing: VideoPricing;
}

export const registerAdTools = (
  server: McpServer,
  store: Store,
  deps: AdToolDeps
) => {
  const { fal, submit } = falClient(store, deps);
  registerVideoTools(server, store, deps.videoPricing, submit);

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
        })),
        { usd: images.length * AD_IMAGE_USD, what: "image" }
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
      const results = jobs.map((job, index) => {
        const reply = replies[index] ?? {};
        const seconds = gpuSeconds(reply);
        return {
          ...job,
          ...(seconds !== undefined && {
            gpuSeconds: seconds,
            measuredAt: job.measuredAt ?? new Date().toISOString(),
          }),
          urls: mediaUrls(reply),
        };
      });
      // The GPU time fal reported feeds the weekly aggregate (docs/sustainability.md).
      await store.recordAdMedia(designId, {
        jobs: results.map(({ urls: _urls, ...job }) => job),
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
          // The store keeps the fields adSchema names and drops the rest.
          economics: {
            ...math,
            baseCost,
            breakevenPerSale: math.perSale,
            price,
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
