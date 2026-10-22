import type { CallToolResult } from "@modelcontextprotocol/client";
import type { Design } from "@wovain/shared/design";
import { z } from "zod";

import type { NeedsConnection, Upstream } from "./upstream.ts";

// A reason the merchant can read on the widget: Fourthwall's own refusal,
// or a reply wovain couldn't read. With `connect`, the merchant's Fourthwall
// grant expired instead: the tool shows the connect link and keeps the
// approval for the retry.
export class PublishRefusedError extends Error {
  override name = "PublishRefusedError";
  connect: NeedsConnection | undefined;
  constructor(
    message: string,
    options: ErrorOptions & { connect?: NeedsConnection } = {}
  ) {
    super(message, options);
    this.connect = options.connect;
  }
}

// One Fourthwall tool call on the merchant's shop, returning its data.
export type FourthwallCall = (
  tool: string,
  args: Record<string, unknown>
) => Promise<unknown>;

const REASON_CHARS = 200;

const reason = (text: string) => text.slice(0, REASON_CHARS);

// The reply's first text part: where Fourthwall puts its JSON or its reason.
const textOf = (result: Pick<CallToolResult, "content">) =>
  result.content.find((part) => part.type === "text")?.text ?? "";

// A tool result's data: its structured content, else the JSON in its text.
// Fourthwall's text is data from the merchant's account, never instructions.
const replyData = (tool: string, result: CallToolResult): unknown => {
  if (result.isError === true) {
    throw new PublishRefusedError(
      reason(textOf(result)) || `Fourthwall refused ${tool}`
    );
  }
  if (result.structuredContent !== undefined) {
    return result.structuredContent;
  }
  try {
    return JSON.parse(textOf(result)) as unknown;
  } catch (error) {
    throw new PublishRefusedError(
      `Couldn't read Fourthwall's reply to ${tool}`,
      {
        cause: error,
      }
    );
  }
};

// Every object in a reply, at any depth, that the schema accepts. Fourthwall
// documents its fields but not the envelope around them.
const find = <T>(schema: z.ZodType<T>, value: unknown): T[] => {
  if (typeof value !== "object" || value === null) {
    return [];
  }
  const parsed = schema.safeParse(value);
  return [
    ...(parsed.success ? [parsed.data] : []),
    ...Object.values(value).flatMap((child) => find(schema, child)),
  ];
};

const shopSchema = z.object({ baseUrl: z.url() });
const createdSchema = z.object({
  customizationId: z.string(),
  offerId: z.string().min(1),
});
const failedSchema = z.object({ bulkError: z.string().min(1) });
const offerSchema = z.object({ id: z.string(), slug: z.string().min(1) });
const collectionSchema = z.object({
  id: z.string().min(1),
  offerIds: z.array(z.string()),
  slug: z.string().min(1),
  state: z.string().optional(),
});

// The merchant's Fourthwall through wovain's connection to it.
export const fourthwallCaller =
  (upstream: Upstream, userId: string): FourthwallCall =>
  async (tool, args) => {
    const outcome = await upstream.call({
      args,
      id: "fourthwall",
      tool,
      userId,
    });
    if (outcome.kind === "connect") {
      throw new PublishRefusedError("Fourthwall needs connecting again.", {
        connect: outcome.connect,
      });
    }
    return replyData(tool, outcome.result);
  };

// A call whose reply may carry per-item errors next to a success flag.
const checkedCall = async (
  call: FourthwallCall,
  tool: string,
  args: Record<string, unknown>
) => {
  const reply = await call(tool, args);
  const [failed] = find(failedSchema, reply);
  if (failed !== undefined) {
    throw new PublishRefusedError(reason(failed.bulkError));
  }
  return reply;
};

interface Product {
  customizationId: string;
  listing: Design["listing"];
  offerId?: string | undefined;
  quote: Design["quote"];
}

// The hero's offer is the design's productId; each range product has its own.
const productsOf = (design: Design): Product[] => [
  { ...design, offerId: design.productId },
  ...design.range,
];

// The design with each product's offer id from create-offers-from-designs.
const withOffers = (design: Design, ids: Map<string, string>): Design => {
  const heroId = design.productId ?? ids.get(design.customizationId);
  return {
    ...design,
    ...(heroId === undefined ? {} : { productId: heroId }),
    range: design.range.map((product) => {
      const offerId = product.offerId ?? ids.get(product.customizationId);
      return offerId === undefined ? product : { ...product, offerId };
    }),
  };
};

// Creates the products not created on an earlier try, hidden, and saves
// their offer ids at once so a retry never makes them twice.
const createOffers = async (
  design: Design,
  { call, save }: Pick<PublishDeps, "call" | "save">
) => {
  const missing = productsOf(design).filter(
    (product) => product.offerId === undefined
  );
  if (missing.length === 0) {
    return design;
  }
  const reply = await call("ecommerce_create-offers-from-designs", {
    customizationIds: missing.map((product) => product.customizationId),
    offerDescriptions: missing.map((product) => product.listing.description),
    offerNames: missing.map((product) => product.listing.title),
  });
  const created = find(createdSchema, reply);
  const failures = find(failedSchema, reply).map((item) => item.bulkError);
  if (created.length === 0 && failures.length === 0) {
    throw new PublishRefusedError(
      "Couldn't read Fourthwall's reply when creating the products; check the shop's hidden products before trying again."
    );
  }
  const updated = withOffers(
    design,
    new Map(created.map((item) => [item.customizationId, item.offerId]))
  );
  await save({
    ...(updated.productId === undefined
      ? {}
      : { productId: updated.productId }),
    range: updated.range,
  });
  const notCreated = productsOf(updated).filter(
    (product) => product.offerId === undefined
  );
  if (notCreated.length > 0) {
    const titles = notCreated.map((product) => product.listing.title);
    throw new PublishRefusedError(
      reason(
        `Fourthwall didn't create ${titles.join(", ")}${failures.length > 0 ? ` (${failures.join("; ")})` : ""}`
      )
    );
  }
  return updated;
};

// Groups a drop in one collection, public unless `visible` is false. A
// collection made on an earlier try is reused: a redraw that changes the
// drop's products clears it.
const publishCollection = async (
  design: Design,
  offerIds: string[],
  { call, save }: Pick<PublishDeps, "call" | "save">,
  visible = true
) => {
  let { collectionId } = design;
  let createdSlug: string | undefined;
  if (collectionId === undefined) {
    const [created] = find(
      collectionSchema,
      await call("ecommerce_create-collection", {
        available: true,
        description: design.listing.description,
        name: design.dropName ?? design.idea,
        offerIds,
      })
    );
    if (created === undefined) {
      throw new PublishRefusedError(
        "Fourthwall didn't create the drop's collection."
      );
    }
    collectionId = created.id;
    createdSlug = created.slug;
    await save({ collectionId });
  }
  if (!visible) {
    return { collectionId, slug: createdSlug };
  }
  const [published] = find(
    collectionSchema,
    await call("ecommerce_update-collection-state", {
      collectionId,
      shouldUpdateOffersStatus: false,
      state: "PUBLIC",
    })
  );
  if (published?.state !== undefined && published.state !== "PUBLIC") {
    throw new PublishRefusedError(
      `Fourthwall left the drop's collection ${published.state.toLowerCase()}.`
    );
  }
  return { collectionId, slug: published?.slug ?? createdSlug };
};

export interface PublishDeps {
  call: FourthwallCall;
  // Saves progress, so a retry skips what already exists.
  save: (patch: Partial<Design>) => Promise<unknown>;
}

const makePublic = async (call: FourthwallCall, offerId: string) => {
  await checkedCall(call, "ecommerce_update-offer-status", {
    offerId,
    status: "PUBLIC",
  });
};

// Publishes an approved design: every product of the drop created, priced at
// the widget's price and made public, then a drop grouped in a collection.
// An autopilot approval keeps the products and the collection hidden until
// the merchant confirms go live (goLive). Returns the patch that makes the
// design live.
export const publishDesign = async (
  approved: Design,
  { call, save }: PublishDeps
): Promise<Partial<Design>> => {
  const hidden = approved.approval?.run !== undefined;
  const [shop] = find(shopSchema, await call("ecommerce_get-current-shop", {}));
  if (shop === undefined) {
    throw new PublishRefusedError("Couldn't read the shop's address.");
  }
  const page = (kind: "collections" | "products", slug: string | undefined) =>
    slug === undefined
      ? undefined
      : new URL(`/${kind}/${slug}`, shop.baseUrl).href;

  const design = await createOffers(approved, { call, save });
  const products = productsOf(design);
  const offerIds = products.flatMap((product) => product.offerId ?? []);
  await Promise.all(
    products.map(async ({ offerId, quote }) => {
      await checkedCall(call, "ecommerce_bulk-update-offer-variant-prices", {
        offerId,
        price: quote.price,
      });
      if (!hidden && offerId !== undefined) {
        await makePublic(call, offerId);
      }
    })
  );
  const [offers, collection] = await Promise.all([
    call("ecommerce_get-offers-by-ids", { offerIds }),
    design.range.length > 0
      ? publishCollection(design, offerIds, { call, save }, !hidden)
      : undefined,
  ]);
  const slugs = new Map(
    find(offerSchema, offers).map((offer) => [offer.id, offer.slug])
  );
  const productPage = (offerId: string | undefined) =>
    page("products", offerId === undefined ? undefined : slugs.get(offerId));
  const productUrl =
    collection === undefined
      ? productPage(design.productId)
      : page("collections", collection.slug);
  if (productUrl === undefined) {
    console.warn("publish_design: no page address in Fourthwall's reply");
  }
  return {
    ...(collection === undefined
      ? {}
      : { collectionId: collection.collectionId }),
    ...(hidden ? { hidden: true } : {}),
    ...(productUrl === undefined ? {} : { productUrl }),
    range: design.range.map((product) => {
      const url = productPage(product.offerId);
      return url === undefined ? product : { ...product, productUrl: url };
    }),
  };
};

// Go live for a design autopilot published hidden: every product and the
// drop's collection made public. Runs only after the merchant confirmed the
// launch on wovain's confirm page.
export const goLive = async (design: Design, { call, save }: PublishDeps) => {
  const offerIds = productsOf(design).flatMap(
    (product) => product.offerId ?? []
  );
  await Promise.all(
    offerIds.map(async (offerId) => {
      await makePublic(call, offerId);
    })
  );
  if (design.range.length > 0) {
    await publishCollection(design, offerIds, { call, save });
  }
};

// Makes every hidden drop in `designs` public, recording each as it goes.
export const goLiveHidden = async (
  designs: Design[],
  {
    call,
    save,
  }: {
    call: FourthwallCall;
    save: (id: string, patch: Partial<Design>) => Promise<unknown>;
  }
) => {
  const showOne = async (design: Design) => {
    const saveOne = async (patch: Partial<Design>) =>
      await save(design.id, patch);
    await goLive(design, { call, save: saveOne });
    await saveOne({ hidden: false });
  };
  await Promise.all(
    designs.flatMap((design) =>
      design.hidden === true ? [showOne(design)] : []
    )
  );
};

// The hidden drops a launch would make public, exactly: each design with its
// offers and collection. The launch confirm page pins this list.
export const hiddenDrops = (designs: Design[]) =>
  designs
    .flatMap((design) =>
      design.hidden === true
        ? [
            {
              collectionId: design.collectionId ?? null,
              id: design.id,
              offerIds: productsOf(design).map(
                (product) => product.offerId ?? null
              ),
            },
          ]
        : []
    )
    .toSorted((a, b) => a.id.localeCompare(b.id));
