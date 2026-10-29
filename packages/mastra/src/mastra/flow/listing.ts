import {
  draftListing,
  listingSchema,
  plainText,
  readListing,
  renderListing,
  trustLines,
  writeListing,
} from "@wovain/core/listing";
import type { Listing } from "@wovain/core/listing";
import { design } from "@wovain/db/schema/seller";
import { and, eq } from "drizzle-orm";

import type { Actor } from "./actor";
import { notFound } from "./actor";
import { withProvider } from "./connections";
import { writerStyleFor } from "./drop-style";
import { getProduct } from "./products";

// Product pages that sell (openspec store-management): wovain drafts the
// page, the Store shows it next to the current one as the buyer sees it,
// and the merchant's approval applies it through store.listing.edit.

const designOf = async (actor: Actor, designId: string) => {
  const row = await actor.db.query.design.findFirst({
    where: { id: designId, userId: actor.userId },
  });
  if (row === undefined) {
    throw notFound.product({ id: designId });
  }
  return row;
};

// The current page and a rewrite of it, for the preview. Nothing is
// written: the merchant approves the rewrite with editListing.
export const listingDraft = async (actor: Actor, productId: string) => {
  const row = await getProduct(actor, productId);
  const [designRow, current] = await Promise.all([
    designOf(actor, row.designId),
    withProvider(
      actor,
      "fourthwall",
      async (call) => await readListing(call, row.offerId)
    ),
  ]);
  const style = await writerStyleFor(actor, designRow.ideaId);
  const { brief } = designRow;
  const draft = await draftListing(
    actor.core.nemotron,
    {
      current,
      design: {
        description: brief.description,
        printedText: brief.printedText,
        title: brief.title,
      },
      style,
    },
    actor.log
  );
  return {
    current: {
      description: plainText(current.description),
      title: current.name,
    },
    image: row.mockups[0] ?? null,
    issues: draft.issues,
    price: row.price,
    proposed: draft.listing,
    // The lines the page adds under the benefits, as the buyer reads them.
    trust: trustLines({ shipping: current.shipping }),
  };
};

// What the approval's executor writes, and what undoing it writes back.
export interface ListingEdit {
  productId: string;
  name: string;
  // Fourthwall's HTML.
  description: string;
}

// The approved page, as Fourthwall's name and HTML description, with the
// page it replaces for the undo.
export const listingEdit = async (
  actor: Actor,
  productId: string,
  listing: Listing
) => {
  const parsed = listingSchema.parse(listing);
  const row = await getProduct(actor, productId);
  const current = await withProvider(
    actor,
    "fourthwall",
    async (call) => await readListing(call, row.offerId)
  );
  const next: ListingEdit = {
    description: renderListing(parsed, { shipping: current.shipping }),
    name: parsed.title,
    productId,
  };
  const previous: ListingEdit = {
    description: current.description,
    name: current.name,
    productId,
  };
  return { next, previous };
};

// The executor of an approved store.listing.edit: writes the page to
// Fourthwall, then keeps the Store's title in step with it.
export const applyListing = async (actor: Actor, edit: ListingEdit) => {
  const row = await getProduct(actor, edit.productId);
  await withProvider(
    actor,
    "fourthwall",
    async (call) =>
      await writeListing(call, row.offerId, {
        description: edit.description,
        name: edit.name,
      })
  );
  const designRow = await designOf(actor, row.designId);
  await actor.db
    .update(design)
    .set({ brief: { ...designRow.brief, title: edit.name } })
    .where(and(eq(design.id, row.designId), eq(design.userId, actor.userId)));
  return { name: edit.name };
};
