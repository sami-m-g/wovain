import type { Firestore } from "firebase-admin/firestore";

// Where the optimizer keeps its records (spec section 8; shapes in
// @wovain/shared/optimizer/records). The top-level routing indexes and
// optimizerDue hold only a uid or flags: no merchant data.

// Ids that are safe as one Firestore path segment.
export const SHOP_ID = /^[\w-]{1,128}$/u;
export const AD_ACCOUNT_ID = /^\d{1,32}$/u;
export const USER_ID = /^[\w-]{1,128}$/u;

// Stored events and snapshots are deleted 30 days after they're written
// (TTL on expiresAt), so refunds can still land on a month-old day.
export const EVENT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const optimizerDocs = (db: Firestore) => {
  const state = (uid: string) =>
    db.collection("users").doc(uid).collection("optimization").doc("state");
  const sub = (uid: string, name: string) => state(uid).collection(name);
  return {
    actions: (uid: string) => sub(uid, "actions"),
    adAccount: (actId: string) => db.collection("metaAdAccounts").doc(actId),
    // Analytics reports, cached an hour (spec section 2, Polling).
    cache: (uid: string) => sub(uid, "cache"),
    diagnoses: (uid: string) => sub(uid, "diagnoses"),
    due: (uid: string) => db.collection("optimizerDue").doc(uid),
    dues: () => db.collection("optimizerDue"),
    events: (uid: string) => sub(uid, "events"),
    findings: (uid: string) => sub(uid, "findings"),
    hook: (uid: string, provider: "fourthwall" | "meta") =>
      state(uid).collection("hooks").doc(provider),
    inbox: (uid: string) => sub(uid, "inbox"),
    runs: (uid: string) => sub(uid, "runs"),
    shop: (shopId: string) => db.collection("fourthwallShops").doc(shopId),
    shops: () => db.collection("fourthwallShops"),
    snapshots: (uid: string) => sub(uid, "snapshots"),
    state,
    // trendCache/{nicheKey}/days/{date}: shared across merchants, no merchant data.
    trend: (nicheKey: string, date: string) =>
      db.collection("trendCache").doc(nicheKey).collection("days").doc(date),
  };
};
