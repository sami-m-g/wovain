import { createHash } from "node:crypto";

import type { Firestore } from "firebase-admin/firestore";
import { z } from "zod";

// metaDrafts/{userId}: every object wovain staged in the merchant's Meta
// draft through campaign_draft, from Meta's own replies. Later draft calls
// may only build on these, and launch_campaign publishes only these.
const stagedSchema = z.object({
  adAccountId: z.string(),
  // Each ad set with the targeting, promoted object and goal wovain sent,
  // as canonical JSON.
  adSets: z.array(
    z.object({
      countries: z.array(z.string()),
      id: z.string(),
      optimizationGoal: z.string(),
      promotedObject: z.string(),
      targeting: z.string(),
    })
  ),
  ads: z.array(
    z.object({ adSetId: z.string(), creativeId: z.string(), id: z.string() })
  ),
  campaignId: z.string(),
  creatives: z.array(
    z.object({
      id: z.string(),
      imageHash: z.string(),
      linkUrl: z.string(),
      pageId: z.string(),
      videoId: z.string(),
    })
  ),
  // Set once the merchant is asked to confirm the launch: the draft can't
  // change after that.
  frozen: z.boolean().default(false),
  images: z.array(z.string()),
  videos: z.array(z.string()),
});
export type Staged = z.infer<typeof stagedSchema>;
type Args = Record<string, unknown>;

// The first value under one of `keys` anywhere in a Meta reply ("id" only
// at the top, where it can't be a nested object's).
const idIn = (
  reply: unknown,
  keys: ReadonlySet<string>,
  top = true
): string | undefined => {
  if (typeof reply !== "object" || reply === null) {
    return undefined;
  }
  const entries = Object.entries(reply);
  const own: unknown = entries.find(
    ([key]) => keys.has(key) && (key !== "id" || top)
  )?.[1];
  if (typeof own === "string" && /^\w{1,64}$/u.test(own)) {
    return own;
  }
  return entries
    .map(([, item]) => idIn(item, keys, false))
    .find((found) => found !== undefined);
};

// JSON with sorted keys, so two specs compare equal however they were
// written. A string is parsed first (Meta takes and returns specs as JSON).
const sorted = (item: unknown): unknown => {
  if (Array.isArray(item)) {
    return item.map((entry) => sorted(entry));
  }
  if (typeof item !== "object" || item === null) {
    return item;
  }
  return Object.fromEntries(
    Object.entries(item)
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => [key, sorted(entry)])
  );
};

export const canonicalJson = (value: unknown): string => {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = value;
    }
  }
  return JSON.stringify(sorted(parsed ?? null));
};

// The staged record the merchant approves: a hash of everything in it.
export const snapshotOf = ({ frozen: _frozen, ...staged }: Staged) =>
  createHash("sha256").update(canonicalJson(staged)).digest("base64url");

const countriesOf = (targeting: unknown) =>
  z
    .object({ geo_locations: z.object({ countries: z.array(z.string()) }) })
    .safeParse(
      typeof targeting === "string" ? JSON.parse(targeting) : targeting
    ).data?.geo_locations.countries ?? [];

const creativeIdOf = (creative: unknown) =>
  z
    .object({ creative_id: z.string() })
    .safeParse(typeof creative === "string" ? JSON.parse(creative) : creative)
    .data?.creative_id ?? "";

// What one successful draft call adds to the record, from the arguments
// wovain sent and Meta's reply; undefined when the reply has no ID.
const additions: Record<
  string,
  (sent: Args, reply: unknown) => Partial<Staged> | undefined
> = {
  ads_create_ad: (sent, reply) => {
    const id = idIn(reply, new Set(["ad_id", "id"]));
    return id === undefined
      ? undefined
      : {
          ads: [
            {
              adSetId: String(sent["ad_set_id"]),
              creativeId: creativeIdOf(sent["creative"]),
              id,
            },
          ],
        };
  },
  ads_create_ad_set: (sent, reply) => {
    const id = idIn(reply, new Set(["ad_set_id", "adset_id", "id"]));
    return id === undefined
      ? undefined
      : {
          adSets: [
            {
              countries: countriesOf(sent["targeting"]),
              id,
              optimizationGoal: String(sent["optimization_goal"]),
              promotedObject: canonicalJson(sent["promoted_object"]),
              targeting: canonicalJson(sent["targeting"]),
            },
          ],
        };
  },
  ads_create_creative: (sent, reply) => {
    const id = idIn(reply, new Set(["creative_id", "id"]));
    return id === undefined
      ? undefined
      : {
          creatives: [
            {
              id,
              imageHash: String(sent["image_hash"]),
              linkUrl: String(sent["link_url"]),
              pageId: String(sent["page_id"]),
              videoId: String(sent["video_id"]),
            },
          ],
        };
  },
  ads_creative_upload_media: (sent, reply) => {
    if (sent["media_type"] === "VIDEO") {
      const id = idIn(reply, new Set(["video_id", "id"]));
      return id === undefined ? undefined : { videos: [id] };
    }
    const hash = idIn(reply, new Set(["image_hash", "hash"]));
    return hash === undefined ? undefined : { images: [hash] };
  },
};

export const createStagedObjects = (db: Firestore) => {
  const doc = (userId: string) => db.collection("metaDrafts").doc(userId);
  const get = async (userId: string): Promise<Staged | undefined> => {
    const snapshot = await doc(userId).get();
    return snapshot.exists ? stagedSchema.parse(snapshot.data()) : undefined;
  };

  // Records what a successful draft call staged, from Meta's reply; a new
  // campaign starts a new record. Returns the ID it recorded, or "" when the
  // reply had none.
  const record = async (
    userId: string,
    tool: string,
    sent: Args,
    reply: unknown
  ) => {
    if (tool === "ads_create_campaign") {
      const campaignId = idIn(reply, new Set(["campaign_id"])) ?? "";
      if (campaignId !== "") {
        await doc(userId).set({
          adAccountId: String(sent["ad_account_id"]),
          adSets: [],
          ads: [],
          campaignId,
          creatives: [],
          frozen: false,
          images: [],
          videos: [],
        });
      }
      return campaignId;
    }
    const added = additions[tool]?.(sent, reply);
    if (added === undefined) {
      return "";
    }
    await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(doc(userId));
      const current = stagedSchema.parse(snapshot.data());
      tx.set(doc(userId), {
        ...current,
        adSets: [...current.adSets, ...(added.adSets ?? [])],
        ads: [...current.ads, ...(added.ads ?? [])],
        creatives: [...current.creatives, ...(added.creatives ?? [])],
        images: [...current.images, ...(added.images ?? [])],
        videos: [...current.videos, ...(added.videos ?? [])],
      });
    });
    return "recorded";
  };

  // No more draft changes for this campaign: a launch confirmation exists.
  const freeze = async (userId: string) => {
    await doc(userId).update({ frozen: true });
  };

  return { freeze, get, record };
};
