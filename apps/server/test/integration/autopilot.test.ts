import type { ConceptRevision } from "@wovain/shared/ad";
import { AUTOPILOT_TERMS } from "@wovain/shared/autopilot";
import { designResultSchema } from "@wovain/shared/design";
import type { DesignJudgment } from "@wovain/shared/judge";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { claimPublish } from "../../src/lib/approval.ts";
import { decideAds, decideIdea } from "../../src/lib/autopilot-choose.ts";
import { decideDesign } from "../../src/lib/autopilot-decide.ts";
import type { AutopilotDeps } from "../../src/lib/autopilot-decide.ts";
import {
  chargeRun,
  runKeyFor,
  recordArt,
  startRun,
  stopRun,
  turnOff,
} from "../../src/lib/autopilot.ts";
import type { Upstream } from "../../src/lib/upstream.ts";
import type { Store } from "../../src/store.ts";
import {
  connectClient,
  demoDesign,
  mockAi,
  passingReply,
  testStore,
} from "../helpers.ts";

const judgment = (verdict: DesignJudgment["verdict"]): DesignJudgment => ({
  ...passingReply,
  fixes: verdict === "ready" ? [] : ["Use a bolder title."],
  verdict,
});

const idea = (rank: number, name: string) => ({
  idea: name,
  rank,
  sources: [{ title: "News", url: "https://news.example/1" }],
});

const designIdOf = (structured: unknown) =>
  designResultSchema.parse(structured).design.id;

const TRADEMARK = [{ title: "Mark", url: "https://tm.example/1" }];

// The image the run's art job made, and a design that prints it.
const ART_URL = "https://v3.fal.media/files/r1.png";
const artDesign = {
  ...demoDesign,
  artwork: { ...demoDesign.artwork, url: ART_URL },
  status: "draft" as const,
};

// The merchant's fal: art job results, OCR that reads `ocr`, and submitted
// jobs.
const fakeFal = (ocr: string) => {
  let submitted = 1;
  const replies: Record<string, (args: Record<string, unknown>) => unknown> = {
    get_job_result: (args) => ({
      images: [
        { url: `https://v3.fal.media/files/${String(args["request_id"])}.png` },
      ],
    }),
    run_model: () => ({ results: ocr }),
    submit_jobs: () => {
      submitted += 1;
      return { jobs: [{ endpoint_id: "art", request_id: `r${submitted}` }] };
    },
  };
  return {
    call: vi.fn(
      async ({ args, tool }: { args: Record<string, unknown>; tool: string }) =>
        await Promise.resolve({
          kind: "result" as const,
          result: { content: [], structuredContent: replies[tool]?.(args) },
        })
    ),
    configured: () => true,
  };
};

// Nemotron, the judge and research, each stubbed.
const depsWith = ({
  hits = [],
  ocr = "",
  onJudge = async () => {
    await Promise.resolve();
  },
  reply = { rank: 2, reason: "Most demand." },
  verdict = "ready",
}: {
  hits?: { title: string; url: string }[];
  // What OCR reads on the art.
  ocr?: string;
  onJudge?: () => Promise<void>;
  // Nemotron's reply to the idea or ads decision.
  reply?: Record<string, unknown>;
  verdict?: DesignJudgment["verdict"];
} = {}) => {
  const judge = vi.fn(async () => {
    await onJudge();
    return judgment(verdict);
  });
  const research = {
    research: vi.fn(
      async () =>
        await Promise.resolve({
          ideas: [
            idea(1, "Mickey cat parody"),
            idea(2, "Sakura cat club"),
            idea(3, "Retro cat sunset"),
          ],
          ranker: "nemotron",
        })
    ),
    // A brand-name idea always has a hit; the rest get `hits`.
    screen: vi.fn(
      async (phrase: string) =>
        await Promise.resolve(phrase.startsWith("Mickey") ? TRADEMARK : hits)
    ),
  };
  const { ai } = mockAi({ respond: { text: JSON.stringify(reply) } });
  const upstream = fakeFal(ocr);
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the stubs cover only what autopilot calls
  const deps = {
    ai,
    judge,
    model: "mockModel",
    research,
    upstream,
  } as unknown as AutopilotDeps;
  return { deps, judge, research, upstream };
};

let store: Store;

beforeEach(() => {
  store = testStore();
});

// The merchant opts in, a run starts and the agent shows a design in it.
const begin = async (videos = false, text: string[] = []) => {
  await store.saveAutopilotConsent({
    at: new Date().toISOString(),
    version: AUTOPILOT_TERMS.version,
  });
  const run = await startRun(store, { idea: "cat tees", videos });
  // The run's art job, with its printed words declared.
  await recordArt(store, () => [{ endpointId: "art", requestId: "r1", text }]);
  const design = await store.saveDesign(artDesign);
  return { designId: design.id, run };
};

const decide = async (
  deps: AutopilotDeps,
  ids: { designId: string; run: { id: string } }
) =>
  await decideDesign(deps, store, {
    designId: ids.designId,
    runId: ids.run.id,
  });

describe("starting a run", () => {
  test("needs the merchant's opt-in, and the same key returns the same run", async () => {
    await expect(
      startRun(store, { idea: "cat tees", videos: false })
    ).rejects.toThrow("autopilot_opt_in");
    const { run } = await begin();
    const again = await startRun(store, { idea: "cat tees", videos: false });
    expect(again.id).toBe(run.id);
    expect(run.id).toBe(runKeyFor("cat tees"));
    await expect(
      startRun(store, { idea: "dog tees", videos: false })
    ).rejects.toThrow("still running");
  });

  test("turning autopilot off stops every decision", async () => {
    const ids = await begin();
    await turnOff(store);
    await expect(decide(depsWith().deps, ids)).rejects.toThrow("is off");
  });
});

describe("the cost cap", () => {
  test("stops the run before a job would pass it", async () => {
    const { run } = await begin();
    await chargeRun(store, { on: true, usd: 4, what: "image" });
    await expect(
      chargeRun(store, { on: true, usd: 1.5, what: "image" })
    ).rejects.toThrow("cap");
    const [after] = await store.getAutopilotRuns();
    expect(after).toMatchObject({ id: run.id, spentUsd: 4, status: "stopped" });
  });

  test("refuses videos on a run without them, and anything when switched off", async () => {
    await begin();
    await expect(
      chargeRun(store, { on: true, usd: 1, what: "video" })
    ).rejects.toThrow("Videos are off");
    await expect(
      chargeRun(store, { on: false, usd: 0.1, what: "art" })
    ).rejects.toThrow("switched off");
  });

  test("doesn't count work outside a run", async () => {
    await chargeRun(store, { on: true, usd: 100, what: "video" });
    expect(await store.getAutopilotRuns()).toEqual([]);
  });
});

describe("idea", () => {
  test("risky themes never reach the model, and its pick is logged", async () => {
    const { run } = await begin();
    const { decision } = await decideIdea(depsWith().deps, store, run.id);
    expect(decision).toMatchObject({
      choice: "Sakura cat club",
      limits: ["1 idea(s) removed: trademark hits or unscreened"],
      point: "idea",
    });
  });
});

// One ad concept with a ready mockup visual.
const concept = (id: string, angle: string, hook: string) => ({
  angle,
  assets: [
    {
      alt: "Black tee",
      kind: "image" as const,
      ratio: "1:1" as const,
      source: "fourthwall" as const,
      status: "ready" as const,
      url: "https://cdn.fourthwall.com/x.webp",
    },
  ],
  audience: "Cat people",
  cta: "SHOP_NOW" as const,
  headlines: ["Sakura Season Cat Tee"],
  hook,
  id,
  name: angle,
  primaryTexts: ["A calico watches the sun go down."],
});

const saveConcepts = async (
  designId: string,
  concepts: ConceptRevision[] = [
    concept("c1", "Gift", "The friend who has every cat mug"),
    concept("c2", "Gift", "Another gift for cat friends"),
    concept("c3", "Moment", "Cat Tee, 20% off today"),
    concept("c4", "Identity", "For the quiet cat person"),
  ]
) =>
  await store.saveConcepts(
    {
      coach: "Three angles.",
      designId,
      economics: {
        baseCost: 17.7,
        breakevenPerSale: 10.32,
        cardFees: 1.38,
        price: 30,
        refundReserve: 0.6,
        roas: 2.9,
        roasOnOrderValue: 3.6,
      },
      productTitle: "Japanese Cat Sunset Tee",
      rules: {
        alertAbove: 10.32,
        killDesignAt: 41.28,
        killExpensiveAbove: 15.48,
        killNoSalesAt: 30.96,
        scaleStepPct: 20,
        scaleUnder: 8.26,
      },
      staticImage: {
        alt: "Black tee",
        url: "https://cdn.fourthwall.com/x.webp",
      },
    },
    concepts
  );

describe("ads", () => {
  test("approves varied concepts only: one per angle, never copy with a price", async () => {
    const ids = await begin();
    const { deps } = depsWith({
      reply: {
        concepts: ["c1", "c2", "c3", "c4"].map((id) => ({
          approve: true,
          id,
          reason: "Clear hook.",
        })),
      },
    });
    await decide(deps, ids);
    await saveConcepts(ids.designId);
    const { approved } = await decideAds(deps, store, ids.run.id, ids.designId);
    expect(approved).toEqual(["c1", "c4"]);
    const [ad] = await store.getAds();
    expect(ad?.concepts.map((item) => item.status)).toEqual([
      "approved",
      "skipped",
      "skipped",
      "approved",
    ]);
    expect(ad?.status).toBe("added");
  });

  test("risky words anywhere in a concept, and carousels showing other designs or images, are never approved", async () => {
    const ids = await begin();
    const other = await store.saveDesign(artDesign);
    const { deps } = depsWith({
      reply: {
        concepts: ["c1", "c2", "c3", "c4"].map((id) => ({
          approve: true,
          id,
          reason: "Clear hook.",
        })),
      },
    });
    await decide(deps, ids);
    const mockup = demoDesign.mockups[0]?.url ?? "";
    const carousel = (
      id: string,
      angle: string,
      cards: { designId: string; imageUrl: string }[]
    ) => ({
      ...concept(id, angle, "The whole cat club"),
      assets: [],
      cards: cards.map((card) => ({ ...card, headline: "Cat Club" })),
    });
    await saveConcepts(ids.designId, [
      // A price in the name, a discount on a card.
      { ...concept("c1", "Gift", "For cat friends"), name: "Only $19" },
      {
        ...carousel("c2", "Set", [
          { designId: ids.designId, imageUrl: mockup },
          { designId: ids.designId, imageUrl: mockup },
        ]),
        cards: [
          {
            designId: ids.designId,
            headline: "50% off today",
            imageUrl: mockup,
          },
          { designId: ids.designId, headline: "Cat Club", imageUrl: mockup },
        ],
      },
      // A design the run never approved, and an image the design doesn't have.
      carousel("c3", "Collection", [
        { designId: ids.designId, imageUrl: mockup },
        { designId: other.id, imageUrl: mockup },
      ]),
      carousel("c4", "Bundle", [
        { designId: ids.designId, imageUrl: mockup },
        {
          designId: ids.designId,
          imageUrl: "https://v3.fal.media/files/other.png",
        },
      ]),
    ]);
    const { approved } = await decideAds(deps, store, ids.run.id, ids.designId);
    expect(approved).toEqual([]);
  });

  test("a carousel of approved designs and their own images is approved", async () => {
    const ids = await begin();
    const { deps } = depsWith({
      reply: { concepts: [{ approve: true, id: "c1", reason: "One set." }] },
    });
    await decide(deps, ids);
    const mockup = demoDesign.mockups[0]?.url ?? "";
    await saveConcepts(ids.designId, [
      {
        ...concept("c1", "Set", "The whole cat club"),
        assets: [],
        cards: [
          {
            designId: ids.designId,
            headline: "Cat Club Tee",
            imageUrl: mockup,
          },
          {
            designId: ids.designId,
            headline: "Cat Club Mug",
            imageUrl: mockup,
          },
        ],
      },
    ]);
    const { approved } = await decideAds(deps, store, ids.run.id, ids.designId);
    expect(approved).toEqual(["c1"]);
  });

  test("a design the run didn't decide can't have its ads approved", async () => {
    const { run } = await begin();
    await expect(
      decideAds(depsWith().deps, store, run.id, "d9")
    ).rejects.toThrow("wasn't approved");
  });
});

describe("design", () => {
  test("a ready design is approved for hidden publishing", async () => {
    const ids = await begin();
    const result = await decide(depsWith().deps, ids);
    expect(result.verdict).toBe("approved");
    const claimed = await claimPublish(store, ids.designId);
    expect(claimed.approval?.run).toBe(ids.run.id);
  });

  test("one made before the run started is refused", async () => {
    const before = await store.saveDesign({ ...demoDesign, status: "draft" });
    const { run } = await begin();
    await expect(
      decide(depsWith().deps, { designId: before.id, run })
    ).rejects.toThrow("wasn't made in autopilot run");
  });

  test("a change while it's judged voids the approval", async () => {
    const ids = await begin();
    const { deps } = depsWith({
      onJudge: async () => {
        await store.updateDesign(ids.designId, {
          colors: [{ hex: "#ffffff", inStock: true, name: "White" }],
        });
      },
    });
    await expect(decide(deps, ids)).rejects.toThrow("changed while");
    expect(await store.requireDesign(ids.designId)).toMatchObject({
      status: "draft",
    });
  });

  test("a run stopped or turned off while it's judged writes no approval", async () => {
    const stopped = await begin();
    const { deps } = depsWith({
      onJudge: async () => {
        await stopRun(store, stopped.run.id, { done: false, reason: "stop" });
      },
    });
    await expect(decide(deps, stopped)).rejects.toThrow("isn't running");
    expect(await store.requireDesign(stopped.designId)).toMatchObject({
      status: "draft",
    });

    store = testStore();
    const revoked = await begin();
    const off = depsWith({
      onJudge: async () => {
        await turnOff(store);
      },
    });
    await expect(decide(off.deps, revoked)).rejects.toThrow("off");
    expect(await store.requireDesign(revoked.designId)).toMatchObject({
      status: "draft",
    });
  });

  test("art the run didn't make is refused", async () => {
    const ids = await begin();
    await store.updateDesign(ids.designId, {
      artwork: {
        ...demoDesign.artwork,
        url: "https://v3.fal.media/files/x.png",
      },
    });
    await expect(decide(depsWith().deps, ids)).rejects.toThrow(
      "wasn't made by generate_art"
    );
  });

  test("OCR words the piece didn't declare refuse the approval", async () => {
    const ids = await begin();
    const { deps, judge } = depsWith({ ocr: "</s>NEKO CLUB</s>" });
    await expect(decide(deps, ids)).rejects.toThrow("didn't declare");
    expect(judge).not.toHaveBeenCalled();
    const [run] = await store.getAutopilotRuns();
    // The OCR was charged to the run.
    expect(run?.spentUsd).toBe(0.01);
  });

  test("a trademark hit drops it whatever the judge says", async () => {
    const ids = await begin();
    const { deps, judge } = depsWith({ hits: TRADEMARK });
    const result = await decide(deps, ids);
    expect(result.verdict).toBe("dropped");
    expect(judge).not.toHaveBeenCalled();
    expect(await store.requireDesign(ids.designId)).toMatchObject({
      status: "rejected",
    });
  });

  test("every product's listing and the art's declared words are screened", async () => {
    const ids = await begin(false, ["NEKO CLUB"]);
    await store.updateDesign(ids.designId, {
      dropName: "Cat Club",
      range: [
        {
          ...artDesign,
          customizationId: "cus_mug",
          kind: "Mug",
          listing: {
            description: "Tea with the cat. Dishwasher safe.",
            title: "Cat Sunset Mug",
          },
        },
      ],
    });
    const { deps, research } = depsWith({ ocr: "NEKO CLUB" });
    await decide(deps, ids);
    const screened = research.screen.mock.calls.map(([phrase]) => phrase);
    expect(screened).toEqual([
      "Cat Club",
      "Japanese Cat Sunset Tee",
      "Two lines",
      "Cat Sunset Mug",
      "Tea with the cat",
      "NEKO CLUB",
    ]);
  });

  test("a phrase the screen can't check refuses the approval", async () => {
    const ids = await begin();
    const { deps, judge, research } = depsWith();
    research.screen.mockRejectedValueOnce(new Error("tavily 503"));
    await expect(decide(deps, ids)).rejects.toThrow("couldn't check");
    expect(judge).not.toHaveBeenCalled();
    expect(await store.requireDesign(ids.designId)).toMatchObject({
      status: "draft",
    });
  });

  test("a price under the floor is never approved", async () => {
    const ids = await begin();
    await store.updateDesign(ids.designId, {
      quote: { ...demoDesign.quote, price: 20 },
    });
    const result = await decide(depsWith().deps, ids);
    expect(result.verdict).toBe("revise");
  });

  test("revisions stop at the cap", async () => {
    const ids = await begin();
    const { deps } = depsWith({ verdict: "revise" });
    const verdicts = [];
    for (let round = 0; round <= AUTOPILOT_TERMS.maxRevisions; round += 1) {
      // oxlint-disable-next-line no-await-in-loop -- rounds run in order
      const result = await decide(deps, ids);
      verdicts.push(result.verdict);
    }
    expect(verdicts).toEqual(["revise", "revise", "dropped"]);
    const [after] = await store.getAutopilotRuns();
    expect(after?.decisions.map((item) => item.choice)).toEqual(verdicts);
  });

  test("a dropped design is never decided again", async () => {
    const ids = await begin();
    const result = await decide(depsWith({ hits: TRADEMARK }).deps, ids);
    expect(result.verdict).toBe("dropped");
    await expect(decide(depsWith().deps, ids)).rejects.toThrow("was dropped");
  });

  test("every decided design counts toward the run's cap", async () => {
    const { designId, run } = await begin();
    const { deps } = depsWith({ hits: TRADEMARK });
    const ids = [designId];
    for (let n = 0; n < 3; n += 1) {
      // oxlint-disable-next-line no-await-in-loop -- designs saved in order
      const saved = await store.saveDesign(artDesign);
      ids.push(saved.id);
    }
    const verdicts = [];
    for (const id of ids) {
      // oxlint-disable-next-line no-await-in-loop -- decided in order
      const result = await decide(deps, { designId: id, run }).catch(
        (error: unknown) => (error instanceof Error ? error.message : "")
      );
      verdicts.push(typeof result === "string" ? result : result.verdict);
    }
    expect(verdicts.slice(0, 3)).toEqual(["dropped", "dropped", "dropped"]);
    expect(verdicts[3]).toContain("already decided 3 designs");
  });
});

const connect = async () => {
  const { deps, upstream } = depsWith();
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the fake covers only the calls these tools make
  const fal = upstream as unknown as Upstream;
  return await connectClient({}, store, {
    autopilot: { deps, on: true },
    upstream: fal,
  });
};

describe("paid fal tools during a run", () => {
  test("generate_art records each piece's job with its words and charges the run", async () => {
    await begin();
    const mcp = await connect();
    await mcp.callTool({
      arguments: {
        pieces: [
          {
            name: "hero front",
            prompt: "A calico cat at sunset",
            text: ["NEKO CLUB"],
          },
          { name: "sleeve mark", prompt: "A small cat silhouette", text: [] },
        ],
      },
      name: "generate_art",
    });
    const undeclared = await mcp.callTool({
      arguments: {
        pieces: [{ name: "back print", prompt: "A cat silhouette, big" }],
      },
      name: "generate_art",
    });
    await mcp.close();
    expect(undeclared.isError).toBe(true);
    expect(JSON.stringify(undeclared.content)).toContain(
      "declares its printed words"
    );
    const [run] = await store.getAutopilotRuns();
    expect(run?.spentUsd).toBe(0.2);
    expect(run?.art.map((job) => job.text)).toEqual([[], ["NEKO CLUB"], []]);
  });

  test("the agent can't set a design's run or hidden, and a redraw keeps them", async () => {
    const { run } = await begin();
    const {
      approval: _approval,
      quote: _quote,
      range: _range,
      rejectCount: _rejectCount,
      status: _status,
      ...input
    } = demoDesign;
    const mcp = await connect();
    const shown = await mcp.callTool({
      arguments: { ...input, hidden: false, run: "someone-else" },
      name: "show_design_widget",
    });
    const id = designIdOf(shown.structuredContent);
    await mcp.callTool({
      arguments: {
        ...input,
        id,
        listing: { ...input.listing, title: "Redrawn Cat Tee" },
      },
      name: "show_design_widget",
    });
    await mcp.close();
    const saved = await store.requireDesign(id);
    expect(saved).toMatchObject({
      listing: { title: "Redrawn Cat Tee" },
      run: run.id,
    });
    expect(saved.hidden).toBeUndefined();
  });

  test("generate_videos is refused on a run without videos", async () => {
    const { designId } = await begin();
    const mcp = await connect();
    const result = await mcp.callTool({
      arguments: { designId },
      name: "generate_videos",
    });
    await mcp.close();
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("Videos are off");
  });

  test("generate_videos and add_video_audio charge the run before sending", async () => {
    const { designId } = await begin(true);
    const mcp = await connect();
    await mcp.callTool({ arguments: { designId }, name: "generate_videos" });
    const [afterVideos] = await store.getAutopilotRuns();
    expect(afterVideos?.spentUsd).toBeGreaterThan(0);
    await store.recordAdMedia(designId, {
      urls: ["https://v3.fal.media/files/clip.mp4"],
    });
    await mcp.callTool({
      arguments: {
        designId,
        videoUrls: ["https://v3.fal.media/files/clip.mp4"],
      },
      name: "add_video_audio",
    });
    await mcp.close();
    const [afterAudio] = await store.getAutopilotRuns();
    expect(afterAudio?.spentUsd).toBeGreaterThan(afterVideos?.spentUsd ?? 0);
  });
});

test("over MCP, autopilot needs the opt-in and the operator switch", async () => {
  const off = await connectClient({ WOVAIN_AUTOPILOT: "off" }, store);
  const refused = await off.callTool({
    arguments: { idea: "cat tees" },
    name: "autopilot",
  });
  expect(refused.structuredContent).toEqual({ configured: false });
  await off.close();
  const mcp = await connect();
  const notOptedIn = await mcp.callTool({
    arguments: { idea: "cat tees" },
    name: "autopilot",
  });
  expect(notOptedIn.isError).toBe(true);
  expect(JSON.stringify(notOptedIn.content)).toContain("autopilot_opt_in");
  const tools = await mcp.listTools();
  const names = tools.tools.map((tool) => tool.name);
  expect(names).toContain("autopilot_decide");
  expect(names.some((name) => name.includes("approve"))).toBe(false);
  await mcp.close();
});
