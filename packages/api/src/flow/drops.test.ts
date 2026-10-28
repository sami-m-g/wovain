import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { applyGrant } from "@wovain/billing/mirror";
import { createBilling } from "@wovain/billing/service";
import type { ArtModels } from "@wovain/core/art";
import type { Core } from "@wovain/core/core";
import { createFalJobs } from "@wovain/core/fal";
import { fakeAgents } from "@wovain/core/test-doubles";
import type { ProviderId, ToolCall } from "@wovain/core/upstream";
import type { Database } from "@wovain/db";
import { relations } from "@wovain/db/relations";
import { user } from "@wovain/db/schema/auth";
import { approval, decisionTrace, drop } from "@wovain/db/schema/autonomy";
import { connection, idea, run } from "@wovain/db/schema/seller";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "./actor";
import {
  buildDropItem,
  dropItems,
  dropStateOf,
  executeDropPublish,
  itemStateOf,
  planDrop,
  publishDrop,
  regionsOf,
  reviewDrop,
} from "./drops";

// A drop end to end against real Postgres (PGlite, with the app's
// migrations), fake provider MCP servers and fake model replies: Qloo's
// tags pick the mix, each product is drawn, placed, previewed and priced,
// and publishing waits for an approval.

const MIGRATIONS = fileURLToPath(
  new URL("../../../db/src/migrations", import.meta.url)
);
const USER_ID = "user_1";

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

const MODELS: ArtModels = {
  cutout: "fal/cutout",
  graphic: "fal/graphic",
  pattern: "fal/pattern",
  typographic: "fal/type",
  upscale: "fal/upscale",
  vector: "fal/vector",
};

const OUTPUTS: Record<string, string> = {
  "fal/graphic": "https://fal.test/graphic.png",
  "fal/pattern": "https://fal.test/pattern.png",
  "fal/type": "https://fal.test/type.svg",
  "fal/vector": "https://fal.test/mark.svg",
};

const fal = () =>
  fakeProvider({
    check_job: { status: "COMPLETED" },
    get_job_result: (args: Record<string, unknown>) => ({
      images: [{ url: OUTPUTS[String(args.endpoint_id)] }],
    }),
    submit_job: (args: Record<string, unknown>) => ({
      request_id: `req-${String(args.endpoint_id)}`,
    }),
  });

// Every blank prints a front with a left-chest spot, a large back, a
// sleeve and a neck label.
const BLANK = {
  id: "prd_blank",
  name: "Blank",
  priceFrom: 12,
  printDetails: {
    printAreas: [
      {
        name: "Front",
        placements: [{ id: "leftChest", name: "Left chest" }],
        salePrice: "$0",
        supportsBackendRendering: true,
        type: "front",
      },
      {
        name: "Back",
        salePrice: "$8.50",
        supportsBackendRendering: true,
        type: "back_large",
      },
      {
        name: "Sleeve",
        salePrice: "$4",
        supportsBackendRendering: true,
        type: "left_sleeve",
      },
      {
        name: "Label",
        salePrice: "$2",
        supportsBackendRendering: true,
        type: "neck_label",
      },
    ],
    supportsBackendRendering: true,
  },
  slug: "blank",
};

const fourthwall = () => {
  let previews = 0;
  return fakeProvider({
    "confirm-image-upload": { url: "https://cdn.fourthwall.com/u/1.png" },
    "ecommerce_bulk-update-offer-variant-prices": { ok: true },
    "ecommerce_create-collection": { id: "col_1" },
    "ecommerce_create-offers-from-designs": (
      args: Record<string, unknown>
    ) => ({
      results: [
        { offerId: `off_${String((args.customizationIds as string[])[0])}` },
      ],
    }),
    "ecommerce_generate-product-design-previews": () => {
      previews += 1;
      return {
        results: [
          {
            customizationId: `cus_${previews}`,
            images: [
              { url: `https://cdn.fourthwall.com/mock/${previews}.png` },
            ],
          },
        ],
      };
    },
    "ecommerce_get-catalog-product-details": [
      { colors: ["Black", "Bone"], sizes: ["S", "M", "L"], slug: "blank" },
    ],
    "ecommerce_get-catalog-products": { products: [BLANK] },
    "ecommerce_get-customization-pricing": {
      costs: [
        { size: "M", totalCost: 21.4 },
        { size: "L", totalCost: 22.9 },
      ],
    },
    "ecommerce_save-media-library-image": {
      uri: "https://cdn.fourthwall.com/m/1.png",
    },
    "ecommerce_update-collection-state": { slug: "night-shift" },
    "request-upload-url": {
      signedUrl: "https://upload.example.com/1",
      uploadId: "up_1",
    },
  });
};

const BRIEF = {
  description: "Night shift for the skate crowd.",
  garmentColors: ["black"],
  graphicPrompt: "A moth over a full moon, linocut, portrait",
  graphicText: [],
  labelText: "Wovain",
  listings: [
    { description: "Two lines.", kind: "hero_tee", title: "Moth Back Tee" },
  ],
  markPrompt: "A moth monogram, bold shapes",
  name: "Night Shift",
  palette: ["#111111", "#f2e8d5", "#c0392b"],
  patternPrompt: "Small moths repeating",
  sleeveText: "EST. 2026",
};

const VISION = {
  drop_cohesion: { note: "One palette and one mark.", pass: true },
  items: [0, 1, 2, 3].map((position) => ({
    hierarchy: { note: "Quiet front.", pass: true },
    placement_fit: { note: "On its spot.", pass: true },
    position,
  })),
};

// A shape on a transparent canvas, as GPT Image and the tiler return.
const png = async (width: number, height: number) =>
  await sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><ellipse cx="${width / 2}" cy="${height / 2}" rx="${width / 3}" ry="${height / 3}" fill="#c81e1e"/></svg>`
    )
  )
    .png()
    .toBuffer();

const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="30" fill="#111111"/><circle cx="50" cy="50" r="10" fill="#c0392b"/></svg>'
);

const stubFetch = async () => {
  const files: Record<string, Buffer> = {
    "https://fal.test/graphic.png": await png(2496, 3328),
    "https://fal.test/mark.svg": SVG,
    "https://fal.test/pattern.png": await png(1024, 1024),
    "https://fal.test/type.svg": SVG,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      if (init?.method === "PUT") {
        return await Promise.resolve(new Response(null, { status: 200 }));
      }
      const body = files[String(input)];
      return await Promise.resolve(
        body === undefined
          ? new Response(null, { status: 404 })
          : new Response(new Uint8Array(body))
      );
    })
  );
};

const setup = async () => {
  const client = new PGlite();
  const db = drizzle({ client, relations });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  await db.insert(user).values({
    email: "merchant@example.com",
    emailVerified: true,
    id: USER_ID,
    name: "Merchant",
  });
  await applyGrant(db as unknown as Database, {
    grantId: "grant_plan",
    periodKey: "2026-10-01T00:00:00Z",
    rollover: false,
    source: "plan",
    units: 1000,
    userId: USER_ID,
  });
  for (const provider of ["fal", "fourthwall"] as const) {
    // oxlint-disable-next-line no-await-in-loop
    await db
      .insert(connection)
      .values({ provider, sealedTokens: "sealed", userId: USER_ID });
  }
  const providers: Partial<
    Record<ProviderId, ReturnType<typeof fakeProvider>>
  > = { fal: fal(), fourthwall: fourthwall() };
  const agents = fakeAgents({ design_brief: [BRIEF], design_vision: [VISION] });
  const sent: unknown[] = [];
  const core = {
    artModels: () => MODELS,
    falJobs: (call: ToolCall) => createFalJobs(call),
    flags: {
      isOn: async (name: string) =>
        await Promise.resolve(name === "design-drops"),
    },
    model: "test/nemotron",
    nemotron: agents.ask,
    upstream: {
      session: async (
        provider: ProviderId,
        _grant: unknown,
        _log: unknown,
        work: (call: ToolCall) => Promise<unknown>
      ) => {
        const fake = providers[provider];
        if (fake === undefined) {
          throw new Error(`${provider} isn't faked`);
        }
        return await work(fake.call);
      },
    },
  } as unknown as Core;
  const actor: Actor = {
    billing: createBilling({
      BETTER_AUTH_URL: "http://localhost:3000",
      POLAR_ENVIRONMENT: "sandbox",
    }),
    core,
    db: db as unknown as Database,
    events: {
      send: async (event) => {
        sent.push(event);
        return await Promise.resolve();
      },
    },
    mailer: vi.fn(async () => {
      await Promise.resolve();
    }),
    userId: USER_ID,
  };
  const [started] = await db
    .insert(run)
    .values({ seed: "skate", status: "running", userId: USER_ID })
    .returning();
  const ideas = await db
    .insert(idea)
    .values(
      ["Skate punk", "Grunge revival"].map((theme, rank) => ({
        avoidNames: [],
        rank,
        research: {
          qlooTag: `urn:tag:keyword:qloo:${rank}`,
          rank,
          references: [],
          score: 0.9,
          signals: { news: 3, social: 2 },
          sources: [],
          theme,
        } as unknown as typeof idea.$inferInsert.research,
        runId: started?.id,
        score: 0.9,
        seed: "skate",
        theme,
        userId: USER_ID,
      }))
    )
    .returning();
  return { actor, agents, db, ideaId: ideas[0]?.id ?? "", providers, sent };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("drops", () => {
  it("plans a skate drop from Qloo's tags, builds it and publishes on approval", async () => {
    await stubFetch();
    const ctx = await setup();

    const planned = await planDrop(ctx.actor, {
      ideaId: ctx.ideaId,
      requestId: "req_1",
    });
    const again = await planDrop(ctx.actor, {
      ideaId: ctx.ideaId,
      requestId: "req_1",
    });
    expect(again.id).toBe(planned.id);
    expect(planned.styleFamily).toBe("skate_punk");
    expect(dropStateOf(planned).matched).toEqual([
      "Skate punk",
      "Grunge revival",
    ]);
    expect(ctx.sent).toHaveLength(2);

    const items = await dropItems(ctx.actor, planned.id);
    expect(items.map((item) => itemStateOf(item).kind)).toEqual([
      "hero_tee",
      "long_sleeve",
      "beanie",
      "sticker",
    ]);
    const [tee] = items;
    expect(tee?.colors).toEqual(["Black"]);
    expect(
      regionsOf(tee ?? { regions: {} }).map(([region, piece]) => [
        region,
        piece.artType,
        piece.placementId,
      ])
    ).toEqual([
      ["front", "mark", "leftChest"],
      ["back_large", "graphic", undefined],
      ["neck_label", "label", undefined],
    ]);

    for (const item of items) {
      // oxlint-disable-next-line no-await-in-loop
      await buildDropItem(ctx.actor, planned.id, item.id);
    }
    const falCalls = ctx.providers.fal;
    // The drop's art is drawn once per source: graphic, mark, type, and the
    // beanie's embroidery (its own prompt, at the beanie's wide ratio).
    expect(falCalls?.count("submit_job")).toBe(4);
    const built = await dropItems(ctx.actor, planned.id);
    expect(built.every((item) => item.status === "ready")).toBe(true);
    const [builtTee] = built;
    expect(builtTee?.priceCents).toBeGreaterThan(2290);
    expect(itemStateOf(builtTee ?? { regions: {} }).cost).toEqual({
      dollars: 22.9,
      source: "customization",
    });
    const preview = ctx.providers.fourthwall?.calls.find(
      (item) => item.tool === "ecommerce_generate-product-design-previews"
    )?.args as { products: Record<string, unknown>[] };
    expect(preview.products[0]).toMatchObject({
      colors: ["Black"],
      placementIds: ["leftChest", "", ""],
      regionNames: ["front", "back_large", "neck_label"],
      regionOffsets: [{ regionIndex: 1, x: 0, y: -0.18 }],
      sizes: ["S", "M", "L"],
    });
    const back = regionsOf(builtTee ?? { regions: {} })[1]?.[1];
    expect(back?.facts?.every((fact) => fact.pass)).toBe(true);

    const reviewed = await reviewDrop(ctx.actor, planned.id);
    expect(reviewed.status).toBe("in_review");
    expect(
      ctx.agents.asked.find((call) => call.name === "design_vision")?.images
    ).toHaveLength(4);

    const asked = await publishDrop(ctx.actor, planned.id);
    expect(asked).toMatchObject({
      actionType: "store.drop.publish",
      status: "pending",
    });
    expect(await ctx.db.select().from(approval)).toHaveLength(1);

    const live = await executeDropPublish(ctx.actor, planned.id);
    expect(live).toMatchObject({ collectionId: "col_1", status: "live" });
    expect(
      ctx.providers.fourthwall?.count("ecommerce_create-offers-from-designs")
    ).toBe(4);
    const [saved] = await ctx.db
      .select()
      .from(drop)
      .where(eq(drop.id, planned.id));
    expect(dropStateOf(saved ?? { brief: {} }).collectionSlug).toBe(
      "night-shift"
    );
    const traced = await ctx.db.select().from(decisionTrace);
    expect(traced.map((entry) => entry.step)).toEqual([
      "style_family",
      "brief",
      "blanks",
    ]);
    expect(traced[0]?.sources[0]).toMatchObject({ provider: "qloo" });
  });
});
