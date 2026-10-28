import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { ORPCError } from "@orpc/server";
import { applyGrant } from "@wovain/billing/mirror";
import { createBilling } from "@wovain/billing/service";
import type { Core } from "@wovain/core/core";
import { fakeNemotron } from "@wovain/core/test-doubles";
import type { ProviderId, ToolCall } from "@wovain/core/upstream";
import type { Database } from "@wovain/db";
import { relations } from "@wovain/db/relations";
import { user } from "@wovain/db/schema/auth";
import { externalWrite } from "@wovain/db/schema/durable";
import {
  campaign,
  connection,
  design,
  idea,
  product,
  run,
} from "@wovain/db/schema/seller";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { createError, log } from "evlog";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createRunRouter } from "../workflows/rollout";
import { isPermanent } from "../workflows/run";
import type { Actor, RunEngine } from "./actor";
import { compensateRun, createProductCampaign } from "./campaigns";
import { listConnections, requireFal, withProvider } from "./connections";
import { decideDesign } from "./designs";
import { once } from "./once";
import { previewPlacement } from "./placements";
import { createDesignProduct } from "./products";
import { approvedDesigns, awaitApproval, eachSettled, finishRun } from "./runs";
import { transitionErrors } from "./transitions";

// Steps and state transitions of a durable run against real Postgres
// (PGlite, with the app's migrations) and fake provider MCP servers. The
// crash cases replay a step the way Inngest does after an invocation dies.

const MIGRATIONS = fileURLToPath(
  new URL("../../../db/src/migrations", import.meta.url)
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
    nemotron: ask,
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

const engine = (resume: RunEngine["resume"] = vi.fn()): RunEngine => ({
  resume,
  start: vi.fn(),
});

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
