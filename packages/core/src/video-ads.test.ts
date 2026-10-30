import { describe, expect, it } from "vitest";

import { AI_DISCLOSURE } from "./ad-video";
import { stagePausedCampaign } from "./ads";
import type { WriteOnce } from "./ads";
import type { ToolCall } from "./upstream";
import { videoAdInput, videoUrlOf } from "./video-ads";

// Video ad creatives (openspec video-ad-creatives) against a fake Meta Ads
// MCP: each clip is uploaded, waited for, and staged as one more ad next to
// the image ads; a clip Meta won't take is skipped. No real account is
// touched.

const fakeMeta = (videoStatus: (url: string) => string = () => "ready") => {
  const calls: { args: Record<string, unknown>; tool: string }[] = [];
  const uploads = new Map<string, string>();
  let next = 0;
  const id = (prefix: string) => {
    next += 1;
    return `${prefix}_${next}`;
  };
  const call: ToolCall = async (tool, args) => {
    calls.push({ args, tool });
    const replies: Record<string, () => unknown> = {
      ads_create_ad: () => ({ ad_id: id("ad") }),
      ads_create_ad_set: () => ({ ad_set_id: id("as") }),
      ads_create_campaign: () => ({ campaign_id: "c_1" }),
      ads_create_creative: () => ({ creative_id: id("cr") }),
      ads_creative_upload_media: () => {
        const videoId = id("v");
        uploads.set(videoId, String(args["media_url"]));
        return { result_kind: "URL_VIDEO", video_id: videoId };
      },
      ads_get_ad_videos: () => {
        const [videoId] = args["video_ids"] as string[];
        return {
          data: [
            {
              id: videoId,
              status: {
                video_status: videoStatus(uploads.get(videoId ?? "") ?? ""),
              },
            },
          ],
        };
      },
    };
    const reply = replies[tool];
    if (reply === undefined) {
      throw new Error(`unexpected tool ${tool}`);
    }
    return await Promise.resolve(reply());
  };
  return { call, calls };
};

const COPY = [
  { angle: "humor", headline: "h1", message: "m1" },
  { angle: "gift", headline: "h2", message: "m2" },
];

const plan = {
  adAccountId: "222",
  copy: COPY,
  countries: ["US"],
  dailyBudgetCents: 1000,
  imageUrl: "https://cdn.example.com/1.png",
  linkUrl: "https://shop.example.com/products/1",
  name: "wovain · Cats",
  pageId: "p_1",
  tag: "w-test",
  targeting: { geo_locations: { countries: ["US"] } },
  videos: ["https://fal.test/tall.mp4", "https://fal.test/square.mp4"],
};

const noWait = async () => await Promise.resolve();

describe("video ad creatives", () => {
  it("asks fal for a short, silent clip at the aspect, from the mockup", () => {
    expect(videoAdInput("https://cdn.test/m.png", "9:16")).toMatchObject({
      aspect_ratio: "9:16",
      audio: false,
      duration: 5,
      start_image_url: "https://cdn.test/m.png",
    });
    expect(
      videoUrlOf({ data: { video: { url: "https://fal.test/c.mp4" } } })
    ).toBe("https://fal.test/c.mp4");
  });

  it("uploads each clip to Meta and stages a video ad next to the image ads", async () => {
    const { call, calls } = fakeMeta();
    const staged = await stagePausedCampaign(call, plan, undefined, {
      wait: noWait,
    });
    const of = (tool: string) => calls.filter((item) => item.tool === tool);
    expect(of("ads_creative_upload_media").map((item) => item.args)).toEqual([
      expect.objectContaining({
        media_type: "VIDEO",
        media_url: "https://fal.test/tall.mp4",
        upload_source: "URL",
      }),
      expect.objectContaining({ media_url: "https://fal.test/square.mp4" }),
    ]);
    const videoCreatives = of("ads_create_creative").filter(
      (item) => item.args["video_id"] !== undefined
    );
    expect(videoCreatives.map((item) => item.args)).toEqual([
      expect.objectContaining({
        headline: "h1",
        image_url: plan.imageUrl,
        video_id: expect.stringContaining("v_"),
      }),
      expect.objectContaining({ video_id: expect.stringContaining("v_") }),
    ]);
    // Two image ads and two video ads.
    expect(of("ads_create_ad")).toHaveLength(4);
    expect(staged.adIds).toHaveLength(4);
    expect(staged.videoErrors).toBeUndefined();
  });

  it("says in the video ad's text when its model is AI-generated", async () => {
    const { call, calls } = fakeMeta();
    await stagePausedCampaign(
      call,
      { ...plan, videoAiModel: true },
      undefined,
      { wait: noWait }
    );
    const messages = calls
      .filter(
        (item) =>
          item.tool === "ads_create_creative" &&
          item.args["video_id"] !== undefined
      )
      .map((item) => item.args["message"]);
    expect(messages).toEqual([
      `m1\n\n${AI_DISCLOSURE}`,
      `m1\n\n${AI_DISCLOSURE}`,
    ]);
  });

  it("skips a clip Meta can't process, and still stages the rest", async () => {
    const { call, calls } = fakeMeta((url) =>
      url.endsWith("tall.mp4") ? "error" : "ready"
    );
    const staged = await stagePausedCampaign(call, plan, undefined, {
      wait: noWait,
    });
    expect(staged.adIds).toHaveLength(3);
    expect(staged.videoErrors).toEqual([
      expect.stringContaining("couldn't process video"),
    ]);
    expect(calls.filter((item) => item.tool === "ads_create_ad")).toHaveLength(
      3
    );
  });

  it("uploads nothing twice when a staging is retried", async () => {
    const done = new Map<string, string>();
    const once: WriteOnce = async (name, perform) => {
      const saved = done.get(name);
      if (saved !== undefined) {
        return saved;
      }
      const made = await perform();
      done.set(name, made);
      return made;
    };
    const { call, calls } = fakeMeta();
    await stagePausedCampaign(call, plan, once, { wait: noWait });
    await stagePausedCampaign(call, plan, once, { wait: noWait });
    expect(
      calls.filter((item) => item.tool === "ads_creative_upload_media")
    ).toHaveLength(2);
  });
});
