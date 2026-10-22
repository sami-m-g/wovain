import { createHash } from "node:crypto";

import type { Firestore } from "firebase-admin/firestore";
import { z } from "zod";

type Args = Record<string, unknown>;

// Every link, image hash and video ID a creative's arguments name: at the
// top, in multi_media or on carousel cards.
export const creativeMedia = (args: Args) => {
  const entries =
    z
      .array(z.record(z.string(), z.unknown()))
      .safeParse(args["multi_media"] ?? args["cards"] ?? []).data ?? [];
  const strings = (key: string) =>
    [args, ...entries].flatMap((entry) => {
      const value = entry[key];
      return typeof value === "string" ? [value] : [];
    });
  return {
    imageHashes: strings("image_hash"),
    links: [...strings("link_url"), ...strings("link")],
    videoIds: strings("video_id"),
  };
};

// One creative as wovain sent it: its shape, Page, CTA, links, uploaded
// media (image hashes and video IDs from Meta's upload replies), carousel
// cards in order, and its text and AI label as canonical JSON. Records from
// before the shapes (one video with a thumbnail) read as a video creative.
const creativeSchema = z.preprocess(
  (value) => {
    const legacy = z
      .object({
        id: z.string(),
        imageHash: z.string(),
        linkUrl: z.string(),
        pageId: z.string(),
        shape: z.never().optional(),
        videoId: z.string(),
      })
      .safeParse(value);
    return legacy.success
      ? {
          cards: [],
          copy: "",
          cta: "SHOP_NOW",
          id: legacy.data.id,
          imageHashes: [legacy.data.imageHash],
          linkUrl: legacy.data.linkUrl,
          pageId: legacy.data.pageId,
          shape: "video",
          videoIds: [legacy.data.videoId],
        }
      : value;
  },
  z.object({
    cards: z.array(
      z.object({
        headline: z.string(),
        imageHash: z.string(),
        link: z.string(),
      })
    ),
    copy: z.string(),
    cta: z.string(),
    id: z.string(),
    imageHashes: z.array(z.string()),
    linkUrl: z.string(),
    pageId: z.string(),
    shape: z.enum(["video", "image", "multi_media", "carousel"]),
    videoIds: z.array(z.string()),
  })
);
export type StagedCreative = z.infer<typeof creativeSchema>;

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
  creatives: z.array(creativeSchema),
  // Set once the merchant is asked to confirm the launch: the draft can't
  // change after that.
  frozen: z.boolean().default(false),
  images: z.array(z.string()),
  videos: z.array(z.string()),
});
export type Staged = z.infer<typeof stagedSchema>;

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

// What the merchant approves: a hash of everything in the staged record
// (every creative with its shape, media, links, cards, CTA and text, and
// every ad) and of every approved concept in the plan, so a concept revised
// after the confirmation also stops the launch.
export const snapshotOf = (
  { frozen: _frozen, ...staged }: Staged,
  concepts: unknown
) =>
  createHash("sha256")
    .update(canonicalJson({ concepts, staged }))
    .digest("base64url");

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

const cardsOf = (cards: unknown) =>
  z
    .array(
      z.object({
        headline: z.string(),
        image_hash: z.string(),
        link: z.string(),
      })
    )
    .safeParse(cards)
    .data?.map((card) => ({
      headline: card.headline,
      imageHash: card.image_hash,
      link: card.link,
    })) ?? [];

const shapeOf = (sent: Args): StagedCreative["shape"] => {
  if ("cards" in sent) {
    return "carousel";
  }
  if ("multi_media" in sent) {
    return "multi_media";
  }
  return "video_id" in sent ? "video" : "image";
};

// A creative as campaign_draft sent it (already checked by meta-draft.ts).
const stagedCreative = (sent: Args): Omit<StagedCreative, "id"> => {
  const media = creativeMedia(sent);
  return {
    cards: cardsOf(sent["cards"]),
    copy: canonicalJson({
      headline: sent["headline"],
      headlines: sent["headlines"],
      message: sent["message"],
      primary_texts: sent["primary_texts"],
      self_ai_disclosure: sent["self_ai_disclosure"],
    }),
    cta: String(sent["call_to_action_type"]),
    imageHashes: media.imageHashes,
    linkUrl: String(sent["link_url"]),
    pageId: String(sent["page_id"]),
    shape: shapeOf(sent),
    videoIds: media.videoIds,
  };
};

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
      : { creatives: [{ ...stagedCreative(sent), id }] };
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
