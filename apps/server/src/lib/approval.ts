import { createHash } from "node:crypto";

import { dropProducts, lowPrints } from "@wovain/shared/design";
import type { Design } from "@wovain/shared/design";

import type { Store } from "../store.ts";

// A claim older than this belongs to a publish that died; a new one may take
// over (the retry reuses every product already created).
const CLAIM_TTL_MS = 10 * 60 * 1000;

// What the merchant approved: every product's customization, price and
// listing, and the drop's name. Any redraw that changes them changes this.
export const designHash = (design: Design) =>
  createHash("sha256")
    .update(
      JSON.stringify({
        dropName: design.dropName ?? null,
        products: dropProducts(design).map((product) => [
          product.customizationId,
          product.quote.price,
          product.listing.title,
          product.listing.description,
        ]),
      })
    )
    .digest("hex");

const withoutApproval = ({ approval: _approval, ...design }: Design) => design;

// Whether a design can be approved as it is now; the reason when not.
export const notApprovable = (design: Design) => {
  if (design.status !== "draft" && design.status !== "rejected") {
    return `Design ${design.id} is ${design.status}.`;
  }
  return lowPrints(design).length > 0
    ? `Design ${design.id} has a print that would come out blurry.`
    : undefined;
};

// Records the merchant's approval of the exact content `hash` names.
// Server-side only: the confirm page calls it after the merchant signed in
// in the browser and pressed Confirm (a later autopilot can call it the same
// way). No tool reaches it.
export const approveDesign = async (
  store: Store,
  id: string,
  hash: string,
  now = new Date()
) =>
  await store.replaceDesign(id, (design) => {
    const refused = notApprovable(design);
    if (refused !== undefined) {
      throw new Error(refused);
    }
    if (designHash(design) !== hash) {
      throw new Error(`Design ${id} changed after the link was made.`);
    }
    return {
      ...design,
      approval: { at: now.toISOString(), hash },
      status: "publishing",
    };
  });

// Takes the approval for one publish, in one transaction: the design must be
// approved exactly as it is now, and no other publish may hold it. Returns
// the stored design, with every offer id created so far.
export const claimPublish = async (
  store: Store,
  id: string,
  now = new Date()
) =>
  await store.replaceDesign(id, (design) => {
    const { approval } = design;
    if (
      design.status !== "publishing" ||
      approval === undefined ||
      approval.hash !== designHash(design)
    ) {
      throw new Error(
        `Design ${id} isn't approved as it is now: the merchant approves it on its widget first.`
      );
    }
    if (
      approval.claimedAt !== undefined &&
      now.getTime() - Date.parse(approval.claimedAt) < CLAIM_TTL_MS
    ) {
      throw new Error(`Design ${id} is already being published.`);
    }
    return {
      ...design,
      approval: { ...approval, claimedAt: now.toISOString() },
    };
  });

// Gives the claim back without using the approval (to reconnect Fourthwall).
export const releaseClaim = async (store: Store, id: string) =>
  await store.replaceDesign(id, (design) => {
    if (design.approval === undefined) {
      return design;
    }
    const { claimedAt: _claimedAt, ...approval } = design.approval;
    return { ...design, approval };
  });

// Ends a publish that failed. Only Fourthwall's own refusals count toward
// the widget's fallback to Fourthwall's designer; the approval is used up.
export const rejectDesign = async (
  store: Store,
  id: string,
  { counted, reason }: { counted: boolean; reason: string }
) =>
  await store.replaceDesign(id, (design) => ({
    ...withoutApproval(design),
    rejectCount: design.rejectCount + (counted ? 1 : 0),
    rejectReason: reason,
    status: "rejected",
  }));
