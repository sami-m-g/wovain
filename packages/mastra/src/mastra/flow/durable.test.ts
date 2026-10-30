import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { ORPCError } from "@orpc/server";
import { billingCatalog } from "@wovain/billing/catalog";
import { creditBalance, releaseCredits } from "@wovain/billing/credits";
import { applyGrant } from "@wovain/billing/mirror";
import { createBilling } from "@wovain/billing/service";
import { createArtist } from "@wovain/core/fal";
import { fakeAgents, fakeNemotron } from "@wovain/core/test-doubles";
import { createTrends } from "@wovain/core/trends";
import type { ProviderId, ToolCall } from "@wovain/core/upstream";
import type { Database } from "@wovain/db";
import { relations } from "@wovain/db/relations";
import { user } from "@wovain/db/schema/auth";
import { brandProfile, decisionTrace } from "@wovain/db/schema/autonomy";
import { creditGrant, creditReservation } from "@wovain/db/schema/billing";
import { externalWrite } from "@wovain/db/schema/durable";
import {
  campaign,
  connection,
  design,
  directionCache,
  idea,
  product,
  run,
} from "@wovain/db/schema/seller";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { createError, log } from "evlog";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Core } from "../services";
import { createLegacyRunEngine, createRunRouter } from "../workflows/rollout";
import { isPermanent } from "../workflows/run";
import type { Actor, RunEngine } from "./actor";
import {
  compensateRun,
  createDropCampaign,
  createProductCampaign,
} from "./campaigns";
import { listConnections, requireFal, withProvider } from "./connections";
import { decideDesign, generateDesign } from "./designs";
import { cacheKeyOf } from "./drop-directions";
import { researchIdeas } from "./ideas";
import { getInsights, storedAdScores } from "./insights";
import { once } from "./once";
import { previewPlacement } from "./placements";
import { createDesignProduct } from "./products";
import { QLOO_BRAND, qlooAudienceCore } from "./qloo-audience-fixture";
import {
  approvedDesigns,
  approveIdeas,
  awaitApproval,
  eachSettled,
  finishRun,
  startPickedRun,
  startRun,
} from "./runs";
import { transitionErrors } from "./transitions";

// Steps and state transitions of a durable run against real Postgres
// (PGlite, with the app's migrations) and fake provider MCP servers. The
// crash cases replay a step the way Inngest does after an invocation dies.

const MIGRATIONS = fileURLToPath(
  new URL("../../../../db/src/migrations", import.meta.url)
);
const USER_ID = "user_1";
const MERCHANT = "merchant@example.com";

// One provider's MCP server: each tool answers from `replies` (a value or a
// function of the call's args), and every call is recorded.
type Reply = unknown | ((args: Record<string, unknown>) => unknown);
const fakeProvider = (replies: Record<string, Reply>) => {
  const calls: { args: Record<string, unknown>; tool: string }[] = [];
  const call: ToolCall = async (tool, args) => {
    calls.push({ args, tool });
    if (!(tool in replies)) {
      throw new Error(`unexpected tool ${tool}`);
    }
    const reply = replies[tool];
    return await Promise.resolve(
      typeof reply === "function"
        ? (reply as (input: Record<string, unknown>) => unknown)(args)
        : reply
    );
  };
  const count = (tool: string) =>
    calls.filter((item) => item.tool === tool).length;
  return { call, calls, count };
};

// The flags a test turned on; every other flag is off.
const flagsOn = new Set<string>();

const setup = async (providers: Partial<Record<ProviderId, ToolCall>>) => {
  const client = new PGlite();
  const db = drizzle({ client, relations });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  await db.insert(user).values({
    email: MERCHANT,
    emailVerified: true,
    id: USER_ID,
    name: "Merchant",
  });
  // A brand Qloo knows: no campaign stages without its audience.
  await db
    .insert(brandProfile)
    .values({ qlooEntities: [QLOO_BRAND], userId: USER_ID });
  // Enough credits for every paid step the tests run.
  await applyGrant(db as unknown as Database, {
    grantId: "grant_plan",
    periodKey: "2026-10-01T00:00:00Z",
    rollover: false,
    source: "plan",
    units: 1000,
    userId: USER_ID,
  });
  const { ask } = fakeNemotron({
    variants: [
      { angle: "humor", headline: "Not today", message: "For quiet nights." },
      { angle: "gift", headline: "Gift a reader", message: "They'll love it." },
    ],
  });
  const core = {
    defaultCatalogProductId: "pro_default",
    // Every flag off unless a test turns it on (flagsOn).
    flags: {
      isOn: async (name: string) => await Promise.resolve(flagsOn.has(name)),
    },
    nemotron: ask,
    ...qlooAudienceCore,
    upstream: {
      session: async (
        provider: ProviderId,
        _grant: unknown,
        _log: unknown,
        work: (call: ToolCall) => Promise<unknown>
      ) => {
        const call = providers[provider];
        if (call === undefined) {
          throw new Error(`${provider} isn't faked`);
        }
        return await work(call);
      },
    },
  } as unknown as Core;
  const actor: Actor = {
    billing: createBilling({
      BETTER_AUTH_URL: "http://localhost:3000",
      POLAR_ENVIRONMENT: "sandbox",
    }),
    core,
    // PGlite speaks the same SQL as node-postgres; only the client differs.
    db: db as unknown as Database,
    mailer: vi.fn(async () => {
      await Promise.resolve();
    }),
    userId: USER_ID,
  };
  return { actor, db };
};

// A run waiting at its gate, with its idea and pending design.
const seedRun = async (
  db: Awaited<ReturnType<typeof setup>>["db"],
  status: "awaiting_approval" | "running" = "awaiting_approval"
) => {
  const [started] = await db
    .insert(run)
    .values({ seed: "cozy reading", status, step: "approval", userId: USER_ID })
    .returning();
  const [found] = await db
    .insert(idea)
    .values({
      avoidNames: [],
      rank: 1,
      research: {
        answer: "a",
        moment: "m",
        rank: 1,
        score: 80,
        sources: [],
        theme: "Reading cats",
      } as never,
      runId: started?.id ?? null,
      score: 80,
      seed: "cozy reading",
      theme: "Reading cats",
      userId: USER_ID,
    })
    .returning();
  const [drafted] = await db
    .insert(design)
    .values({
      artworkHeight: 2880,
      artworkUrl: "https://v3.fal.media/a.png",
      artworkWidth: 2880,
      brief: {
        artPrompt: "A sleepy cat reading under a lamp",
        description: "Two lines.",
        garmentColors: ["black"],
        printedText: [],
        title: "Reading Cat Tee",
      },
      ideaId: found?.id ?? "",
      judgment: {
        checks: [],
        coach: "Good",
        fixes: [],
        score: 90,
        verdict: "ready",
      },
      runId: started?.id ?? null,
      userId: USER_ID,
    })
    .returning();
  if (started === undefined || drafted === undefined) {
    throw new Error("seed failed");
  }
  return { designId: drafted.id, runId: started.id };
};

const engine = (
  resume: RunEngine["resume"] = vi.fn(),
  approve: RunEngine["approveIdeas"] = vi.fn()
): RunEngine => ({
  approveIdeas: approve,
  resume,
  start: vi.fn(),
});

// A merchant's run waiting at its ideas gate with `count` ideas, nothing
// drawn.
const seedIdeasGate = async (
  db: Awaited<ReturnType<typeof setup>>["db"],
  count: number
) => {
  const [started] = await db
    .insert(run)
    .values({
      seed: "cozy reading",
      status: "awaiting_approval",
      step: "ideas",
      userId: USER_ID,
    })
    .returning();
  if (started === undefined) {
    throw new Error("seed failed");
  }
  const rows = await db
    .insert(idea)
    .values(
      Array.from({ length: count }, (_, index) => ({
        avoidNames: [],
        rank: index + 1,
        research: {
          answer: "a",
          moment: "m",
          rank: index + 1,
          score: 80 - index,
          signals: { marketHits: 0, newsHits: 0 },
          sources: [],
          theme: `Theme ${index + 1}`,
        } as never,
        runId: started.id,
        score: 80 - index,
        seed: "cozy reading",
        theme: `Theme ${index + 1}`,
        userId: USER_ID,
      }))
    )
    .returning();
  return { ideaIds: rows.map((row) => row.id), runId: started.id };
};

describe("once", () => {
  it("sends a write once, and finds what a lost attempt made before sending it again", async () => {
    const { actor, db } = await setup({});
    const perform = vi.fn(async () => await Promise.resolve("obj_1"));
    const write = {
      key: "k:1",
      operation: "create",
      perform,
      provider: "meta" as const,
    };

    expect(await once(actor, write)).toBe("obj_1");
    expect(await once(actor, write)).toBe("obj_1");
    expect(perform).toHaveBeenCalledTimes(1);

    // An attempt that died after the provider answered: pending, no result.
    await db.insert(externalWrite).values({
      key: "k:2",
      operation: "create",
      provider: "meta",
      userId: USER_ID,
    });
    const resend = vi.fn(async () => await Promise.resolve("obj_dup"));
    const found = await once(actor, {
      ...write,
      key: "k:2",
      perform: resend,
      recover: async () => await Promise.resolve("obj_2"),
    });
    expect(found).toBe("obj_2");
    expect(resend).not.toHaveBeenCalled();
  });
});

describe("decideDesign", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup({});
  });

  it("approves a pending design once and resumes its run", async () => {
    const { designId, runId } = await seedRun(ctx.db);
    const resume = vi.fn(async () => {
      await Promise.resolve();
    });
    const actor = { ...ctx.actor, runs: engine(resume) };

    const decided = await decideDesign(actor, designId, {
      approve: true,
      by: "merchant",
    });

    expect(decided.status).toBe("approved");
    expect(resume).toHaveBeenCalledWith(runId, {
      approve: true,
      reason: undefined,
    });
    const [after] = await ctx.db.select().from(run).where(eq(run.id, runId));
    expect(after?.status).toBe("running");
  });

  it("answers a repeat of the same decision without resuming twice", async () => {
    const { designId } = await seedRun(ctx.db);
    const resume = vi.fn(async () => {
      await Promise.resolve();
    });
    const actor = { ...ctx.actor, runs: engine(resume) };
    const first = await decideDesign(actor, designId, {
      approve: true,
      by: "merchant",
    });

    const again = await decideDesign(actor, designId, {
      approve: true,
      by: "merchant",
    });

    expect(again.id).toBe(first.id);
    expect(again.status).toBe("approved");
    expect(resume).toHaveBeenCalledTimes(1);
  });

  it("refuses a conflicting second decision with a typed error", async () => {
    const { designId } = await seedRun(ctx.db);
    const actor = { ...ctx.actor, runs: engine() };
    await decideDesign(actor, designId, { approve: true, by: "merchant" });

    const again = decideDesign(actor, designId, {
      approve: false,
      by: "merchant",
    });

    await expect(again).rejects.toBeInstanceOf(ORPCError);
    const error = await again.catch((error_: unknown) => error_);
    expect(error).toMatchObject({
      code: "DESIGN_ALREADY_DECIDED",
      data: { designId, status: "approved" },
      status: transitionErrors.DESIGN_ALREADY_DECIDED.status,
    });
    const [row] = await ctx.db
      .select()
      .from(design)
      .where(eq(design.id, designId));
    expect(row?.status).toBe("approved");
  });

  it("keeps the design pending when the run can't be resumed", async () => {
    const { designId, runId } = await seedRun(ctx.db);
    const actor = {
      ...ctx.actor,
      runs: engine(async () => {
        await Promise.resolve();
        throw new Error("not suspended yet");
      }),
    };

    await expect(
      decideDesign(actor, designId, { approve: true, by: "merchant" })
    ).rejects.toMatchObject({ code: "RUN_NOT_WAITING", data: { runId } });

    const [row] = await ctx.db
      .select()
      .from(design)
      .where(eq(design.id, designId));
    const [waiting] = await ctx.db.select().from(run).where(eq(run.id, runId));
    expect(row?.status).toBe("pending_approval");
    expect(waiting?.status).toBe("awaiting_approval");
  });
});

// Fourthwall: the blank, the upload route, the preview, the offer.
const fourthwall = (overrides: Record<string, Reply> = {}) => {
  let offers = 0;
  return fakeProvider({
    "confirm-image-upload": { url: "https://cdn.fourthwall.com/u/1.png" },
    "ecommerce_bulk-update-offer-variant-prices": { ok: true },
    "ecommerce_create-offers-from-designs": () => {
      offers += 1;
      return { results: [{ offerId: `off_${offers}` }] };
    },
    "ecommerce_generate-product-design-previews": {
      results: [{ customizationId: "cus_1", images: [] }],
    },
    "ecommerce_get-catalog-products": {
      products: [
        {
          id: "prd_tee",
          name: "Tee",
          printDetails: {
            printAreas: [
              { name: "Front", supportsBackendRendering: true, type: "front" },
            ],
            supportsBackendRendering: true,
          },
          slug: "tee",
        },
      ],
    },
    "ecommerce_get-offers": {
      offers: [{ customizationId: "cus_1", id: "off_1" }],
    },
    "ecommerce_save-media-library-image": {
      uri: "https://cdn.fourthwall.com/m/1.png",
    },
    "request-upload-url": {
      signedUrl: "https://upload.example.com/1",
      uploadId: "up_1",
    },
    ...overrides,
  });
};

describe("createDesignProduct", () => {
  it("makes one Fourthwall product however often the step is retried", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => await Promise.resolve(new Response("png")))
    );
    const shop = fourthwall();
    const ctx = await setup({ fourthwall: shop.call });
    const { designId } = await seedRun(ctx.db);
    await ctx.db
      .update(design)
      .set({ status: "approved" })
      .where(eq(design.id, designId));

    const first = await createDesignProduct(ctx.actor, { designId });
    const second = await createDesignProduct(ctx.actor, { designId });

    expect(second.id).toBe(first.id);
    expect(shop.count("ecommerce_create-offers-from-designs")).toBe(1);
    expect(await ctx.db.select().from(product)).toHaveLength(1);

    // A crash after Fourthwall made the offer but before its answer was
    // saved: the retry finds the offer instead of making a second one.
    await ctx.db.delete(product);
    await ctx.db
      .update(externalWrite)
      .set({ result: null, state: "pending" })
      .where(eq(externalWrite.operation, "create_offer"));
    const replayed = await createDesignProduct(ctx.actor, { designId });

    expect(replayed.offerId).toBe("off_1");
    expect(shop.count("ecommerce_create-offers-from-designs")).toBe(1);
    vi.unstubAllGlobals();
  });
});

const connectFourthwall = async (
  db: Awaited<ReturnType<typeof setup>>["db"]
) => {
  await db.insert(connection).values({
    provider: "fourthwall",
    sealedTokens: "sealed",
    userId: USER_ID,
  });
};

// The seeded run's design, as generateDesign hands it to previewPlacement.
const seededDesign = async (db: Awaited<ReturnType<typeof setup>>["db"]) => {
  const { designId } = await seedRun(db, "running");
  const [row] = await db.select().from(design).where(eq(design.id, designId));
  if (row === undefined) {
    throw new Error("seed failed");
  }
  return row;
};

describe("previewPlacement", () => {
  const MOCKUP = "https://cdn.fourthwall.com/mock/front.png";

  it("saves Fourthwall's mockups of the art on the blank's front, once", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => await Promise.resolve(new Response("png")))
    );
    const shop = fourthwall({
      "ecommerce_generate-product-design-previews": {
        results: [{ customizationId: "cus_1", images: [{ url: MOCKUP }] }],
      },
    });
    const ctx = await setup({ fourthwall: shop.call });
    await connectFourthwall(ctx.db);
    const row = await seededDesign(ctx.db);

    const previewed = await previewPlacement(ctx.actor, row);
    const again = await previewPlacement(ctx.actor, previewed);

    expect(previewed).toMatchObject({
      mockupStatus: "ready",
      mockups: [MOCKUP],
    });
    expect(again.mockups).toEqual([MOCKUP]);
    expect(shop.count("ecommerce_generate-product-design-previews")).toBe(1);
    expect(
      shop.calls.find(
        (item) => item.tool === "ecommerce_generate-product-design-previews"
      )?.args
    ).toEqual({
      products: [
        {
          productId: "prd_tee",
          regionNames: ["front"],
          regionUrls: ["https://cdn.fourthwall.com/m/1.png"],
        },
      ],
    });
    const [saved] = await ctx.db
      .select()
      .from(design)
      .where(eq(design.id, row.id));
    expect(saved?.mockups).toEqual([MOCKUP]);
    vi.unstubAllGlobals();
  });

  it("sells every size and the brief's colors with design-drops on", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => await Promise.resolve(new Response("png")))
    );
    flagsOn.add("design-drops");
    const shop = fourthwall({
      "ecommerce_generate-product-design-previews": {
        results: [{ customizationId: "cus_1", images: [{ url: MOCKUP }] }],
      },
      "ecommerce_get-catalog-product-details": [
        {
          colors: ["White", "Black", "Sand Dune"],
          sizes: ["S", "M", "L", "2XL"],
          slug: "tee",
        },
      ],
    });
    const ctx = await setup({ fourthwall: shop.call });
    await connectFourthwall(ctx.db);
    const row = await seededDesign(ctx.db);

    await previewPlacement(ctx.actor, row);

    expect(
      shop.calls.find(
        (item) => item.tool === "ecommerce_generate-product-design-previews"
      )?.args
    ).toEqual({
      products: [
        {
          colors: ["Black"],
          productId: "prd_tee",
          regionNames: ["front"],
          regionUrls: ["https://cdn.fourthwall.com/m/1.png"],
          sizes: ["S", "M", "L", "2XL"],
        },
      ],
    });
    flagsOn.clear();
    vi.unstubAllGlobals();
  });

  it("logs a failed preview at error level and keeps the design", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => await Promise.resolve(new Response("png")))
    );
    const errorLog = vi.spyOn(log, "error").mockImplementation(() => {});
    const shop = fourthwall({
      "ecommerce_generate-product-design-previews": () => {
        throw new Error("region front not found");
      },
    });
    const ctx = await setup({ fourthwall: shop.call });
    await connectFourthwall(ctx.db);
    const row = await seededDesign(ctx.db);

    const previewed = await previewPlacement(ctx.actor, row);

    expect(previewed).toMatchObject({ mockupStatus: "failed", mockups: [] });
    expect(errorLog).toHaveBeenCalledWith(
      expect.objectContaining({
        design: expect.objectContaining({ id: row.id }),
        error: expect.objectContaining({
          code: "PLACEMENT_PREVIEW_FAILED",
          message: expect.stringContaining("region front not found"),
        }),
      })
    );
    errorLog.mockRestore();
    vi.unstubAllGlobals();
  });

  it("treats a preview with no mockups as failed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => await Promise.resolve(new Response("png")))
    );
    const errorLog = vi.spyOn(log, "error").mockImplementation(() => {});
    const shop = fourthwall();
    const ctx = await setup({ fourthwall: shop.call });
    await connectFourthwall(ctx.db);

    const previewed = await previewPlacement(
      ctx.actor,
      await seededDesign(ctx.db)
    );

    expect(previewed.mockupStatus).toBe("failed");
    expect(errorLog).toHaveBeenCalledTimes(1);
    errorLog.mockRestore();
    vi.unstubAllGlobals();
  });

  it("asks to connect Fourthwall, without calling it, when there is no shop", async () => {
    const shop = fourthwall();
    const ctx = await setup({ fourthwall: shop.call });

    const previewed = await previewPlacement(
      ctx.actor,
      await seededDesign(ctx.db)
    );

    expect(previewed.mockupStatus).toBe("not_connected");
    expect(shop.calls).toHaveLength(0);
  });
});

// Meta: one ad account and Page; creates answer with IDs; the lookup finds
// objects by name, as the real ads_get_ad_entities filter does.
const meta = ({ loseAdSetAnswer }: { loseAdSetAnswer: boolean }) => {
  const made: { id: string; level: string; name: string }[] = [];
  let lost = loseAdSetAnswer;
  const create =
    (level: string, key: string, nameArg: string) =>
    (args: Record<string, unknown>) => {
      const id = `${level}_${made.length + 1}`;
      made.push({ id, level, name: String(args[nameArg]) });
      if (level === "adset" && lost) {
        lost = false;
        // Meta made it, then the connection dropped: the answer is lost.
        throw new Error("socket hang up");
      }
      return { [key]: id };
    };
  const server = fakeProvider({
    ads_create_ad: create("ad", "ad_id", "ad_name"),
    ads_create_ad_set: create("adset", "ad_set_id", "ad_set_name"),
    ads_create_campaign: create("campaign", "campaign_id", "campaign_name"),
    ads_create_creative: create("creative", "creative_id", "name"),
    ads_get_ad_account_pages: { pages: [{ page_id: "p_1" }] },
    ads_get_ad_accounts: {
      ad_accounts: [{ ad_account_id: "222", is_ads_mcp_enabled: true }],
    },
    ads_get_ad_entities: (args: Record<string, unknown>) => ({
      ad_entities: made.filter((item) => item.level === args["level"]),
    }),
    ads_update_entity: { success: true },
  });
  return { ...server, made };
};

const publishedProduct = async (
  db: Awaited<ReturnType<typeof setup>>["db"],
  designId: string
) => {
  const [live] = await db
    .insert(product)
    .values({
      catalogProductId: "prd_tee",
      customizationId: "cus_1",
      designId,
      mediaUri: "https://cdn.fourthwall.com/m/1.png",
      mockups: ["https://cdn.fourthwall.com/mock.png"],
      offerId: "off_1",
      price: 24,
      productUrl: "https://shop.example.com/products/reading-cat",
      status: "public",
      userId: USER_ID,
    })
    .returning();
  return live?.id ?? "";
};

describe("createDropCampaign", () => {
  it("stages a drop's designs as one test campaign, once", async () => {
    const ads = meta({ loseAdSetAnswer: false });
    const ctx = await setup({ meta: ads.call });
    const first = await seedRun(ctx.db, "running");
    const second = await seedRun(ctx.db, "running");
    const productIds = [
      await publishedProduct(ctx.db, first.designId),
      await publishedProduct(ctx.db, second.designId),
    ];
    const input = { countries: ["US"], dailyBudget: 20, productIds };

    const staged = await createDropCampaign(ctx.actor, input);

    const levels = (level: string) =>
      ads.made.filter((item) => item.level === level);
    expect(levels("campaign")).toHaveLength(1);
    expect(levels("adset")).toHaveLength(2);
    expect(levels("ad")).toHaveLength(4);
    const adSets = ads.calls.filter(
      (item) => item.tool === "ads_create_ad_set"
    );
    // Half of $20 split over 2 designs: $5 each.
    expect(adSets.map((item) => item.args["daily_min_spend_target"])).toEqual([
      500, 500,
    ]);
    expect(staged.designs?.map((each) => each.productId)).toEqual(productIds);
    expect(staged.designs?.map((each) => each.adIds.length)).toEqual([2, 2]);
    expect(staged.adIds).toHaveLength(4);

    // The same drop again (a retry, a second click) gets the same row.
    const calls = ads.calls.length;
    const again = await createDropCampaign(ctx.actor, {
      ...input,
      productIds: [...productIds].toReversed(),
    });
    expect(again.id).toBe(staged.id);
    expect(ads.calls).toHaveLength(calls);
    expect(await ctx.db.select().from(campaign)).toHaveLength(1);
  });

  it("keeps one product's campaign as a plain campaign", async () => {
    const ads = meta({ loseAdSetAnswer: false });
    const ctx = await setup({ meta: ads.call });
    const { designId } = await seedRun(ctx.db, "running");
    const productId = await publishedProduct(ctx.db, designId);
    const staged = await createDropCampaign(ctx.actor, {
      countries: ["US"],
      dailyBudget: 15,
      productIds: [productId],
    });
    expect(staged.designs).toBeNull();
    const adSet = ads.calls.find((item) => item.tool === "ads_create_ad_set");
    expect(adSet?.args).not.toHaveProperty("daily_min_spend_target");
    // The same key a product's campaign always had.
    const plain = await createProductCampaign(ctx.actor, {
      countries: ["US"],
      dailyBudget: 15,
      productId,
    });
    expect(plain.id).toBe(staged.id);
  });
});

describe("createProductCampaign", () => {
  it("resumes a staging that crashed after Meta made the ad set, without a second one", async () => {
    const ads = meta({ loseAdSetAnswer: true });
    const ctx = await setup({ meta: ads.call });
    const { designId } = await seedRun(ctx.db, "running");
    const productId = await publishedProduct(ctx.db, designId);
    const input = { countries: ["US"], dailyBudget: 15, productId };

    // The first attempt dies at the ad set; Inngest retries the step.
    await expect(createProductCampaign(ctx.actor, input)).rejects.toThrow(
      "socket hang up"
    );
    const staged = await createProductCampaign(ctx.actor, input);

    const levels = (level: string) =>
      ads.made.filter((item) => item.level === level);
    expect(levels("campaign")).toHaveLength(1);
    expect(levels("adset")).toHaveLength(1);
    expect(levels("ad")).toHaveLength(2);
    expect(staged.adSetId).toBe(levels("adset")[0]?.id);
    expect(staged.metaCampaignId).toBe(levels("campaign")[0]?.id);
    expect(ads.count("ads_create_ad_set")).toBe(1);

    // A later retry (or a second click) gets the same campaign, no calls.
    const calls = ads.calls.length;
    const again = await createProductCampaign(ctx.actor, input);
    expect(again.id).toBe(staged.id);
    expect(ads.calls).toHaveLength(calls);
    expect(await ctx.db.select().from(campaign)).toHaveLength(1);
  });

  it("stages nothing without a Qloo audience, and a retry asks Qloo again", async () => {
    const ads = meta({ loseAdSetAnswer: false });
    const ctx = await setup({ meta: ads.call });
    const { designId } = await seedRun(ctx.db, "running");
    const productId = await publishedProduct(ctx.db, designId);
    const input = { countries: ["US"], dailyBudget: 15, productId };
    let qlooUp = false;
    ctx.actor.core = {
      ...ctx.actor.core,
      qloo: {
        ...qlooAudienceCore.qloo,
        audienceAffinity: async (audienceId: string) => {
          if (!qlooUp) {
            throw new Error("Qloo answered 503");
          }
          return await qlooAudienceCore.qloo.audienceAffinity(audienceId);
        },
      },
    } as unknown as Core;

    await expect(createProductCampaign(ctx.actor, input)).rejects.toMatchObject(
      {
        code: "QLOO_AUDIENCE_MISSING",
        data: { reason: "failed" },
      }
    );
    expect(ads.calls).toHaveLength(0);
    expect(await ctx.db.select().from(campaign)).toHaveLength(0);

    qlooUp = true;
    const staged = await createProductCampaign(ctx.actor, input);
    const adSet = ads.calls.find((item) => item.tool === "ads_create_ad_set");
    expect(String(adSet?.args["ad_set_name"])).toContain("qloo");
    expect(staged.adSetId).toBeTruthy();
  });

  it("refuses a brand Qloo has no audience for with the fix", async () => {
    const ads = meta({ loseAdSetAnswer: false });
    const ctx = await setup({ meta: ads.call });
    await ctx.db
      .update(brandProfile)
      .set({ qlooEntities: [] })
      .where(eq(brandProfile.userId, USER_ID));
    const { designId } = await seedRun(ctx.db, "running");
    const productId = await publishedProduct(ctx.db, designId);

    await expect(
      createProductCampaign(ctx.actor, {
        countries: ["US"],
        dailyBudget: 15,
        productId,
      })
    ).rejects.toMatchObject({
      code: "QLOO_AUDIENCE_MISSING",
      data: { fix: expect.stringContaining("brand"), reason: "no_audience" },
    });
    expect(ads.calls).toHaveLength(0);
  });

  it("targets the ad set with Qloo's audience and saves the trace", async () => {
    const ads = meta({ loseAdSetAnswer: false });
    const ctx = await setup({ meta: ads.call });
    const { designId, runId } = await seedRun(ctx.db, "running");
    const productId = await publishedProduct(ctx.db, designId);
    const search = vi.fn(
      async (query: string) =>
        await Promise.resolve(
          query === "Sneakers"
            ? [{ id: "6003000000010", name: "Sneakers", path: [] }]
            : []
        )
    );
    ctx.actor.core = {
      ...ctx.actor.core,
      metaInterests: { search },
      qloo: {
        audienceAffinity: async (audienceId: string) =>
          await Promise.resolve(
            audienceId.endsWith("sneakerheads") ? [0.95] : [0.765]
          ),
        demographicsOf: async () =>
          await Promise.resolve([
            {
              age: { "24_and_younger": 0.3, "25_to_29": 0.1 },
              gender: { female: -0.2, male: 0.2 },
              id: "B1",
            },
          ]),
        searchEntities: async () => await Promise.resolve([]),
      },
    } as unknown as Core;

    await createProductCampaign(ctx.actor, {
      countries: ["US"],
      dailyBudget: 15,
      productId,
    });

    const adSet = ads.calls.find((item) => item.tool === "ads_create_ad_set");
    expect(JSON.parse(String(adSet?.args["targeting"]))).toEqual({
      age_max: 29,
      age_min: 18,
      flexible_spec: [
        { interests: [{ id: "6003000000010", name: "Sneakers" }] },
      ],
      genders: [1],
      geo_locations: { countries: ["US"] },
    });
    const steps = await ctx.db
      .select()
      .from(decisionTrace)
      .where(eq(decisionTrace.runId, runId));
    expect(steps.map((row) => row.step)).toEqual(
      expect.arrayContaining(["qloo.demographics", "meta.targeting"])
    );
  });

  it("archives a half-staged campaign when the run fails for good", async () => {
    const ads = meta({ loseAdSetAnswer: false });
    const ctx = await setup({ meta: ads.call });
    const { designId, runId } = await seedRun(ctx.db, "running");
    const productId = await publishedProduct(ctx.db, designId);
    // The campaign was made; the step died before the ad set.
    await ctx.db.insert(externalWrite).values({
      key: `campaign:${USER_ID}:${productId}:meta:campaign@222`,
      operation: "campaign@222",
      provider: "meta",
      result: "campaign_9",
      runId,
      state: "done",
      userId: USER_ID,
    });

    await finishRun(ctx.actor, runId, {
      error: "Meta kept failing",
      status: "failed",
    });

    const archive = ads.calls.find((item) => item.tool === "ads_update_entity");
    expect(archive?.args).toMatchObject({
      ad_account_id: "222",
      entity_id: "campaign_9",
      fields: JSON.stringify({ status: "ARCHIVED" }),
    });
    expect(await compensateRun(ctx.actor, runId)).toEqual([]);
    const [ended] = await ctx.db.select().from(run).where(eq(run.id, runId));
    expect(ended?.status).toBe("failed");
  });
});

// With model routing on, staging scores the copy with the ad judges and the
// insights page reads the score back (./campaigns adScoreKey, ./insights
// storedAdScores). Without it, or when scoring fails, the campaign is
// staged and shows unscored.
describe("ad scores on insights", () => {
  const copy = [
    { angle: "humor", headline: "Not today", message: "For quiet nights." },
    { angle: "gift", headline: "Gift a reader", message: "They'll love it." },
  ];
  const pass = { critique: "Clear and honest.", result: "Pass" };
  const fail = { critique: "Vague angle.", result: "Fail" };

  const stage = async ({
    judge,
    routed,
  }: {
    judge: readonly unknown[];
    routed: boolean;
  }) => {
    const ads = meta({ loseAdSetAnswer: false });
    const ctx = await setup({ meta: ads.call });
    const agents = fakeAgents({
      ad_copy: [{ variants: copy }],
      ad_judge: judge,
    });
    ctx.actor.core = {
      ...ctx.actor.core,
      flags: {
        isOn: async (name: string) =>
          await Promise.resolve(routed && name === "model-routing"),
      },
      nemotron: agents.ask,
    } as unknown as Core;
    const { designId } = await seedRun(ctx.db, "running");
    const productId = await publishedProduct(ctx.db, designId);
    const staged = await createProductCampaign(ctx.actor, {
      countries: ["US"],
      dailyBudget: 15,
      productId,
    });
    return { agents, ctx, staged };
  };

  it("shows the ad judges' score for a campaign staged with routing on", async () => {
    // Two variants, two judges each: 3 of 4 verdicts pass.
    const { agents, ctx, staged } = await stage({
      judge: [pass, pass, pass, fail],
      routed: true,
    });
    expect(
      agents.asked.filter((call) => call.name === "ad_judge")
    ).toHaveLength(4);

    const insights = await getInsights(ctx.actor, "28d");
    expect(insights.scoring.ads).toBe("ready");
    expect(insights.drops[0]?.campaigns).toBe(1);
    expect(insights.drops[0]?.adScore).toBe(75);
    const scores = await storedAdScores.adScores(ctx.actor, [staged.id]);
    expect(scores.get(staged.id)).toBe(75);
  });

  it("leaves a campaign staged with routing off unscored", async () => {
    const { agents, ctx } = await stage({ judge: [pass], routed: false });
    expect(agents.asked.map((call) => call.name)).toEqual(["ad_copy"]);

    const insights = await getInsights(ctx.actor, "28d");
    expect(insights.scoring.ads).toBe("pending");
    expect(insights.drops[0]?.campaigns).toBe(1);
    expect(insights.drops[0]?.adScore).toBeUndefined();
  });

  it("stages the campaign and logs AD_SCORE_FAILED when scoring fails", async () => {
    const errorLog = vi.spyOn(log, "error").mockImplementation(() => {});
    // No ad_judge reply: every judge call throws.
    const { ctx, staged } = await stage({ judge: [], routed: true });
    expect(staged.metaCampaignId).toBeTruthy();
    expect(errorLog).toHaveBeenCalledWith(
      expect.objectContaining({ error: "AD_SCORE_FAILED" })
    );
    errorLog.mockRestore();

    const insights = await getInsights(ctx.actor, "28d");
    expect(insights.scoring.ads).toBe("pending");
    expect(insights.drops[0]?.adScore).toBeUndefined();
  });
});

describe("finishRun", () => {
  it("ends an active run once, and reports it", async () => {
    const ctx = await setup({});
    const capture = vi.fn(async () => {
      await Promise.resolve();
    });
    const actor = {
      ...ctx.actor,
      analytics: { capture },
    };
    const { runId } = await seedRun(ctx.db, "running");

    await finishRun(actor, runId, { status: "completed" });
    await finishRun(actor, runId, { error: "late", status: "failed" });

    const [ended] = await ctx.db.select().from(run).where(eq(run.id, runId));
    expect(ended?.status).toBe("completed");
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "run_completed",
        properties: expect.objectContaining({ design_count: 1, run_id: runId }),
      })
    );
    expect(actor.mailer).toHaveBeenCalledTimes(1);
  });

  it("logs a failed run at error level with its provider and their words", async () => {
    const ctx = await setup({});
    const errorLog = vi.spyOn(log, "error").mockImplementation(() => {});
    const { runId } = await seedRun(ctx.db, "running");
    const cause = createError({
      code: "FAL_FAILED",
      message: "fal submit_job failed: 401 token expired",
      status: 502,
      why: "401 token expired",
    });

    await finishRun(ctx.actor, runId, {
      cause,
      error: cause.message,
      status: "failed",
    });

    expect(errorLog).toHaveBeenCalledTimes(1);
    expect(errorLog).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: "FAL_FAILED",
          message:
            "Run failed during approval: fal submit_job failed: 401 token expired",
        }),
        run: expect.objectContaining({
          id: runId,
          provider: "fal",
          provider_status: 502,
          step: "approval",
          why: "401 token expired",
        }),
        userId: USER_ID,
      })
    );
    errorLog.mockRestore();
  });
});

// A run's item that fails for "b" only.
const failsOnB = async (item: string) => {
  await Promise.resolve();
  if (item === "b") {
    throw new Error("fal timed out");
  }
  return item.toUpperCase();
};

// Another pending design in the same run, as the run draws for each top idea.
const addDesign = async (
  db: Awaited<ReturnType<typeof setup>>["db"],
  designId: string
) => {
  const [first] = await db.select().from(design).where(eq(design.id, designId));
  if (first === undefined) {
    throw new Error("seed failed");
  }
  const { createdAt: _created, id: _id, ...copy } = first;
  const [added] = await db
    .insert(design)
    .values({ ...copy, status: "pending_approval" })
    .returning();
  return added?.id ?? "";
};

describe("several designs per run", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup({});
  });

  it("waits at the gate until every design is decided, then resumes once", async () => {
    const { designId, runId } = await seedRun(ctx.db);
    const second = await addDesign(ctx.db, designId);
    const third = await addDesign(ctx.db, designId);
    const resume = vi.fn(async () => {
      await Promise.resolve();
    });
    const actor = { ...ctx.actor, runs: engine(resume) };

    await decideDesign(actor, designId, { approve: true, by: "merchant" });
    await decideDesign(actor, second, { approve: true, by: "merchant" });
    expect(resume).not.toHaveBeenCalled();
    const [waiting] = await ctx.db.select().from(run).where(eq(run.id, runId));
    expect(waiting?.status).toBe("awaiting_approval");

    // Rejecting the last one opens the gate: the run goes on with the two
    // approved designs.
    await decideDesign(actor, third, {
      approve: false,
      by: "merchant",
      reason: "too busy",
    });
    expect(resume).toHaveBeenCalledTimes(1);
    expect(resume).toHaveBeenCalledWith(runId, {
      approve: true,
      reason: "too busy",
    });
    const [after] = await ctx.db.select().from(run).where(eq(run.id, runId));
    expect(after).toMatchObject({ status: "running", step: "approved" });
    expect(await approvedDesigns(ctx.actor, runId)).toEqual([designId, second]);
  });

  it("resumes once when the last two calls land together", async () => {
    const { designId, runId } = await seedRun(ctx.db);
    const second = await addDesign(ctx.db, designId);
    const resume = vi.fn(async () => {
      await Promise.resolve();
    });
    const actor = { ...ctx.actor, runs: engine(resume) };

    await Promise.all([
      decideDesign(actor, designId, { approve: false, by: "merchant" }),
      decideDesign(actor, second, { approve: false, by: "merchant" }),
    ]);

    expect(resume).toHaveBeenCalledTimes(1);
    expect(resume).toHaveBeenCalledWith(runId, {
      approve: false,
      reason: undefined,
    });
    expect(await approvedDesigns(ctx.actor, runId)).toEqual([]);
  });

  it("opens the gate at once when every design was decided before it", async () => {
    const { designId, runId } = await seedRun(ctx.db, "running");
    const second = await addDesign(ctx.db, designId);

    expect(await awaitApproval(ctx.actor, runId)).toBe(true);
    await ctx.db
      .update(design)
      .set({ status: "approved" })
      .where(eq(design.id, designId));
    await ctx.db
      .update(design)
      .set({ status: "rejected" })
      .where(eq(design.id, second));

    expect(await awaitApproval(ctx.actor, runId)).toBe(false);
    const [row] = await ctx.db.select().from(run).where(eq(run.id, runId));
    expect(row?.status).toBe("running");
  });

  it("keeps the items that worked when one fails, and fails only when all do", async () => {
    const logged = vi.spyOn(log, "error").mockImplementation(() => {});
    const work = failsOnB;

    expect(await eachSettled("run_1", "design", ["a", "b", "c"], work)).toEqual(
      ["A", "C"]
    );
    expect(logged).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "RUN_ITEM_FAILED",
        run: expect.objectContaining({ item: "b", stage: "design" }),
      })
    );
    await expect(eachSettled("run_1", "design", ["b"], work)).rejects.toThrow(
      "fal timed out"
    );
    expect(await eachSettled("run_1", "design", [], work)).toEqual([]);
    logged.mockRestore();
  });
});

describe("ideas gate", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup({});
  });

  const designCount = async (runId: string) => {
    const rows = await ctx.db
      .select()
      .from(design)
      .where(eq(design.runId, runId));
    return rows.length;
  };

  it("draws only the ideas the merchant approved, once", async () => {
    const { ideaIds, runId } = await seedIdeasGate(ctx.db, 5);
    const approve = vi.fn(async () => {
      await Promise.resolve();
    });
    const actor = { ...ctx.actor, runs: engine(vi.fn(), approve) };
    const [first, , third] = ideaIds;
    const chosen = [first ?? "", third ?? ""];

    await approveIdeas(actor, runId, [...chosen, first ?? ""]);

    expect(approve).toHaveBeenCalledTimes(1);
    expect(approve).toHaveBeenCalledWith(runId, chosen);
    const [after] = await ctx.db.select().from(run).where(eq(run.id, runId));
    expect(after).toMatchObject({ status: "running", step: "design" });

    // A second click finds the run no longer waiting for ideas.
    await expect(approveIdeas(actor, runId, chosen)).rejects.toMatchObject({
      code: "RUN_NOT_AT_IDEAS",
      data: { runId },
      status: transitionErrors.RUN_NOT_AT_IDEAS.status,
    });
    expect(approve).toHaveBeenCalledTimes(1);
  });

  it("Make designs draws a Home pick waiting at its designs step, once", async () => {
    const { ideaIds, runId } = await seedIdeasGate(ctx.db, 1);
    await ctx.db.update(run).set({ step: "design" }).where(eq(run.id, runId));
    const approve = vi.fn(async () => {
      await Promise.resolve();
    });
    const actor = { ...ctx.actor, runs: engine(vi.fn(), approve) };

    await approveIdeas(actor, runId, ideaIds);

    expect(approve).toHaveBeenCalledWith(runId, ideaIds);
    const [after] = await ctx.db.select().from(run).where(eq(run.id, runId));
    expect(after).toMatchObject({ status: "running", step: "design" });
    await expect(approveIdeas(actor, runId, ideaIds)).rejects.toMatchObject({
      code: "RUN_NOT_AT_IDEAS",
    });
  });

  it("puts a Home pick back at its designs step when the resume fails", async () => {
    const { ideaIds, runId } = await seedIdeasGate(ctx.db, 1);
    await ctx.db.update(run).set({ step: "design" }).where(eq(run.id, runId));
    const approve = vi.fn(async () => {
      await Promise.reject(new Error("Inngest down"));
    });
    const actor = { ...ctx.actor, runs: engine(vi.fn(), approve) };

    await expect(approveIdeas(actor, runId, ideaIds)).rejects.toMatchObject({
      code: "RUN_NOT_WAITING",
    });
    const [after] = await ctx.db.select().from(run).where(eq(run.id, runId));
    expect(after).toMatchObject({
      status: "awaiting_approval",
      step: "design",
    });
  });

  it("refuses an idea from another run before the run moves", async () => {
    const { runId } = await seedIdeasGate(ctx.db, 2);
    const other = await seedIdeasGate(ctx.db, 1);
    const approve = vi.fn();
    const actor = { ...ctx.actor, runs: engine(vi.fn(), approve) };

    await expect(
      approveIdeas(actor, runId, other.ideaIds)
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(approve).not.toHaveBeenCalled();
    const [row] = await ctx.db.select().from(run).where(eq(run.id, runId));
    expect(row).toMatchObject({ status: "awaiting_approval", step: "ideas" });
  });

  it("waits at the ideas gate again when the run can't be resumed", async () => {
    const { ideaIds, runId } = await seedIdeasGate(ctx.db, 2);
    const actor = {
      ...ctx.actor,
      runs: engine(vi.fn(), async () => {
        await Promise.resolve();
        throw new Error("not suspended yet");
      }),
    };

    await expect(approveIdeas(actor, runId, ideaIds)).rejects.toMatchObject({
      code: "RUN_NOT_WAITING",
      data: { runId },
    });

    const [row] = await ctx.db.select().from(run).where(eq(run.id, runId));
    expect(row).toMatchObject({ status: "awaiting_approval", step: "ideas" });
  });

  it("never opens the design gate while the run waits for ideas", async () => {
    const { designId, runId } = await seedRun(ctx.db);
    await ctx.db.update(run).set({ step: "ideas" }).where(eq(run.id, runId));
    const resume = vi.fn();
    const actor = { ...ctx.actor, runs: engine(resume) };

    await decideDesign(actor, designId, { approve: true, by: "merchant" });

    expect(resume).not.toHaveBeenCalled();
    const [row] = await ctx.db.select().from(run).where(eq(run.id, runId));
    expect(row).toMatchObject({ status: "awaiting_approval", step: "ideas" });
  });

  it("stops a legacy manual run after research with nothing drawn", async () => {
    const { runId } = await seedIdeasGate(ctx.db, 3);
    await ctx.db
      .update(run)
      .set({ status: "running", step: null })
      .where(eq(run.id, runId));
    const { db, ...services } = ctx.actor;
    const legacy = createLegacyRunEngine({ ...services, db });

    await legacy.start({
      input: {
        autopilot: false,
        countries: ["US"],
        dailyBudget: 15,
        seed: "cozy reading",
      },
      runId,
      userId: USER_ID,
    });

    const [row] = await ctx.db.select().from(run).where(eq(run.id, runId));
    expect(row).toMatchObject({ status: "awaiting_approval", step: "ideas" });
    expect(await designCount(runId)).toBe(0);
  });
});

describe("mastra-runs rollout", () => {
  it("starts on the flagged engine and resumes on the one the run started on", async () => {
    const ctx = await setup({});
    const { runId } = await seedRun(ctx.db, "running");
    const mastra = engine();
    const legacy = engine();
    let flagOn = true;
    const router = createRunRouter({
      db: ctx.actor.db,
      legacy,
      mastra,
      mastraFor: async () => await Promise.resolve(flagOn),
    });
    const input = {
      autopilot: false,
      countries: ["US"],
      dailyBudget: 15,
      seed: "cozy reading",
    };

    await router.start({ input, runId, userId: USER_ID });
    // The flag flips off while the run waits at its gate.
    flagOn = false;
    await router.resume(runId, { approve: true });

    expect(mastra.start).toHaveBeenCalledTimes(1);
    expect(mastra.resume).toHaveBeenCalledWith(runId, { approve: true });
    expect(legacy.start).not.toHaveBeenCalled();
    expect(legacy.resume).not.toHaveBeenCalled();
    const [row] = await ctx.db.select().from(run).where(eq(run.id, runId));
    expect(row?.engine).toBe("mastra");
  });
});

const draftOf = (title: string, artPrompt: string) => ({
  artPrompt,
  description: "For quiet nights in. Soft lines.",
  garmentColors: ["black", "sand"],
  printedText: [] as string[],
  title,
});

// What the vision model sees: a cat (passes) or a pink T-shirt (fails).
const sight = (cat: boolean) => ({
  background: { note: "Stands alone.", pass: true },
  contrast: [
    { color: "black", note: "Shows.", visible: true },
    { color: "sand", note: "Shows.", visible: true },
  ],
  garment: { note: cat ? "A cat." : "A pink T-shirt.", pass: cat },
  printedText: { note: "None, as asked.", pass: true },
  read: [] as string[],
  subject: cat ? "A cat reading." : "A pink cropped tee.",
});

// A cat that prints the brief's words, read back as printed.
const printing = (text: string) => ({
  ...sight(true),
  printedText: { note: "As asked.", pass: true },
  read: [text],
});

describe("generateDesign", () => {
  const tee = draftOf(
    "Y2K Cropped Tee Shirt",
    "A simple line drawing of a pink cropped tee silhouette, transparent background"
  );
  const cat = draftOf(
    "Reading Cat Tee",
    "A sleepy cat reading under a lamp, cream lines, transparent background"
  );
  const verdict = {
    checks: [
      { note: "Keyword first.", pass: true, rule: "title" },
      { note: "Two lines.", pass: true, rule: "description" },
      { note: "On idea.", pass: true, rule: "idea_fit" },
      { note: "Original.", pass: true, rule: "originality" },
    ],
    coach: "Ready.",
    fixes: ["Draw a subject, not a shirt."],
    score: 80,
  };

  const draw = async (
    sights: ReturnType<typeof sight>[],
    {
      briefs = [tee, cat],
      tavily,
    }: {
      briefs?: ReturnType<typeof draftOf>[];
      // With Tavily, tavily-evidence is on and the trademark check runs.
      tavily?: Pick<Core["tavily"], "search">;
    } = {}
  ) => {
    const fal = fakeProvider({
      check_job: { status: "COMPLETED" },
      get_job_result: ({ request_id }: Record<string, unknown>) => ({
        images: [
          {
            height: 2880,
            url: `https://v3.fal.media/${String(request_id)}.png`,
            width: 2880,
          },
        ],
      }),
      // The call is recorded before it answers: the count includes it.
      submit_job: () => ({ request_id: `req_${fal.count("submit_job")}` }),
    });
    const ctx = await setup({ fal: fal.call });
    await ctx.db.insert(connection).values({
      provider: "fal",
      sealedTokens: "sealed",
      userId: USER_ID,
    });
    const { designId: _seeded, runId } = await seedRun(ctx.db, "running");
    const [source] = await ctx.db
      .select({ id: idea.id })
      .from(idea)
      .where(eq(idea.runId, runId));
    const agents = fakeAgents({
      design_brief: briefs,
      design_judge: [verdict],
      design_vision: sights,
    });
    const actor: Actor = {
      ...ctx.actor,
      core: {
        ...ctx.actor.core,
        ...(tavily !== undefined && {
          flags: {
            isOn: async (flag: string) =>
              await Promise.resolve(flag === "tavily-evidence"),
          },
          tavily,
        }),
        artist: (call: ToolCall) =>
          createArtist(call, {
            model: "test/text-to-image",
            wait: async () => {
              await Promise.resolve();
            },
          }),
        nemotron: agents.ask,
      } as unknown as Core,
    };
    const made = await generateDesign(actor, source?.id ?? "");
    const charged = await ctx.db
      .select()
      .from(creditReservation)
      .where(eq(creditReservation.step, "design"));
    return { agents, charged, fal, made };
  };

  it("redraws a design the judge sent back, once and uncharged", async () => {
    const { agents, charged, fal, made } = await draw([
      sight(false),
      sight(true),
    ]);

    expect(made.brief.title).toBe("Reading Cat Tee");
    expect(made.judgment.verdict).toBe("ready");
    expect(made.artworkUrl).toBe("https://v3.fal.media/req_2.png");
    expect(fal.count("submit_job")).toBe(2);
    expect(charged).toHaveLength(1);
    // The redraw's brief is written from the judge's failed checks.
    const briefs = agents.asked.filter((call) => call.name === "design_brief");
    expect(briefs[1]?.prompt).toContain('"previous"');
    expect(briefs[1]?.prompt).toContain("A pink T-shirt.");
  });

  it("sends back printed words that match a trademark record", async () => {
    const search = vi.fn(async (query: string) => {
      const marked = query.includes("Night Shift Crew");
      return await Promise.resolve({
        images: [],
        query,
        requestId: "t1",
        responseTime: 0.1,
        results: marked
          ? [
              {
                content: "",
                id: "1",
                publishedDate: "",
                score: 0.9,
                title: "NIGHT SHIFT CREW Trademark of Acme",
                url: "https://www.trademarkia.com/night-shift-crew-1",
              },
            ]
          : [],
      });
    });
    const { agents, made } = await draw(
      [printing("Night Shift Crew"), printing("Lamp Light Reader")],
      {
        briefs: [
          { ...cat, printedText: ["Night Shift Crew"] },
          { ...cat, printedText: ["Lamp Light Reader"] },
        ],
        tavily: { search },
      }
    );

    expect(search).toHaveBeenCalledTimes(2);
    expect(search.mock.calls[0]?.[0]).toBe('"Night Shift Crew" trademark');
    // The redraw's brief is told the words are someone's mark.
    const briefs = agents.asked.filter((call) => call.name === "design_brief");
    expect(briefs[1]?.prompt).toContain("trademarkia.com");
    expect(made.brief.printedText).toEqual(["Lamp Light Reader"]);
    expect(made.judgment.verdict).toBe("ready");
    expect(made.judgment.trademark?.pass).toBe(true);
  });

  it("holds a design whose words it couldn't check, without a redraw", async () => {
    const search = vi.fn(async () => {
      await Promise.resolve();
      throw new Error("432 out of credits");
    });
    const { fal, made } = await draw([printing("Night Shift Crew")], {
      briefs: [{ ...cat, printedText: ["Night Shift Crew"] }],
      tavily: { search },
    });

    // fal draws once: a redraw can't check the words either.
    expect(fal.count("submit_job")).toBe(1);
    expect(made.status).toBe("pending_approval");
    expect(made.judgment.verdict).toBe("revise");
    expect(made.judgment.trademark?.checks[0]?.verdict).toBe("unchecked");
  });

  it("saves a redraw still sent back, pending and flagged revise", async () => {
    const { fal, made } = await draw([sight(false), sight(false)]);

    expect(made.status).toBe("pending_approval");
    expect(made.judgment.verdict).toBe("revise");
    expect(fal.count("submit_job")).toBe(2);
  });
});

describe("step retries", () => {
  it("fails a step at once on a 4xx and retries anything else", () => {
    expect(isPermanent({ status: 409 })).toBe(true);
    expect(isPermanent({ status: 502 })).toBe(false);
    expect(isPermanent(new Error("socket hang up"))).toBe(false);
  });
});

describe("fal connection", () => {
  it("is required before a run draws", async () => {
    const { actor, db } = await setup({});

    await expect(requireFal(actor)).rejects.toMatchObject({
      code: "FAL_NOT_CONNECTED",
    });
    await db.insert(connection).values({
      provider: "fal",
      sealedTokens: "sealed",
      userId: USER_ID,
    });
    await expect(requireFal(actor)).resolves.toBeUndefined();
  });

  it("asks to reconnect once its grant expired for good", async () => {
    const { actor, db } = await setup({ fal: fakeProvider({}).call });
    await db.insert(connection).values({
      needsReconnect: true,
      provider: "fal",
      sealedTokens: "sealed",
      userId: USER_ID,
    });

    await expect(requireFal(actor)).rejects.toMatchObject({
      code: "FAL_RECONNECT_NEEDED",
      message: "Reconnect fal: its sign-in expired",
    });
    await expect(
      withProvider(actor, "fal", async () => await Promise.resolve("drew"))
    ).rejects.toMatchObject({ code: "FAL_RECONNECT_NEEDED", status: 409 });
    await expect(listConnections(actor)).resolves.toEqual([
      expect.objectContaining({ needsReconnect: true, provider: "fal" }),
    ]);
  });
});

// A merchant with fal connected and a run engine that only records starts.
const withFal = async () => {
  const { actor, db } = await setup({});
  await db.insert(connection).values({
    provider: "fal",
    sealedTokens: "sealed",
    userId: USER_ID,
  });
  const runs = engine();
  return { actor: { ...actor, runs }, db, runs };
};

describe("startRun", () => {
  const input = {
    autopilot: false,
    countries: ["US"],
    dailyBudget: 5,
    seed: "cozy reading",
  };

  it("starts a run while trends-qloo is on", async () => {
    flagsOn.add("trends-qloo");
    const { actor, runs } = await withFal();

    const started = await startRun(actor, input);

    expect(started.status).toBe("running");
    expect(runs.start).toHaveBeenCalledWith(
      expect.objectContaining({ input, runId: started.id })
    );
    flagsOn.clear();
  });

  it("refuses to start, saving nothing, when the trends-qloo kill switch is off", async () => {
    const { actor, db, runs } = await withFal();

    await expect(startRun(actor, input)).rejects.toMatchObject({
      code: "QLOO_OFF",
      status: 503,
    });
    expect(runs.start).not.toHaveBeenCalled();
    expect(await db.select().from(run)).toEqual([]);
  });

  it("refuses research too when trends-qloo is off", async () => {
    const { actor } = await withFal();

    await expect(researchIdeas(actor, "cozy reading")).rejects.toMatchObject({
      code: "QLOO_OFF",
    });
  });

  it("answers QLOO_NO_MATCH, and keeps the credits, when Qloo knows nothing in the seed", async () => {
    flagsOn.add("trends-qloo");
    flagsOn.add("trends-tavily");
    const { actor, db } = await setup({});
    actor.core = {
      ...actor.core,
      trends: createTrends(
        { extract: vi.fn(), search: vi.fn() },
        {
          tasteOf: async () => await Promise.resolve({ names: [], themes: [] }),
        }
      ),
    } as unknown as Core;

    await expect(researchIdeas(actor, "asdf qwerty")).rejects.toMatchObject({
      code: "QLOO_NO_MATCH",
      message:
        "Qloo found no audience for this brief; try naming a band, film, brand or place",
      status: 422,
    });
    expect(
      await db
        .select()
        .from(creditReservation)
        .where(eq(creditReservation.status, "settled"))
    ).toEqual([]);
    flagsOn.clear();
  });

  // QA #232: "Research found no ideas" kept 3 credits a run (25 to 19).
  it("gives the credits back, once, when research finds no ideas", async () => {
    flagsOn.add("trends-qloo");
    flagsOn.add("trends-tavily");
    const { actor, db } = await setup({});
    const before = await creditBalance(actor.db, USER_ID);
    actor.core = {
      ...actor.core,
      trends: {
        research: async () =>
          await Promise.resolve({ avoidNames: [], ideas: [] }),
      },
    } as unknown as Core;
    const [started] = await db
      .insert(run)
      .values({ seed: "Studio Ghibli", status: "running", userId: USER_ID })
      .returning();

    await expect(
      researchIdeas(actor, "Studio Ghibli", started?.id)
    ).resolves.toEqual([]);
    const [held] = await db.select().from(creditReservation);
    expect(held?.status).toBe("released");
    expect(await releaseCredits(actor.db, held?.id ?? "")).toBe(0);
    expect(await creditBalance(actor.db, USER_ID)).toEqual(before);
    flagsOn.clear();
  });
});

describe("startPickedRun", () => {
  const picked = {
    brief: "Moth and moon line-art crest tee for night-owl readers",
    buyer: "for night-owl readers",
    card: {
      make: {
        status: "ok",
        value: {
          brief: "Moth and moon line-art crest tee for night-owl readers",
          concept: "Moth and moon line-art crest tee for night-owl readers",
          products: ["t-shirt"],
          style: "line art",
          title: "Moth and moon crest",
        },
      },
    },
    evidence: {
      demand: { proven: true, score: 0.6 },
      momentum: { hits: 3, sources: [] },
      qlooAffinity: 0.7,
      rising: [{ id: "Q9", name: "Bauhaus" }],
      saturation: { count: 2, level: "low" },
    },
    key: "d0",
    occasion: "identity tee",
    qlooTag: "urn:tag:genre:media:gothic_romance",
    score: 0.4,
    theme: "Gothic romance",
    title: "Moth and moon crest",
    whyNow: "Gothic romance news rose this month.",
  };
  const pick = {
    ignoreBrand: false,
    key: "d0",
    round: 0,
    theme: "Gothic romance",
  };

  // The kept answer the Home showed, under the key the merchant's request
  // reads.
  const keep = async (db: Awaited<ReturnType<typeof setup>>["db"]) => {
    const [brand] = await db
      .select({
        demographics: brandProfile.demographics,
        niches: brandProfile.niches,
        qlooEntities: brandProfile.qlooEntities,
        voice: brandProfile.voice,
      })
      .from(brandProfile);
    await db.insert(directionCache).values({
      key: cacheKeyOf(pick, brand, "en"),
      payload: {
        directions: [picked],
        hasBrand: true,
        scope: "brand",
        tavilyFailed: false,
      } as never,
      userId: USER_ID,
    });
  };

  it("saves the picked idea, opens the run at its designs and charges research once", async () => {
    flagsOn.add("drop-directions");
    const { actor, db, runs } = await withFal();
    await keep(db);
    const before = await creditBalance(actor.db, USER_ID);

    const started = await startPickedRun(actor, {
      countries: ["US"],
      dailyBudget: 5,
      pick,
    });

    expect(started.step).toBe("design");
    expect(started.seed).toBe(picked.brief);
    const [saved] = started.ideas;
    expect(saved?.research.qlooTag).toBe("urn:tag:genre:media:gothic_romance");
    expect(saved?.research.words).toMatchObject({
      status: "ok",
      title: "Moth and moon crest",
    });
    expect(saved?.avoidNames).toEqual(["Bauhaus"]);
    expect(runs.start).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ pick: { ideaId: saved?.id } }),
        runId: started.id,
      })
    );
    const [held] = await db.select().from(creditReservation);
    expect(held).toMatchObject({ status: "settled", step: "research" });
    const after = await creditBalance(actor.db, USER_ID);
    expect(after.available).toBeLessThan(before.available);
    flagsOn.clear();
  });

  it("starts the picked idea's research dossier with the run, at no extra charge", async () => {
    flagsOn.add("drop-directions");
    flagsOn.add("tavily-evidence");
    const { actor, db } = await withFal();
    const research = vi.fn(
      async () => await Promise.resolve({ requestId: "req_1" })
    );
    actor.core = { ...actor.core, tavily: { research } } as unknown as Core;
    await keep(db);

    const started = await startPickedRun(actor, {
      countries: ["US"],
      dailyBudget: 5,
      pick,
    });

    expect(research).toHaveBeenCalledOnce();
    const [saved] = await db
      .select()
      .from(idea)
      .where(eq(idea.runId, started.id));
    expect(saved?.research.dossier).toMatchObject({
      requestId: "req_1",
      status: "pending",
    });
    // One research charge for the pick, the dossier included.
    expect(await db.select().from(creditReservation)).toHaveLength(1);
    flagsOn.clear();
  });

  it("refuses a pick it couldn't draw a design for, before charging anything", async () => {
    flagsOn.add("drop-directions");
    const { actor, db, runs } = await withFal();
    await keep(db);
    // Enough for the research, not for the design after it.
    await db
      .update(creditGrant)
      .set({ remaining: billingCatalog().creditCost.research + 1 });

    await expect(
      startPickedRun(actor, { countries: ["US"], dailyBudget: 5, pick })
    ).rejects.toMatchObject({ status: 402 });
    expect(runs.start).not.toHaveBeenCalled();
    expect(await db.select().from(run)).toEqual([]);
    expect(await db.select().from(creditReservation)).toEqual([]);
    flagsOn.clear();
  });

  it("refuses a pick no longer in the suggestions, saving nothing and charging nothing", async () => {
    flagsOn.add("drop-directions");
    const { actor, db, runs } = await withFal();
    await keep(db);
    const before = await creditBalance(actor.db, USER_ID);

    await expect(
      startPickedRun(actor, {
        countries: ["US"],
        dailyBudget: 5,
        pick: { ...pick, theme: "Something else" },
      })
    ).rejects.toMatchObject({ status: 409 });
    expect(runs.start).not.toHaveBeenCalled();
    expect(await db.select().from(run)).toEqual([]);
    expect(await creditBalance(actor.db, USER_ID)).toEqual(before);
    flagsOn.clear();
  });
});
