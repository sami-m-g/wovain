import { log as evlog } from "evlog";
import { afterEach, describe, expect, it, vi } from "vitest";

import { writeAdCopy } from "./ads";
import {
  adCompetition,
  briefCompetition,
  gapsOf,
  nearIdentical,
  readCompetition,
  saturatedReason,
} from "./competition";
import type { Competition } from "./competition";
import { unsupportedClaims } from "./grounding";
import { withLlmTrace } from "./nemotron";
import type { QlooAffinity } from "./qloo";
import { saturationOf } from "./saturation";
import { fakeAgents } from "./test-doubles";
import { DecisionTrace } from "./trace";

const hit = (url: string, title: string, content = "", score = 0.8) => ({
  content,
  id: url,
  publishedDate: "",
  score,
  title,
  url,
});

const searchReply = (results: ReturnType<typeof hit>[]) => ({
  images: [],
  query: "q",
  requestId: "r",
  responseTime: 0.1,
  results,
});

const affinity = (cues: string[], value = 0.9): QlooAffinity => ({
  affinity: value,
  because: [],
  cues,
  id: `q-${cues.join("-")}`,
  name: "A Film",
  type: "movie",
});

const listings = Array.from({ length: 9 }, (_, index) =>
  hit(
    `https://www.etsy.com/listing/${index}`,
    `Spooky Season Ghost Tee ${index}`,
    "Retro distressed ghost, perfect gift, $24.99"
  )
);

const extracted = {
  failedResults: [],
  requestId: "r",
  responseTime: 1,
  results: [
    {
      rawContent:
        "Spooky Season tee $24.99. Retro distressed ghost. Reviews: runs small.",
      title: "Spooky Season Ghost Tee 0",
      url: "https://www.etsy.com/listing/0",
    },
  ],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("saturation", () => {
  it("counts only relevant marketplace listings that carry every theme word", () => {
    const found = nearIdentical("Spooky Season", [
      hit("https://www.etsy.com/l/1", "Spooky Season Tee"),
      hit("https://www.etsy.com/l/2", "Spooky Tee"),
      hit("https://news.example/a", "Spooky Season is here"),
      hit("https://www.redbubble.com/i/3", "Spooky Season", "", 0.2),
      hit("https://shop.myshopify.com/p/4", "Spooky season shirt"),
    ]);
    expect(found.map((item) => item.url)).toEqual([
      "https://www.etsy.com/l/1",
      "https://shop.myshopify.com/p/4",
    ]);
  });

  it("calls 8 or more near-identical listings saturated", () => {
    expect(saturationOf(0)).toBe("low");
    expect(saturationOf(4)).toBe("medium");
    expect(saturationOf(8)).toBe("high");
  });
});

describe("gapsOf", () => {
  it("keeps the audience cues no listing mentions, strongest first", () => {
    const gaps = gapsOf(
      [affinity(["retro", "pastel"], 0.5), affinity(["neon noir"], 0.9)],
      "Retro distressed ghost tee"
    );
    expect(gaps).toEqual([
      { cue: "neon noir", domain: "movie" },
      { cue: "pastel", domain: "movie" },
    ]);
  });
});

describe("readCompetition", () => {
  it("reads saturation, cited points and gaps, and traces each step", async () => {
    const search = vi.fn(
      async () => await Promise.resolve(searchReply(listings))
    );
    const extract = vi.fn(async () => await Promise.resolve(extracted));
    const { ask } = fakeAgents({
      competition_summary: [
        {
          points: [
            {
              kind: "style",
              sourceUrl: "https://www.etsy.com/listing/0",
              text: "Retro distressed ghost",
            },
            {
              kind: "complaint",
              sourceUrl: "https://www.etsy.com/listing/0",
              text: "Runs small",
            },
            {
              kind: "hook",
              sourceUrl: "https://invented.example/x",
              text: "Made up",
            },
          ],
        },
      ],
    });
    const decisions = new DecisionTrace({ userId: "u1" });
    const competition = await withLlmTrace(
      { decisions, distinctId: "u1", routed: true, traceId: "t1" },
      async () =>
        await readCompetition(
          { ask, client: { extract, search } },
          {
            affinities: [affinity(["neon noir", "retro"])],
            theme: "Spooky Season",
          }
        )
    );
    expect(competition.status).toBe("read");
    expect(competition.saturation?.count).toBe(9);
    expect(competition.saturated).toBe(true);
    expect(competition.points.map((point) => point.text)).toEqual([
      "Retro distressed ghost",
      "Runs small",
    ]);
    expect(competition.prices?.median).toBe(24.99);
    expect(competition.gaps.map((gap) => gap.cue)).toEqual(["neon noir"]);
    expect(competition.failed).toEqual([]);
    expect(decisions.entries.map((entry) => entry.step)).toEqual(
      expect.arrayContaining([
        "tavily.search",
        "tavily.extract",
        "competition.cite",
        "competition.gaps",
      ])
    );
    const searched = decisions.entries.find(
      (entry) => entry.step === "tavily.search"
    );
    expect(searched?.sources[0]?.url).toBe("https://www.etsy.com/listing/0");
    expect(saturatedReason(competition)).toContain("9 near-identical");
  });

  it("marks the theme unknown and logs at error level when the search fails", async () => {
    const error = vi
      .spyOn(evlog, "error")
      .mockImplementation(() => ({}) as never);
    const search = vi.fn(
      async () => await Promise.reject(new Error("429 quota"))
    );
    const extract = vi.fn();
    const { ask } = fakeAgents({});
    const competition = await readCompetition(
      { ask, client: { extract, search } },
      { affinities: [], theme: "Spooky Season" }
    );
    expect(competition.status).toBe("unknown");
    expect(competition.error).toContain("429 quota");
    expect(competition.saturated).toBe(false);
    expect(extract).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: "COMPETITION_READ_FAILED" }),
      })
    );
  });

  it("keeps the read and names the failed step when the extract fails", async () => {
    const error = vi
      .spyOn(evlog, "error")
      .mockImplementation(() => ({}) as never);
    const search = vi.fn(
      async () => await Promise.resolve(searchReply(listings))
    );
    const extract = vi.fn(async () => await Promise.reject(new Error("down")));
    const { ask } = fakeAgents({ competition_summary: [{ points: [] }] });
    const competition = await readCompetition(
      { ask, client: { extract, search } },
      { affinities: [], theme: "Spooky Season" }
    );
    expect(competition.status).toBe("read");
    expect(competition.failed).toEqual(
      expect.arrayContaining(["extract", "prices"])
    );
    expect(error).toHaveBeenCalledTimes(2);
  });
});

const read: Competition = {
  failed: [],
  gaps: [{ cue: "neon noir", domain: "movie" }],
  points: [
    {
      kind: "style",
      source: { title: "Tee", url: "https://www.etsy.com/listing/0" },
      text: "Retro distressed ghost",
    },
    {
      kind: "claim",
      source: { title: "Tee", url: "https://www.etsy.com/listing/0" },
      text: "Best-selling Halloween tee, 500 sold",
    },
  ],
  readAt: "2026-10-29T00:00:00.000Z",
  saturated: false,
  status: "read",
};

describe("what the agents get", () => {
  it("gives the brief the looks to avoid and the gaps to aim at", () => {
    expect(briefCompetition(read)).toEqual({
      aimAt: ["neon noir"],
      avoidLooks: ["Retro distressed ghost"],
    });
    expect(briefCompetition({ ...read, status: "unknown" })).toBeUndefined();
  });

  it("gives the ad writer the angles with their sources", async () => {
    const competition = adCompetition(read);
    expect(competition?.angles[0]?.source).toBe(
      "https://www.etsy.com/listing/0"
    );
    const { ask, asked } = fakeAgents({
      ad_copy: [
        {
          variants: [
            {
              angle: "identity",
              headline: "Neon ghosts",
              message: "Not another retro ghost.",
            },
            {
              angle: "gift",
              headline: "For night owls",
              message: "Glow in the noir.",
            },
          ],
        },
      ],
    });
    await writeAdCopy(
      ask,
      { description: "d", idea: "i", title: "Ghost" },
      undefined,
      undefined,
      competition
    );
    expect(asked[0]?.prompt).toContain("https://www.etsy.com/listing/0");
  });

  it("lets the grounding guard accept a fact from a cited competitor point", () => {
    const prompt = JSON.stringify({ competition: adCompetition(read) });
    expect(unsupportedClaims("500 sold, best-selling", prompt)).toEqual([]);
    expect(unsupportedClaims("700 sold", prompt)).toEqual(["700"]);
  });
});
