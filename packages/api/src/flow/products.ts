import {
  createProduct,
  publishProduct,
  searchCatalog,
  uploadArtwork,
} from "@wovain/core/fourthwall";
import { DEFAULT_BASE_COST, priceFor } from "@wovain/core/pricing";
import { product } from "@wovain/db/schema/seller";
import { and, desc, eq } from "drizzle-orm";

import type { Actor } from "./actor";
import { notFound, notReady } from "./actor";
import { withProvider } from "./connections";
import { getDesign } from "./designs";

// An approved design becomes a Fourthwall product: the art goes to the
// shop's media library, the product is created hidden at wovain's price, and
// publishing makes it public.

export const browseCatalog = async (actor: Actor, query?: string) =>
  await withProvider(
    actor,
    "fourthwall",
    async (call) =>
      await searchCatalog(call, query === undefined ? {} : { query })
  );

export const createDesignProduct = async (
  actor: Actor,
  {
    catalogProductId,
    designId,
  }: { catalogProductId?: string | undefined; designId: string }
) => {
  const approved = await getDesign(actor, designId);
  if (approved.status !== "approved") {
    throw notReady(
      "The design isn't approved",
      "Approve the design before creating its product."
    );
  }
  const created = await withProvider(actor, "fourthwall", async (call) => {
    const [blank] = await searchCatalog(
      call,
      catalogProductId === undefined ? {} : { productId: catalogProductId }
    );
    if (blank === undefined) {
      throw notReady(
        "No Fourthwall blank can render this design",
        "Pick another catalog product."
      );
    }
    const mediaUri = await uploadArtwork(call, {
      height: approved.artworkHeight,
      url: approved.artworkUrl,
      width: approved.artworkWidth,
    });
    const price = priceFor(blank.baseCost ?? DEFAULT_BASE_COST);
    const made = await createProduct(call, {
      catalogProductId: blank.id,
      description: approved.brief.description,
      mediaUri,
      price,
      region: blank.region,
      title: approved.brief.title,
    });
    return { ...made, catalogProductId: blank.id, mediaUri, price };
  });
  const [row] = await actor.db
    .insert(product)
    .values({ ...created, designId, userId: actor.userId })
    .returning();
  if (row === undefined) {
    throw new Error("The product wasn't saved");
  }
  return row;
};

export const getProduct = async ({ db, userId }: Actor, id: string) => {
  const [row] = await db
    .select()
    .from(product)
    .where(and(eq(product.id, id), eq(product.userId, userId)));
  if (row === undefined) {
    throw notFound("product", id);
  }
  return row;
};

export const publishDesignProduct = async (actor: Actor, id: string) => {
  const hidden = await getProduct(actor, id);
  const productUrl = await withProvider(
    actor,
    "fourthwall",
    async (call) => await publishProduct(call, hidden.offerId)
  );
  const [row] = await actor.db
    .update(product)
    .set({ productUrl, status: "public" })
    .where(eq(product.id, id))
    .returning();
  return row ?? { ...hidden, productUrl, status: "public" as const };
};

export const listProducts = async ({ db, userId }: Actor) =>
  await db
    .select()
    .from(product)
    .where(eq(product.userId, userId))
    .orderBy(desc(product.createdAt));
