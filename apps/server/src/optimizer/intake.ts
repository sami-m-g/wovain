import {
  fourthwallEventKey,
  fourthwallEventSchema,
  fourthwallFields,
  metaChanges,
  metaWebhookSchema,
} from "@wovain/shared/optimizer/events";
import type { StoredEvent } from "@wovain/shared/optimizer/events";
import { hookSchema, routeSchema } from "@wovain/shared/optimizer/records";
import type { DocumentReference, Firestore } from "firebase-admin/firestore";

import type { Cipher } from "../lib/cipher.ts";
import { parseJson } from "../lib/reply-json.ts";
import { taskName } from "../lib/tasks.ts";
import type { TaskQueue } from "../lib/tasks.ts";
import { AD_ACCOUNT_ID, optimizerDocs, SHOP_ID } from "./docs.ts";
import { fourthwallSigned, metaSigned } from "./signatures.ts";
import { storeEventOnce } from "./store.ts";

// Webhook intake: verify the signature on the raw body, route to a
// merchant, store each event once, and queue one debounced run per merchant
// and window. It never calls upstream, so it answers in milliseconds
// (Fourthwall counts a reply slower than 2 s as failed).

export interface IntakeDeps {
  cipher: Cipher | undefined;
  // Keys the buyer's per-shop customer key (OPTIMIZER_CUSTOMER_KEY). Without
  // it Fourthwall events are refused rather than stored with a weaker key.
  customerKey: string | undefined;
  db: Firestore;
  debounceSeconds: number;
  // A Fourthwall Platform App's HMAC key (X-Fourthwall-Hmac-Apps-SHA256).
  fourthwallAppKey?: string | undefined;
  metaAppSecret?: string | undefined;
  now?: () => number;
  tasks: TaskQueue;
}

export interface IntakeReply {
  // What happened, for the response body; never merchant data.
  note: string;
  status: 200 | 400 | 401 | 404 | 503;
}

const reply = (status: IntakeReply["status"], note: string): IntakeReply => ({
  note,
  status,
});

const SECRET_CACHE_MS = 60_000;
const FAILURE_WINDOW_MS = 60_000;
const MAX_FAILURES = 10;
// Bounds the in-memory caches; past it they start over.
const MAX_CACHED = 5000;

// A Meta change's value is kept only while it's small (status changes are).
const MAX_META_VALUE_CHARS = 2000;

const uidOf = async (ref: DocumentReference) => {
  const doc = await ref.get();
  return doc.exists ? routeSchema.parse(doc.data()).uid : undefined;
};

const boundedValue = (value: unknown) =>
  JSON.stringify(value ?? null).length <= MAX_META_VALUE_CHARS
    ? value
    : undefined;

export const createIntake = ({
  cipher,
  customerKey,
  db,
  debounceSeconds,
  fourthwallAppKey,
  metaAppSecret,
  now = Date.now,
  tasks,
}: IntakeDeps) => {
  const docs = optimizerDocs(db);

  // The shop's own webhook secret, decrypted; bound to its document path.
  // Kept a minute per merchant, so deliveries are checked against the cached
  // secret and a flood of forgeries can't turn into one KMS decrypt each.
  const secrets = new Map<string, { secret?: string; until: number }>();
  const cachedSecret = (uid: string) => {
    const cached = secrets.get(uid);
    return cached !== undefined && cached.until > now() ? cached : undefined;
  };
  // "" when the secret won't decrypt (another key, a copied document, KMS
  // down): an empty secret signs nothing (fourthwallSigned).
  const open = async (sealed: string, path: string) => {
    try {
      return await (cipher?.decrypt(sealed, path) ?? "");
    } catch {
      return "";
    }
  };
  const loadSecret = async (uid: string) => {
    const ref = docs.hook(uid, "fourthwall");
    const doc = await ref.get();
    const sealed = doc.exists
      ? hookSchema.parse(doc.data()).secretCiphertext
      : undefined;
    const secret = sealed === undefined ? "" : await open(sealed, ref.path);
    if (secrets.size >= MAX_CACHED) {
      secrets.clear();
    }
    // A failed decrypt isn't cached, so it's retried; the throttle bounds
    // how often.
    if (sealed === undefined || secret !== "") {
      secrets.set(uid, { secret, until: now() + SECRET_CACHE_MS });
    }
    return secret;
  };

  // Merchants whose cache-miss checks failed too often this minute: their
  // secret isn't loaded again until the minute is over. Only cache misses
  // are throttled, so a valid delivery still passes against the cache.
  const failures = new Map<string, { count: number; since: number }>();
  const throttled = (uid: string) => {
    const seen = failures.get(uid);
    return (
      seen !== undefined &&
      seen.since + FAILURE_WINDOW_MS > now() &&
      seen.count >= MAX_FAILURES
    );
  };
  const failed = (uid: string) => {
    const seen = failures.get(uid);
    const fresh = seen === undefined || seen.since + FAILURE_WINDOW_MS <= now();
    if (failures.size >= MAX_CACHED) {
      failures.clear();
    }
    failures.set(
      uid,
      fresh ? { count: 1, since: now() } : { ...seen, count: seen.count + 1 }
    );
  };

  // The shop's own signature: against the cached secret when there is one,
  // otherwise by loading it, unless loads are throttled.
  const signedByShop = async (uid: string, raw: string, header?: string) => {
    const cached = cachedSecret(uid);
    if (cached !== undefined) {
      return fourthwallSigned(raw, header, cached.secret);
    }
    if (throttled(uid)) {
      return false;
    }
    const ok = fourthwallSigned(raw, header, await loadSecret(uid));
    if (!ok) {
      failed(uid);
    }
    return ok;
  };

  // The merchant a delivery comes from, or undefined when it isn't signed
  // by them. A valid Platform App signature is checked first and skips the
  // per-shop path and its throttle. An unknown shop and a bad signature look
  // the same to the sender.
  const senderOf = async (
    raw: string,
    shopId: string,
    headers: { apps?: string | undefined; shop?: string | undefined }
  ): Promise<string | undefined> => {
    const byApp = fourthwallSigned(raw, headers.apps, fourthwallAppKey);
    const uid = SHOP_ID.test(shopId)
      ? await uidOf(docs.shop(shopId))
      : undefined;
    const signed =
      uid !== undefined &&
      (byApp || (await signedByShop(uid, raw, headers.shop)));
    return signed ? uid : undefined;
  };

  const storeOnce = async (uid: string, event: StoredEvent) =>
    await storeEventOnce(db, uid, event);

  // One task per merchant per fixed window, run just after it closes.
  const scheduleRun = async (uid: string) => {
    const windowMs = debounceSeconds * 1000;
    const window = Math.floor(now() / windowMs);
    await tasks.enqueue({
      body: { reason: "event", uid },
      name: taskName(uid, "run", window),
      path: "/tasks/optimizer/run",
      scheduleAt: (window + 1) * windowMs + 10_000,
    });
  };

  const fourthwall = async (
    raw: string,
    headers: { apps?: string | undefined; shop?: string | undefined }
  ): Promise<IntakeReply> => {
    if (customerKey === undefined) {
      return reply(503, "not configured");
    }
    const parsed = fourthwallEventSchema.safeParse(parseJson(raw));
    if (!parsed.success) {
      return reply(400, "unreadable");
    }
    const event = parsed.data;
    const uid = await senderOf(raw, event.shopId, headers);
    if (uid === undefined) {
      return reply(401, "unauthorized");
    }
    const stored = await storeOnce(uid, {
      externalId: event.id,
      fields: fourthwallFields(event, customerKey),
      key: fourthwallEventKey(event.id),
      receivedAt: now(),
      source: "fourthwall",
      testMode: event.testMode,
      type: event.type,
    });
    if (!stored) {
      return reply(200, "duplicate");
    }
    if (event.type === "PLATFORM_APP_DISCONNECTED") {
      await docs.shop(event.shopId).delete();
    } else if (!event.testMode) {
      await scheduleRun(uid);
    }
    return reply(200, "stored");
  };

  const routesFor = async (accountIds: string[]) =>
    new Map(
      await Promise.all(
        [...new Set(accountIds)].map(
          async (id) =>
            [
              id,
              AD_ACCOUNT_ID.test(id)
                ? await uidOf(docs.adAccount(id))
                : undefined,
            ] as const
        )
      )
    );

  // A delivery holds up to 1000 changes across ad accounts; each is routed
  // on its own, and changes for accounts nobody registered are dropped.
  const meta = async (
    raw: string,
    signature: string | undefined
  ): Promise<IntakeReply> => {
    if (!metaSigned(raw, signature, metaAppSecret)) {
      return reply(401, "bad signature");
    }
    const parsed = metaWebhookSchema.safeParse(parseJson(raw));
    if (!parsed.success) {
      return reply(400, "unreadable");
    }
    if (parsed.data.object !== "ad_account") {
      return reply(200, "ignored");
    }
    const changes = metaChanges(parsed.data);
    const routes = await routesFor(changes.map((change) => change.accountId));
    const stored = await Promise.all(
      changes.map(async ({ accountId, field, key, objectId, value }) => {
        const uid = routes.get(accountId);
        const fresh =
          uid !== undefined &&
          (await storeOnce(uid, {
            fields: {
              accountId,
              field,
              kind: "meta",
              objectId,
              value: boundedValue(value),
            },
            key,
            receivedAt: now(),
            source: "meta",
            testMode: false,
            type: field,
          }));
        return fresh ? uid : undefined;
      })
    );
    const uids = new Set(stored.filter((uid) => uid !== undefined));
    await Promise.all(
      [...uids].map(async (uid) => {
        await scheduleRun(uid);
      })
    );
    return reply(200, "stored");
  };

  return { fourthwall, meta, scheduleRun };
};

export type Intake = ReturnType<typeof createIntake>;
