import {
  createOffer,
  findOffer,
  previewDesign,
  pickBlank,
  publishProduct,
  searchCatalog,
  setOfferPrice,
  uploadArtwork,
} from "@wovain/core/fourthwall";
import { priceFor, pricingRules, sizePrices } from "@wovain/core/pricing";
import { setSizePrices } from "@wovain/core/store";
import { product } from "@wovain/db/schema/seller";
import { and, desc, eq } from "drizzle-orm";

import type { Actor } from "./actor";
import { notFound, notReady } from "./actor";
import { withProvider } from "./connections";
import { getDesign } from "./designs";
import { flagContextOf } from "./flags";
import { once } from "./once";
import { previewKey, variantsFor } from "./variants";

// An approved design becomes a Fourthwall product: the art goes to the
// shop's media library, the product is created hidden at wovain's price, and
// publishing makes it public.
//
// Each Fourthwall write is keyed (./once), and so is the product row: a
// retried call, or a run step retried after a crash, makes one product.

export const browseCatalog = async (actor: Actor, query?: string) =>
  await withProvider(
    actor,
    "fourthwall",
    async (call) =>
      await searchCatalog(call, query === undefined ? {} : { query })
  );

export interface ProductInput {
  catalogProductId?: string | undefined;
  designId: string;
  // The caller's request ID; one product per design and blank without it.
  requestId?: string | undefined;
}

const byKey = async ({ db, userId }: Actor, key: string) =>
  await db.query.product.findFirst({
    where: { idempotencyKey: key, userId },
  });

export const createDesignProduct = async (
  actor: Actor,
  { catalogProductId, designId, requestId }: ProductInput
) => {
  // Keys are global: the merchant's ID keeps a request ID theirs alone.
  const key = `product:${actor.userId}:${requestId ?? `${designId}:${catalogProductId ?? "auto"}`}`;
  const made = await byKey(actor, key);
  if (made !== undefined) {
    return made;
  }
  const approved = await getDesign(actor, designId);
  if (approved.status !== "approved") {
    throw notReady({
      fix: "Approve the design before creating its product.",
      message: "The design isn't approved",
    });
  }
  const write = { runId: approved.runId };
  const bySize = await actor.core.flags.isOn(
    "store-management",
    flagContextOf(actor)
  );
  const created = await withProvider(actor, "fourthwall", async (call) => {
    const blank = await pickBlank(call, {
      defaultProductId: actor.core.defaultCatalogProductId,
      ...(catalogProductId === undefined
        ? {}
        : { productId: catalogProductId }),
    });
    // A second upload only adds a copy to the media library, but keying it
    // keeps the product on the first one.
    const mediaUri = await once(actor, {
      ...write,
      key: `${key}:media`,
      operation: "upload_artwork",
      perform: async () =>
        await uploadArtwork(call, {
          height: approved.artworkHeight,
          url: approved.artworkUrl,
          width: approved.artworkWidth,
        }),
      provider: "fourthwall",
    });
    const variants = await variantsFor(actor, call, {
      garmentColors: approved.brief.garmentColors,
      slug: blank.slug,
    });
    const preview = await once(actor, {
      ...write,
      key: previewKey(`${key}:preview`, variants),
      operation: "preview_design",
      perform: async () =>
        await previewDesign(call, {
          catalogProductId: blank.id,
          mediaUri,
          region: blank.region,
          ...variants,
        }),
      provider: "fourthwall",
    });
    const { title } = approved.brief;
    const offerId = await once(actor, {
      ...write,
      key: `${key}:offer`,
      operation: "create_offer",
      perform: async () =>
        await createOffer(call, {
          customizationId: preview.customizationId,
          description: approved.brief.description,
          title,
        }),
      provider: "fourthwall",
      recover: async () =>
        await findOffer(call, {
          customizationId: preview.customizationId,
          title,
        }),
    });
    const price = priceFor(blank.baseCost ?? pricingRules().defaultBaseCost);
    // With store-management on, larger sizes carry their surcharge
    // (PRICING_RULES sizeSurcharges); otherwise one price on every size.
    await (bySize
      ? setSizePrices(call, offerId, price, sizePrices(price))
      : setOfferPrice(call, offerId, price));
    return {
      ...preview,
      catalogProductId: blank.id,
      mediaUri,
      offerId,
      price,
    };
  });
  await actor.db
    .insert(product)
    .values({
      ...created,
      designId,
      idempotencyKey: key,
      userId: actor.userId,
    })
    .onConflictDoNothing({ target: product.idempotencyKey });
  const row = await byKey(actor, key);
  if (row === undefined) {
    throw new Error("The product wasn't saved");
  }
  return row;
};

export const getProduct = async ({ db, userId }: Actor, id: string) => {
  const row = await db.query.product.findFirst({ where: { id, userId } });
  if (row === undefined) {
    throw notFound.product({ id });
  }
  return row;
};

// Publishing twice is harmless: the product is already public.
export const publishDesignProduct = async (actor: Actor, id: string) => {
  const hidden = await getProduct(actor, id);
  if (hidden.status === "public" && hidden.productUrl !== null) {
    return hidden;
  }
  if (hidden.status === "retired") {
    throw notReady({
      fix: "A retired product is archived on Fourthwall: make a new one from its design.",
      message: "The product is retired",
    });
  }
  const productUrl = await withProvider(
    actor,
    "fourthwall",
    async (call) => await publishProduct(call, hidden.offerId)
  );
  const [row] = await actor.db
    .update(product)
    .set({ productUrl, status: "public" })
    .where(and(eq(product.id, id), eq(product.userId, actor.userId)))
    .returning();
  return row ?? { ...hidden, productUrl, status: "public" as const };
};

export const listProducts = async ({ db, userId }: Actor) =>
  await db
    .select()
    .from(product)
    .where(eq(product.userId, userId))
    .orderBy(desc(product.createdAt));
