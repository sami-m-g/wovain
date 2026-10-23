import { fourthwallEventTypes } from "@wovain/shared/optimizer/events";
import { hookSchema, routeSchema } from "@wovain/shared/optimizer/records";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { z } from "zod";

import type { Cipher } from "../lib/cipher.ts";
import { optimizerDocs, SHOP_ID } from "./docs.ts";

// Registers the merchant's Fourthwall webhook when they turn the optimizer
// on, and removes it when they turn it off. Fourthwall's Platform API
// (POST /open-api/v1.0/webhooks) needs a token with `webhook_write`; whether
// #19's MCP grant is one is unverified (verify-mr1.md), so the caller passes
// the token it has. The webhook's secret is stored only encrypted, bound to
// its document.

const API = "https://api.fourthwall.com/open-api/v1.0";

const shopSchema = z.looseObject({ id: z.string().regex(SHOP_ID) });
const webhookSchema = z.looseObject({
  id: z.string().min(1).max(200),
  secret: z.string().min(16).max(500),
});

class RegistrationError extends Error {
  override name = "RegistrationError";
}

interface RegisterDeps {
  cipher: Cipher;
  db: Firestore;
  fetch?: typeof globalThis.fetch;
  site: string;
}

export const createRegistrar = ({
  cipher,
  db,
  fetch = globalThis.fetch,
  site,
}: RegisterDeps) => {
  const docs = optimizerDocs(db);

  const api = async (token: string, path: string, init: RequestInit = {}) => {
    const response = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      // The status only: Fourthwall's error body may echo request data.
      throw new RegistrationError(
        `Fourthwall answered ${String(response.status)} on ${init.method ?? "GET"} ${path}`
      );
    }
    const body: unknown =
      response.status === 204 ? undefined : await response.json();
    return body;
  };

  // Throws when the shop already routes to another merchant.
  const claim = async (
    tx: Transaction | undefined,
    uid: string,
    shopId: string
  ) => {
    const ref = docs.shop(shopId);
    const doc = await (tx === undefined ? ref.get() : tx.get(ref));
    const owner = doc.exists ? routeSchema.parse(doc.data()).uid : uid;
    if (owner !== uid) {
      throw new RegistrationError(
        "This Fourthwall shop is already connected to another wovain account."
      );
    }
    return ref;
  };

  const enable = async (uid: string, token: string) => {
    const shop = shopSchema.parse(await api(token, "/shops/current"));
    // Checked before Fourthwall is asked, and again where it's written.
    await claim(undefined, uid, shop.id);
    const created = webhookSchema.parse(
      await api(token, "/webhooks", {
        body: JSON.stringify({
          allowedTypes: fourthwallEventTypes,
          url: `${site}/webhooks/fourthwall`,
        }),
        method: "POST",
      })
    );
    const hookRef = docs.hook(uid, "fourthwall");
    const hook = hookSchema.parse({
      provider: "fourthwall",
      secretCiphertext: await cipher.encrypt(created.secret, hookRef.path),
      status: "registered",
      webhookId: created.id,
    });
    try {
      await db.runTransaction(async (tx) => {
        const shopRef = await claim(tx, uid, shop.id);
        tx.set(hookRef, hook);
        tx.set(shopRef, { uid });
        tx.set(docs.due(uid), { enabled: true }, { merge: true });
      });
    } catch (error) {
      // Another merchant claimed the shop meanwhile: drop the new webhook.
      await api(token, `/webhooks/${encodeURIComponent(created.id)}`, {
        method: "DELETE",
      });
      throw error;
    }
    return { shopId: shop.id, webhookId: created.id };
  };

  // Turns intake off first, so nothing lands while Fourthwall is called.
  const disable = async (uid: string, token: string) => {
    const shops = await docs.shops().where("uid", "==", uid).get();
    const hookRef = docs.hook(uid, "fourthwall");
    const doc = await hookRef.get();
    const webhookId = doc.exists
      ? hookSchema.parse(doc.data()).webhookId
      : undefined;
    const batch = db.batch();
    for (const shop of shops.docs) {
      batch.delete(shop.ref);
    }
    batch.set(docs.due(uid), { enabled: false }, { merge: true });
    batch.set(hookRef, { provider: "fourthwall", status: "off" });
    await batch.commit();
    if (webhookId !== undefined) {
      await api(token, `/webhooks/${encodeURIComponent(webhookId)}`, {
        method: "DELETE",
      });
    }
  };

  return { disable, enable };
};
