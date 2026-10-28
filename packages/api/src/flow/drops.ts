import { artRequest, finishArt, outputUrl } from "@wovain/core/art";
import type { PieceCheck } from "@wovain/core/art";
import {
  dropArtOf,
  draftDropBrief,
  judgeDropMockups,
  listingFor,
} from "@wovain/core/drop-brief";
import type { DropBrief, DropCheck } from "@wovain/core/drop-brief";
import {
  catalogCost,
  chooseStyleFamily,
  DROP_MIX,
  pickColors,
  planPlacements,
  priceFromCost,
  PRODUCT_KINDS,
} from "@wovain/core/drops";
import type { ArtType, PlacedPiece, ProductKind } from "@wovain/core/drops";
import { EVENTS } from "@wovain/core/events";
import { createOffer, setOfferPrice } from "@wovain/core/fourthwall";
import {
  blankVariants,
  createCollection,
  customizationCost,
  previewItem,
  publishCollection,
  searchBlanks,
  uploadPng,
} from "@wovain/core/fourthwall-drops";
import type { Blank, PrintArea } from "@wovain/core/fourthwall-drops";
import { withLlmTrace } from "@wovain/core/nemotron";
import { DecisionTrace } from "@wovain/core/trace";
import type { TraceSource } from "@wovain/core/trace";
import type { ToolCall } from "@wovain/core/upstream";
import { brandProfile, drop, dropItem } from "@wovain/db/schema/autonomy";
import { idea } from "@wovain/db/schema/seller";
import { and, asc, desc, eq } from "drizzle-orm";
import { createError, log } from "evlog";

import type { Actor } from "./actor";
import { notReady } from "./actor";
import {
  approvalsFor,
  autonomyOf,
  spendToDate,
  traceSinkFor,
} from "./approvals";
import { requireFal, withProvider } from "./connections";
import { flagContextOf } from "./flags";
import { getIdea } from "./ideas";
import { once } from "./once";
import { charge } from "./spend";

// Drops (openspec design-drops): an idea becomes a capsule of 4 to 6
// products that share a palette, a mark and a style family.
//
// 1. planDrop: Qloo's tags for the idea pick the style family and the
//    family picks the mix (code, traced); Nemotron writes the drop's brief;
//    Fourthwall's catalog gives each product a blank, its print areas,
//    colors and sizes; code plans what art goes where. Saved as a draft
//    drop, then built in the background (wovain/drop.build.requested).
// 2. buildDropItem, per product: the drop's shared art is drawn once per
//    art type (charged once each), finished in code to each placement's
//    pixels, uploaded, previewed on every placement and color, and priced
//    from what Fourthwall charges to make it.
// 3. reviewDrop: Nemotron's vision model looks at the mockups (placement,
//    hierarchy, cohesion); the drop waits for the merchant (in_review).
// 4. publishDrop: one approval (store.drop.publish); once approved, the
//    executor creates the products and the collection and makes them
//    public (../workflows/drops.ts).
//
// Every provider write is keyed (./once), so a retried step pays and
// writes once.

type DropRow = typeof drop.$inferSelect;
type ItemRow = typeof dropItem.$inferSelect;

// One placement of a product, as saved in drop_item.regions.
export interface RegionState {
  artType: ArtType;
  facts?: PieceCheck[] | undefined;
  fillAll?: boolean | undefined;
  fraction: number;
  mediaUri?: string | undefined;
  method: PlacedPiece["method"];
  offset?: { x: number; y: number } | undefined;
  pixels: PlacedPiece["pixels"];
  placementId?: string | undefined;
  printInches: PlacedPiece["printInches"];
}

// The product's own state, saved under ITEM_KEY in drop_item.regions next
// to its placements (no column of its own: openspec design-drops).
export interface ItemState {
  blankName: string;
  checks?: DropCheck[] | undefined;
  // Where the price came from: Fourthwall's cost for this customization,
  // or the catalog's prices when that couldn't be read.
  cost?: { dollars: number; source: "customization" | "catalog" } | undefined;
  customizationId?: string | undefined;
  description: string;
  error?: string | undefined;
  kind: ProductKind;
  mockups?: string[] | undefined;
  offerId?: string | undefined;
  sizes: string[];
  slug: string;
  title: string;
}

export const ITEM_KEY = "$item";

// The drop's own state, in drop.brief.
export interface DropState {
  brief: DropBrief;
  checks?: DropCheck[] | undefined;
  collectionSlug?: string | undefined;
  ideaId: string;
  // The Qloo tags (and brand niches) that chose the style family.
  matched: string[];
  // Kinds the catalog had no blank for.
  skipped: ProductKind[];
}

export const itemStateOf = (row: Pick<ItemRow, "regions">) =>
  row.regions[ITEM_KEY] as unknown as ItemState;

export const regionsOf = (row: Pick<ItemRow, "regions">) =>
  Object.entries(row.regions).filter(
    ([name]) => name !== ITEM_KEY
  ) as unknown as [string, RegionState][];

export const dropStateOf = (row: Pick<DropRow, "brief">) =>
  row.brief as unknown as DropState;

export const designDropsOff = () =>
  createError({
    fix: "Turn on the design-drops flag for this environment.",
    message: "Drops aren't available yet",
    status: 404,
    why: "The design-drops flag is off.",
  });

export const requireDesignDrops = async (actor: Actor) => {
  if (!(await actor.core.flags.isOn("design-drops", flagContextOf(actor)))) {
    throw designDropsOff();
  }
};

const MIN_ITEMS = 2;

// The tags behind an idea: the Qloo tags of its run's ideas (the theme of
// an idea that came from Qloo is the tag's name), then the brand's niches.
const tagsFor = async (actor: Actor, source: typeof idea.$inferSelect) => {
  const siblings =
    source.runId === null
      ? [source]
      : await actor.db
          .select()
          .from(idea)
          .where(
            and(eq(idea.userId, actor.userId), eq(idea.runId, source.runId))
          );
  const qloo = siblings.filter((row) => row.research.qlooTag !== undefined);
  const [brand] = await actor.db
    .select()
    .from(brandProfile)
    .where(eq(brandProfile.userId, actor.userId));
  const sources: TraceSource[] = qloo.map((row) => ({
    id: row.research.qlooTag,
    provider: "qloo",
    title: row.theme,
  }));
  return {
    brand,
    sources,
    tags: [...qloo.map((row) => row.theme), ...(brand?.niches ?? [])],
  };
};

interface PlannedItem {
  blank: Blank;
  colors: string[];
  kind: ProductKind;
  pieces: PlacedPiece[];
  sizes: string[];
}

// The first popular blank that can carry every required piece of the kind.
const blankFor = async (
  call: ToolCall,
  kind: ProductKind,
  garmentColors: string[]
): Promise<PlannedItem | undefined> => {
  const spec = PRODUCT_KINDS[kind];
  const blanks = await searchBlanks(call, {
    printRegions: "printRegions" in spec ? [...spec.printRegions] : undefined,
    productionMethods:
      "productionMethods" in spec ? [...spec.productionMethods] : undefined,
    query: spec.query,
  });
  for (const blank of blanks) {
    const { missing, pieces } = planPlacements(kind, blank.printAreas);
    if (missing.length === 0 && pieces.length > 0) {
      // One blank at a time: the first that fits wins.
      // oxlint-disable-next-line no-await-in-loop
      const variants = await blankVariants(call, blank.slug);
      return {
        blank,
        colors: pickColors(variants.colors, garmentColors),
        kind,
        pieces,
        sizes: variants.sizes,
      };
    }
  }
  return undefined;
};

const regionsFrom = (planned: PlannedItem, state: ItemState) => {
  const regions: Record<string, Record<string, unknown>> = {
    [ITEM_KEY]: { ...state },
  };
  for (const piece of planned.pieces) {
    const saved: RegionState = {
      artType: piece.artType,
      fillAll: piece.fillAll,
      fraction: piece.fraction,
      method: piece.method,
      offset: piece.offset,
      pixels: piece.pixels,
      placementId: piece.placementId,
      printInches: piece.printInches,
    };
    regions[piece.region] = { ...saved };
  }
  return regions;
};

export interface PlanInput {
  ideaId: string;
  // The caller's request ID: a retry with it gets the same drop.
  requestId: string;
}

const makePlan = async (
  actor: Actor,
  source: typeof idea.$inferSelect
): Promise<string> => {
  const trace = new DecisionTrace(
    { runId: source.runId ?? undefined, userId: actor.userId },
    traceSinkFor(actor)
  );
  const { brand, sources, tags } = await tagsFor(actor, source);
  const choice = chooseStyleFamily(tags);
  const mix = DROP_MIX[choice.family];
  trace.add({
    agent: "drop_planner",
    inputSummary: `tags: ${tags.join(", ")}`,
    output: { family: choice.family, matched: choice.matched, mix },
    sources,
    step: "style_family",
  });
  const brief = await withLlmTrace(
    { distinctId: actor.userId, traceId: source.runId ?? source.id },
    async () =>
      await trace.call(
        {
          agent: "drop_brief",
          inputSummary: `${source.theme} · ${choice.family} · ${mix.join(", ")}`,
          model: actor.core.model,
          step: "brief",
        },
        async () =>
          await draftDropBrief(
            actor.core.nemotron,
            {
              avoidNames: source.avoidNames,
              brandName: brand?.displayName ?? undefined,
              brandPalette:
                brand !== undefined && brand.palette.length > 0
                  ? brand.palette
                  : undefined,
              family: choice.family,
              idea: source.research,
              mix,
              tags,
            },
            actor.log
          ),
        (made) => ({ output: { name: made.name, palette: made.palette } })
      )
  );
  const planned = await withProvider(actor, "fourthwall", async (call) => {
    const found: PlannedItem[] = [];
    for (const kind of mix) {
      // Catalog reads, one kind at a time.
      // oxlint-disable-next-line no-await-in-loop
      const item = await blankFor(call, kind, brief.garmentColors);
      if (item !== undefined) {
        found.push(item);
      }
    }
    return found;
  });
  const skipped = mix.filter(
    (kind) => !planned.some((item) => item.kind === kind)
  );
  trace.add({
    agent: "drop_planner",
    inputSummary: mix.join(", "),
    output: {
      blanks: planned.map((item) => ({
        blank: item.blank.name,
        colors: item.colors,
        kind: item.kind,
        regions: item.pieces.map((piece) => piece.region),
      })),
      skipped,
    },
    sources: planned.map((item) => ({
      id: item.blank.id,
      provider: "fourthwall",
      title: item.blank.name,
    })),
    step: "blanks",
  });
  if (planned.length < MIN_ITEMS) {
    await trace.flush();
    throw notReady({
      fix: "Reconnect Fourthwall, then try again.",
      message: "Fourthwall's catalog had too few blanks for this drop",
      why: `Found blanks for ${planned.length} of ${mix.length} products.`,
    });
  }
  const state: DropState = {
    brief,
    ideaId: source.id,
    matched: choice.matched,
    skipped,
  };
  const [row] = await actor.db
    .insert(drop)
    .values({
      brief: { ...state },
      name: brief.name,
      palette: brief.palette,
      qlooTags: tags,
      runId: source.runId,
      styleFamily: choice.family,
      userId: actor.userId,
    })
    .returning();
  if (row === undefined) {
    throw new Error("The drop wasn't saved");
  }
  await actor.db.insert(dropItem).values(
    planned.map((item, position) => {
      const listing = listingFor(brief, item.kind);
      return {
        catalogProductId: item.blank.id,
        colors: item.colors,
        dropId: row.id,
        position,
        regions: regionsFrom(item, {
          blankName: item.blank.name,
          description: listing.description,
          kind: item.kind,
          sizes: item.sizes,
          slug: item.blank.slug,
          title: listing.title,
        }),
        userId: actor.userId,
      };
    })
  );
  trace.scope.dropId = row.id;
  await trace.flush();
  return row.id;
};

export const getDrop = async ({ db, userId }: Actor, id: string) => {
  const [row] = await db
    .select()
    .from(drop)
    .where(and(eq(drop.id, id), eq(drop.userId, userId)));
  if (row === undefined) {
    throw createError({
      message: `No drop ${id}`,
      status: 404,
      why: "This merchant has no drop with that ID.",
    });
  }
  return row;
};

export const dropItems = async ({ db, userId }: Actor, dropId: string) =>
  await db
    .select()
    .from(dropItem)
    .where(and(eq(dropItem.dropId, dropId), eq(dropItem.userId, userId)))
    .orderBy(asc(dropItem.position));

// Plans the drop and queues its build. Keyed on the request: a retried
// call returns the drop the first one made.
export const planDrop = async (
  actor: Actor,
  { ideaId, requestId }: PlanInput
): Promise<DropRow> => {
  await requireDesignDrops(actor);
  const source = await getIdea(actor, ideaId);
  const dropId = await once(actor, {
    key: `drop:${actor.userId}:${requestId}:plan`,
    operation: "plan_drop",
    perform: async () => await makePlan(actor, source),
    provider: "nebius",
    runId: source.runId,
  });
  await actor.events?.send({
    data: { dropId, userId: actor.userId },
    name: EVENTS.dropBuildRequested,
  });
  return await getDrop(actor, dropId);
};

export const listDrops = async ({ db, userId }: Actor) =>
  await db
    .select()
    .from(drop)
    .where(eq(drop.userId, userId))
    .orderBy(desc(drop.createdAt))
    .limit(50);

// The art a piece starts from: marks and embroidery share the drop's one
// mark, so every product carries the same one.
const sourceOf = (artType: ArtType): ArtType =>
  artType === "embroidery" ? "mark" : artType;

// The drop's art of one type: drawn once per drop (charged as one design),
// re-read for free after that. Undefined for labels, which code draws.
const drawnArt = async (
  actor: Actor,
  row: DropRow,
  artType: ArtType,
  pixels: PlacedPiece["pixels"]
) => {
  const models = actor.core.artModels();
  const request = artRequest(
    sourceOf(artType),
    dropArtOf(dropStateOf(row).brief),
    models,
    pixels
  );
  if (request === undefined) {
    return;
  }
  const requestId = await once(actor, {
    key: `drop:${row.id}:art:${sourceOf(artType)}`,
    operation: "submit_art",
    perform: async () =>
      await charge(
        actor,
        "design",
        { runId: row.runId },
        async () =>
          await withProvider(
            actor,
            "fal",
            async (call) =>
              await actor.core
                .falJobs(call)
                .submit(request.model, request.input)
          )
      ),
    provider: "fal",
    runId: row.runId,
  });
  return await withProvider(actor, "fal", async (call) =>
    outputUrl(await actor.core.falJobs(call).result(request.model, requestId))
  );
};

// One placement's finished art, uploaded to the shop's media library.
const placeArt = async (
  actor: Actor,
  row: DropRow,
  item: ItemRow,
  [region, piece]: [string, RegionState]
): Promise<RegionState> => {
  const sourceUrl = await drawnArt(actor, row, piece.artType, piece.pixels);
  const placed = await once(actor, {
    key: `drop:${row.id}:item:${item.id}:${region}:media`,
    operation: "upload_artwork",
    perform: async () => {
      const finished = await withProvider(
        actor,
        "fal",
        async (call) =>
          await finishArt({
            art: dropArtOf(dropStateOf(row).brief),
            jobs: actor.core.falJobs(call),
            models: actor.core.artModels(),
            piece,
            sourceUrl,
          })
      );
      const mediaUri = await withProvider(
        actor,
        "fourthwall",
        async (call) =>
          await uploadPng(call, finished.png, {
            height: finished.height,
            width: finished.width,
          })
      );
      return { facts: finished.facts, mediaUri };
    },
    provider: "fourthwall",
    runId: row.runId,
  });
  return { ...piece, ...placed };
};

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

// What making the product costs: Fourthwall's price for this
// customization, or, when that can't be read (logged at error level), the
// blank's price plus each extra area's.
const costOf = async (
  actor: Actor,
  call: ToolCall,
  item: ItemRow,
  customizationId: string,
  regions: string[]
): Promise<NonNullable<ItemState["cost"]>> => {
  try {
    const { max } = await customizationCost(call, customizationId);
    return { dollars: max, source: "customization" };
  } catch (error) {
    log.error({
      drop: { id: item.dropId, item_id: item.id },
      error: {
        code: "DROP_PRICING_UNREADABLE",
        message: `Fourthwall's customization pricing couldn't be read: ${errorMessage(error)}`,
        name: "DropPricingUnreadable",
      },
      userId: actor.userId,
    });
    const [blank] = await searchBlanks(call, {
      query: itemStateOf(item).blankName,
    });
    const areas: PrintArea[] =
      blank?.id === item.catalogProductId ? blank.printAreas : [];
    if (blank?.baseCost === undefined || areas.length === 0) {
      throw new Error(
        "Neither Fourthwall's pricing nor its catalog gave a cost",
        {
          cause: error,
        }
      );
    }
    return {
      dollars: catalogCost(blank.baseCost, areas, regions),
      source: "catalog",
    };
  }
};

const saveItem = async (
  actor: Actor,
  item: ItemRow,
  patch: Partial<Pick<ItemRow, "priceCents" | "regions" | "status">>
) => {
  const [saved] = await actor.db
    .update(dropItem)
    .set(patch)
    .where(and(eq(dropItem.id, item.id), eq(dropItem.userId, actor.userId)))
    .returning();
  return saved ?? { ...item, ...patch };
};

// Draws, places, previews and prices one product of the drop. Safe to run
// twice: each paid call and write is keyed.
export const buildDropItem = async (
  actor: Actor,
  dropId: string,
  itemId: string
): Promise<ItemRow> => {
  const row = await getDrop(actor, dropId);
  const items = await dropItems(actor, dropId);
  const item = items.find((each) => each.id === itemId);
  if (item === undefined) {
    throw new Error(`No item ${itemId} in drop ${dropId}`);
  }
  if (item.status === "ready" || item.status === "published") {
    return item;
  }
  await requireFal(actor);
  const placed: [string, RegionState][] = [];
  for (const entry of regionsOf(item)) {
    // One placement at a time: the drop's art is drawn on first use.
    // oxlint-disable-next-line no-await-in-loop
    placed.push([entry[0], await placeArt(actor, row, item, entry)]);
  }
  const state = itemStateOf(item);
  const { cost, preview } = await withProvider(
    actor,
    "fourthwall",
    async (call) => {
      const made = await once(actor, {
        key: `drop:${row.id}:item:${item.id}:preview`,
        operation: "preview_design",
        perform: async () =>
          await previewItem(call, {
            colors: item.colors,
            productId: item.catalogProductId,
            regions: placed.map(([region, piece]) => ({
              fillAll: piece.fillAll,
              fraction: piece.fraction,
              offset: piece.offset,
              placementId: piece.placementId,
              region,
              url: piece.mediaUri ?? "",
            })),
            sizes: state.sizes,
          }),
        provider: "fourthwall",
        runId: row.runId,
      });
      return {
        cost: await costOf(
          actor,
          call,
          item,
          made.customizationId,
          placed.map(([region]) => region)
        ),
        preview: made,
      };
    }
  );
  const regions: Record<string, Record<string, unknown>> = {
    [ITEM_KEY]: {
      ...state,
      cost,
      customizationId: preview.customizationId,
      mockups: preview.mockups,
    },
  };
  for (const [region, piece] of placed) {
    regions[region] = { ...piece };
  }
  return await saveItem(actor, item, {
    priceCents: priceFromCost(cost.dollars),
    regions,
    status: "ready",
  });
};

// A product that failed for good: saved as failed with the reason, and
// logged at error level.
export const failDropItem = async (
  actor: Actor,
  item: ItemRow,
  error: unknown
) => {
  log.error({
    drop: { id: item.dropId, item_id: item.id },
    error: {
      code: "DROP_ITEM_FAILED",
      message: `A drop product failed: ${errorMessage(error)}`,
      name: "DropItemFailed",
      ...(error instanceof Error && error.stack !== undefined
        ? { stack: error.stack }
        : {}),
    },
    userId: actor.userId,
  });
  return await saveItem(actor, item, {
    regions: {
      ...item.regions,
      [ITEM_KEY]: { ...itemStateOf(item), error: errorMessage(error) },
    },
    status: "failed",
  });
};

// Nemotron's vision model on the mockups, then the drop waits for the
// merchant. Each product's code facts stay with its placements.
export const reviewDrop = async (actor: Actor, dropId: string) => {
  const row = await getDrop(actor, dropId);
  const items = await dropItems(actor, dropId);
  const ready = items.filter((item) => item.status === "ready");
  const mockups = ready.flatMap((item) => {
    const [mockup] = itemStateOf(item).mockups ?? [];
    return mockup === undefined
      ? []
      : [
          {
            kind: itemStateOf(item).kind,
            mockup,
            position: item.position,
            regions: regionsOf(item).map(([region]) => region),
          },
        ];
  });
  const state = dropStateOf(row);
  const checks = await withLlmTrace(
    { distinctId: actor.userId, traceId: row.runId ?? row.id },
    async () =>
      await judgeDropMockups(
        actor.core.nemotron,
        { items: mockups, palette: state.brief.palette },
        actor.log
      )
  );
  const [saved] = await actor.db
    .update(drop)
    .set({
      brief: { ...state, checks },
      status: ready.length > 0 ? "in_review" : "draft",
    })
    .where(and(eq(drop.id, dropId), eq(drop.userId, actor.userId)))
    .returning();
  return saved ?? row;
};

// Asks to publish the drop: one approval for the whole capsule. The policy
// may settle it at once; the executor (../workflows/drops.ts) publishes on
// approval.
export const publishDrop = async (actor: Actor, dropId: string) => {
  await requireDesignDrops(actor);
  const row = await getDrop(actor, dropId);
  const items = await dropItems(actor, dropId);
  const ready = items.filter((item) => item.status === "ready");
  if (row.status !== "in_review" || ready.length === 0) {
    throw notReady({
      fix: "Wait for the drop's products to be ready, then publish.",
      message: "The drop isn't ready to publish",
    });
  }
  const [settings, spent] = await Promise.all([
    autonomyOf(actor),
    spendToDate(actor),
  ]);
  const { approval } = await approvalsFor(actor).enqueue(
    {
      dropId,
      idempotencyKey: `drop:${dropId}:publish`,
      payload: { dropId },
      proposedBy: "merchant",
      reason: `${ready.length} products, ${row.styleFamily ?? "streetwear"} style`,
      runId: row.runId ?? undefined,
      title: `Publish the drop "${row.name}"`,
      type: "store.drop.publish",
      userId: actor.userId,
    },
    settings,
    spent
  );
  return approval;
};

const CENTS = 100;

// The approved publish: each ready product is created (hidden) at its
// price, the collection is created with them, and the collection with its
// products is made public. Keyed, so a retry publishes once.
export const executeDropPublish = async (actor: Actor, dropId: string) => {
  const row = await getDrop(actor, dropId);
  const items = await dropItems(actor, dropId);
  const ready = items.filter(
    (item) => item.status === "ready" || item.status === "published"
  );
  const state = dropStateOf(row);
  const slug = await withProvider(actor, "fourthwall", async (call) => {
    const offerIds: string[] = [];
    for (const item of ready) {
      const itemState = itemStateOf(item);
      if (itemState.customizationId === undefined || item.priceCents === null) {
        continue;
      }
      const { customizationId } = itemState;
      // One product at a time, each keyed.
      // oxlint-disable-next-line no-await-in-loop
      const offerId = await once(actor, {
        key: `drop:${dropId}:item:${item.id}:offer`,
        operation: "create_offer",
        perform: async () =>
          await createOffer(call, {
            customizationId,
            description: itemState.description,
            title: itemState.title,
          }),
        provider: "fourthwall",
        runId: row.runId,
      });
      // oxlint-disable-next-line no-await-in-loop
      await setOfferPrice(call, offerId, item.priceCents / CENTS);
      // oxlint-disable-next-line no-await-in-loop
      await saveItem(actor, item, {
        regions: { ...item.regions, [ITEM_KEY]: { ...itemState, offerId } },
        status: "published",
      });
      offerIds.push(offerId);
    }
    const collectionId = await once(actor, {
      key: `drop:${dropId}:collection`,
      operation: "create_collection",
      perform: async () =>
        await createCollection(call, {
          description: state.brief.description,
          name: row.name,
          offerIds,
        }),
      provider: "fourthwall",
      runId: row.runId,
    });
    await actor.db
      .update(drop)
      .set({ collectionId })
      .where(and(eq(drop.id, dropId), eq(drop.userId, actor.userId)));
    return await publishCollection(call, collectionId);
  });
  const [saved] = await actor.db
    .update(drop)
    .set({ brief: { ...state, collectionSlug: slug }, status: "live" })
    .where(and(eq(drop.id, dropId), eq(drop.userId, actor.userId)))
    .returning();
  return saved ?? row;
};
