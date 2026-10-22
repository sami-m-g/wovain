import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/server";
import {
  adResultSchema,
  adStatusSchema,
  adVideoSchema,
} from "@wovain/shared/ad";
import type { Ad } from "@wovain/shared/ad";
import { breakeven } from "@wovain/shared/economics";
import { ruleThresholds } from "@wovain/shared/rules";
import { z } from "zod";

import type { VideoPricing } from "../lib/fal-pricing.ts";
import { text } from "../lib/tool-result.ts";
import { upstreamReply } from "../lib/upstream.ts";
import type { Upstream } from "../lib/upstream.ts";
import { planVideos } from "../lib/video-plan.ts";
import type { Store } from "../store.ts";
import { widgetUri } from "../widgets.ts";

// A clip URL fal returned: https on fal's media CDN only.
const falMediaUrl = z.url().refine((value) => {
  const { hostname, protocol } = new URL(value);
  return (
    protocol === "https:" &&
    (hostname === "fal.media" || hostname.endsWith(".fal.media"))
  );
}, "a clip URL on fal.media");

export const registerAdTools = (
  server: McpServer,
  store: Store,
  videoPricing: VideoPricing,
  upstream: Upstream | undefined
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

  // The merchant's own fal account runs exactly the planned requests: the
  // agent picks the design, never the inputs.
  const submit = async (requests: Record<string, unknown>[]) =>
    await upstreamReply(upstream, {
      args: { requests },
      id: "fal",
      tool: "submit_jobs",
      userId: store.userId,
    });
  const spends = {
    destructiveHint: false,
    openWorldHint: true,
    readOnlyHint: false,
  };

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
      const { audio } = await planFor(designId);
      if (audio === undefined) {
        return {
          content: text(
            "This plan has no separate audio step: use the clips as they are."
          ),
        };
      }
      return await submit(
        videoUrls.map((url, index) => ({
          endpoint_id: audio.endpointId,
          index,
          input: { ...audio.perClip, video_url: url },
        }))
      );
    }
  );

  registerAppTool(
    server,
    "show_ad_widget",
    {
      _meta: {
        "openai/toolInvocation/invoked": "Ads ready",
        "openai/toolInvocation/invoking": "Putting the ad widget together…",
        ui: { resourceUri: widgetUri("ad") },
      },
      annotations: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description:
        "Show the ad widget for a live design: its finished videos (a failed clip as status failed), headline (short, product-led), primary text (2 to 3 lines) and one coach line. wovain adds the static mockup, the breakeven math and the rule thresholds itself. Redraw with the same designId after feedback.",
      inputSchema: z.object({
        coach: z.string().min(1).max(160),
        designId: z.string(),
        headline: z.string().min(1).max(60),
        primaryText: z.string().min(1).max(500),
        videos: z.array(adVideoSchema).min(1).max(4),
      }),
      outputSchema: adResultSchema,
      title: "Show ad widget",
    },
    async ({ coach, designId, headline, primaryText, videos }) => {
      const [design, settings] = await Promise.all([
        store.requireDesign(designId),
        store.getSettings(),
      ]);
      const { baseCost, price } = design.quote;
      const math = breakeven(price, baseCost, settings.economics);
      const [mockup] = design.mockups;
      const ad: Ad = {
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
        headline,
        primaryText,
        productTitle: design.listing.title,
        rules: {
          ...ruleThresholds(math.perSale, settings.rules),
          scaleStepPct: settings.rules.scaleStepPct,
        },
        staticImage: {
          alt: mockup?.alt ?? design.listing.title,
          url: mockup?.url ?? design.artwork.url,
        },
        status: "draft",
        videos,
      };
      const saved = await store.saveAd(ad);
      return {
        content: text(
          `Showing the ad widget for ${designId}. Wait for the merchant to add it to the campaign, skip it or give feedback.`
        ),
        structuredContent: { ad: saved },
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
        "Record the merchant's choice on an ad widget: added to the campaign or skipped. Returns how many ad widgets are still waiting, so the campaign launches after the last one.",
      inputSchema: z.object({ designId: z.string(), status: adStatusSchema }),
      outputSchema: adResultSchema.extend({ waiting: z.int() }),
      title: "Record ad choice",
    },
    async ({ designId, status }) => {
      const { ad: saved, waiting } = await store.recordAd(designId, status);
      return {
        content: text(
          `Design ${designId} ads ${status}. ${waiting} ad widget(s) still waiting.`
        ),
        structuredContent: { ad: saved, waiting },
      };
    }
  );
};
