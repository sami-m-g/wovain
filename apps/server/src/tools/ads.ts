import { createHash } from "node:crypto";

import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/server";
import {
  adResultSchema,
  adSlotSchema,
  adStatusSchema,
  adVideoSchema,
} from "@wovain-foss/shared/ad";
import type { Ad } from "@wovain-foss/shared/ad";
import { breakeven } from "@wovain-foss/shared/economics";
import { ruleThresholds } from "@wovain-foss/shared/rules";
import ffmpegStatic from "ffmpeg-static";
import { z } from "zod";

import { cardUri } from "../cards.ts";
import type { Env } from "../env.ts";
import type { VideoPricing } from "../lib/fal-pricing.ts";
import { uploadToFal } from "../lib/fal-storage.ts";
import { fetchSpend } from "../lib/fal-usage.ts";
import { downloadImage, MAX_VIDEO_BYTES } from "../lib/fetch-image.ts";
import { burnOverlays } from "../lib/ffmpeg.ts";
import { planVideos } from "../lib/video-plan.ts";
import type { Store } from "../store.ts";

const text = (value: string) => [{ text: value, type: "text" as const }];

// Tools return a short, user-safe message instead of raw upstream errors.
const safely = async <T>(
  run: () => Promise<{
    content: ReturnType<typeof text>;
    structuredContent?: T;
  }>
) => {
  try {
    return await run();
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown error";
    return {
      content: text(`wovain couldn't finish this: ${reason}`),
      isError: true,
    };
  }
};

const designFor = async (store: Store, designId: string) => {
  const design = await store.getDesign(designId);
  if (design === undefined) {
    throw new Error(`no design ${designId}`);
  }
  return design;
};

export const registerAdTools = (
  server: McpServer,
  store: Store,
  env: Env,
  videoPricing: VideoPricing
) => {
  server.registerTool(
    "video_plan",
    {
      annotations: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: true,
      },
      description:
        "Plan the ad videos for a live design from wovain's settings: one ready fal request per clip (submit each with fal's submit_jobs exactly as given), plus the background-audio request to run on each finished clip, and the estimated cost.",
      inputSchema: z.object({ designId: z.string() }),
      title: "Plan ad videos",
    },
    async ({ designId }) =>
      await safely(async () => {
        const [design, settings, prices] = await Promise.all([
          designFor(store, designId),
          store.getSettings(),
          videoPricing(),
        ]);
        const plan = planVideos(design, settings, prices);
        return { content: text(JSON.stringify(plan)) };
      })
  );

  server.registerTool(
    "finish_video",
    {
      annotations: {
        destructiveHint: false,
        openWorldHint: true,
        readOnlyHint: false,
      },
      description:
        "Finish one ad clip: burn in the logo (wovain's logo setting, else `logoUrl`, else the shop name as text) for the first seconds and a short caption for the whole clip (ads autoplay muted), then host it on fal storage. Pass fal's final video URL (after background audio). Returns the public URL for show_ad_card and Meta.",
      inputSchema: z.object({
        brand: z.string().min(1).max(40),
        caption: z.string().max(90).optional(),
        designId: z.string(),
        // The shop's logo when wovain's logo setting is empty.
        logoUrl: z.url().optional(),
        slot: adSlotSchema,
        videoUrl: z.url(),
      }),
      outputSchema: z.object({ url: z.url() }),
      title: "Finish ad video",
    },
    async ({ brand, caption, designId, logoUrl, slot, videoUrl }) =>
      await safely(async () => {
        if (env.FAL_KEY === undefined) {
          throw new Error(
            "add FAL_KEY to .env so finished videos can be hosted"
          );
        }
        const [settings, video] = await Promise.all([
          store.getSettings(),
          downloadImage(videoUrl, MAX_VIDEO_BYTES),
        ]);
        const ffmpeg = env.WOVAIN_FFMPEG ?? ffmpegStatic ?? "";
        const logoSource =
          settings.overlay.logoUrl === "" ? logoUrl : settings.overlay.logoUrl;
        const logo =
          logoSource === undefined
            ? undefined
            : await downloadImage(logoSource);
        const finished = await burnOverlays(video, {
          brand,
          brandSeconds: settings.overlay.brandSeconds,
          caption: settings.overlay.captions ? caption : undefined,
          ffmpeg,
          font: env.WOVAIN_FONT,
          logo,
        });
        const hash = createHash("sha256")
          .update(finished)
          .digest("hex")
          .slice(0, 12);
        const url = await uploadToFal(
          env.FAL_KEY,
          finished,
          `wovain-${designId}-${slot}-${hash}.mp4`,
          "video/mp4"
        );
        return { content: text(url), structuredContent: { url } };
      })
  );

  server.registerTool(
    "video_spend",
    {
      annotations: {
        destructiveHint: false,
        openWorldHint: true,
        readOnlyHint: true,
      },
      description:
        "Report what fal actually charged since a time (default: the last 2 hours), by endpoint, so the merchant sees the real cost next to video_plan's list-price estimate. Needs FAL_BILLING_KEY; without it, says it isn't set up.",
      inputSchema: z.object({ since: z.iso.datetime().optional() }),
      title: "fal spend",
    },
    async ({ since }) =>
      await safely(async () => {
        if (env.FAL_BILLING_KEY === undefined) {
          return {
            content: text(
              "Actual fal spend isn't set up: add a fal key with the Billing preset to .env as FAL_BILLING_KEY. Until then, only list-price estimates are available."
            ),
          };
        }
        const start =
          since === undefined
            ? new Date(Date.now() - 2 * 60 * 60 * 1000)
            : new Date(since);
        const spend = await fetchSpend(env.FAL_BILLING_KEY, start);
        return { content: text(JSON.stringify(spend)) };
      })
  );

  registerAppTool(
    server,
    "show_ad_card",
    {
      _meta: {
        "openai/toolInvocation/invoked": "Ads ready",
        "openai/toolInvocation/invoking": "Putting the ad card together…",
        ui: { resourceUri: cardUri("ad") },
      },
      annotations: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description:
        "Show the ad card for a live design: its finished videos (a failed clip as status failed), headline (short, product-led), primary text (2 to 3 lines) and one coach line. wovain adds the static mockup, the breakeven math and the rule thresholds itself. Redraw with the same designId after feedback.",
      inputSchema: z.object({
        coach: z.string().min(1).max(160),
        designId: z.string(),
        headline: z.string().min(1).max(60),
        primaryText: z.string().min(1).max(500),
        videos: z.array(adVideoSchema).min(1).max(4),
      }),
      outputSchema: adResultSchema,
      title: "Show ad card",
    },
    async ({ coach, designId, headline, primaryText, videos }) =>
      await safely(async () => {
        const [design, settings] = await Promise.all([
          designFor(store, designId),
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
            `Showing the ad card for ${designId}. Wait for the merchant to add it to the campaign, skip it or give feedback.`
          ),
          structuredContent: { ad: saved },
        };
      })
  );

  registerAppTool(
    server,
    "record_ad",
    {
      _meta: {
        ui: { resourceUri: cardUri("ad"), visibility: ["model", "app"] },
      },
      annotations: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description:
        "Record the merchant's choice on an ad card: added to the campaign or skipped. Returns how many ad cards are still waiting, so the campaign launches after the last one.",
      inputSchema: z.object({ designId: z.string(), status: adStatusSchema }),
      outputSchema: adResultSchema.extend({ waiting: z.int() }),
      title: "Record ad choice",
    },
    async ({ designId, status }) =>
      await safely(async () => {
        const { ad: saved, waiting } = await store.recordAd(designId, status);
        return {
          content: text(
            `Design ${designId} ads ${status}. ${waiting} ad card(s) still waiting.`
          ),
          structuredContent: { ad: saved, waiting },
        };
      })
  );
};
