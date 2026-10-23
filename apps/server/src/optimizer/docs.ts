import type { Firestore } from "firebase-admin/firestore";

// Where the optimizer keeps its records (spec section 8; shapes in
// @wovain/shared/optimizer/records). The top-level routing indexes and
// optimizerDue hold only a uid or flags: no merchant data.

// Ids that are safe as one Firestore path segment.
export const SHOP_ID = /^[\w-]{1,128}$/u;
export const AD_ACCOUNT_ID = /^\d{1,32}$/u;
export const USER_ID = /^[\w-]{1,128}$/u;

// Stored events are deleted 30 days after they arrive (TTL on expiresAt).
export const EVENT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const optimizerDocs = (db: Firestore) => {
  const state = (uid: string) =>
    db.collection("users").doc(uid).collection("optimization").doc("state");
  return {
    adAccount: (actId: string) => db.collection("metaAdAccounts").doc(actId),
    due: (uid: string) => db.collection("optimizerDue").doc(uid),
    events: (uid: string) => state(uid).collection("events"),
    hook: (uid: string, provider: "fourthwall" | "meta") =>
      state(uid).collection("hooks").doc(provider),
    shop: (shopId: string) => db.collection("fourthwallShops").doc(shopId),
    shops: () => db.collection("fourthwallShops"),
    state,
  };
};
