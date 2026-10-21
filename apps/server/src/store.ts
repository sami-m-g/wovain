import { adSchema } from "@wovain/shared/ad";
import type { Ad } from "@wovain/shared/ad";
import { designSchema } from "@wovain/shared/design";
import type { Design } from "@wovain/shared/design";
import { applySettingsPatch, settingsSchema } from "@wovain/shared/settings";
import type { Settings, SettingsPatch } from "@wovain/shared/settings";
import type {
  DocumentData,
  Firestore,
  Transaction,
} from "firebase-admin/firestore";
import type { Storage } from "firebase-admin/storage";
import { z } from "zod";

type Bucket = ReturnType<Storage["bucket"]>;

// Staged artwork: the bytes live in media under `key`, the record in Firestore.
const artworkSchema = z.object({
  bytes: z.int().positive(),
  contentType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  height: z.int().positive(),
  id: z.string().regex(/^a\d+$/u),
  key: z.string(),
  // Absent for data URLs, which have no public URL.
  sourceUrl: z.url().optional(),
  transparent: z.boolean(),
  width: z.int().positive(),
});
export type Artwork = z.infer<typeof artworkSchema>;

// The launched campaign and which of its rules exist in Meta.
const campaignSchema = z.object({
  adAccountId: z.string(),
  campaignId: z.string(),
  rulesCreated: z.array(z.string()),
});
type SavedCampaign = z.infer<typeof campaignSchema>;

type Kind = "ad" | "artwork" | "campaign" | "design" | "settings";

// Settings and the campaign are single records.
const ONLY = "current";

// Artwork bytes between stage_artwork and put_artwork, which may run on
// different server instances.
export interface Media {
  get: (key: string) => Promise<Uint8Array<ArrayBuffer> | undefined>;
  put: (key: string, bytes: Uint8Array, contentType: string) => Promise<void>;
}

// The project's private Cloud Storage bucket: readable only with the
// server's credentials.
export const bucketMedia = (bucket: Bucket): Media => ({
  get: async (key) => {
    const file = bucket.file(key);
    const [exists] = await file.exists();
    const [bytes] = exists ? await file.download() : [];
    return bytes === undefined ? undefined : new Uint8Array(bytes);
  },
  put: async (key, bytes, contentType) => {
    await bucket
      .file(key)
      .save(Buffer.from(bytes), { contentType, resumable: false });
  },
});

// One merchant's records (spec.md > Data Model): settings, staged artwork,
// designs, ads (one ad set per design, keyed by design id) and the campaign,
// as Firestore documents under users/{userId}/{kind}/{id}, each checked
// against its schema on every read.
export const createStore = (db: Firestore, media: Media, userId: string) => {
  const user = db.collection("users").doc(userId);
  const table = <T extends DocumentData>(kind: Kind, schema: z.ZodType<T>) => {
    const collection = user.collection(kind);
    return {
      all: async (tx?: Transaction): Promise<T[]> => {
        const snapshot = await (tx?.get(collection) ?? collection.get());
        return snapshot.docs.map((doc) => schema.parse(doc.data()));
      },
      get: async (id: string, tx?: Transaction): Promise<T | undefined> => {
        const ref = collection.doc(id);
        const doc = await (tx?.get(ref) ?? ref.get());
        return doc.exists ? schema.parse(doc.data()) : undefined;
      },
      // Counters make ids unique even when two tool calls save at once.
      nextId: async (prefix: string, tx: Transaction) => {
        const ref = user.collection("counters").doc(kind);
        const doc = await tx.get(ref);
        const { n: last } = doc.exists
          ? z.object({ n: z.int() }).parse(doc.data())
          : { n: 0 };
        const n = last + 1;
        tx.set(ref, { n });
        return `${prefix}${n}`;
      },
      put: async (id: string, value: T, tx?: Transaction): Promise<T> => {
        const saved = schema.parse(value);
        const ref = collection.doc(id);
        await (tx === undefined ? ref.set(saved) : tx.set(ref, saved));
        return saved;
      },
    };
  };
  const ads = table("ad", adSchema);
  const artworks = table("artwork", artworkSchema);
  const campaigns = table("campaign", campaignSchema);
  const designs = table("design", designSchema);
  const settingsTable = table("settings", settingsSchema);

  const settings = async () =>
    (await settingsTable.get(ONLY)) ?? settingsSchema.parse({});
  const requireDesign = async (id: string, tx?: Transaction) => {
    const design = await designs.get(id, tx);
    if (design === undefined) {
      throw new Error(`No design ${id}`);
    }
    return design;
  };

  // Each change that reads before it writes runs in one transaction, so
  // overlapping tool calls (a widget polling while a skill writes) can't
  // interleave inside it. Firestore wants every read before the first write.
  const transaction = async <T>(work: (tx: Transaction) => Promise<T>) =>
    await db.runTransaction(work, { maxAttempts: 10 });

  return {
    getAds: async (): Promise<Ad[]> => await ads.all(),
    getArtwork: async (id: string): Promise<Artwork | undefined> =>
      await artworks.get(id),
    getCampaign: async (): Promise<SavedCampaign | undefined> =>
      await campaigns.get(ONLY),
    getDesign: async (id: string): Promise<Design | undefined> =>
      await designs.get(id),
    getSettings: async (): Promise<Settings> => await settings(),
    readArtworkBytes: async (artwork: Artwork) => {
      const bytes = await media.get(artwork.key);
      if (bytes === undefined) {
        throw new Error(`staged artwork ${artwork.id} has no bytes`);
      }
      return bytes;
    },
    // Records add or skip and counts the ad widgets still waiting, in one step.
    recordAd: async (designId: string, status: Ad["status"]) =>
      await transaction(async (tx) => {
        const all = await ads.all(tx);
        const current = all.find((item) => item.designId === designId);
        if (current === undefined) {
          throw new Error(`No ad widget for ${designId}`);
        }
        const ad = await ads.put(designId, { ...current, status }, tx);
        const waiting = all.filter(
          (item) => item.designId !== designId && item.status === "draft"
        ).length;
        return { ad, waiting: ad.status === "draft" ? waiting + 1 : waiting };
      }),
    requireDesign: async (id: string): Promise<Design> =>
      await requireDesign(id),
    saveAd: async (ad: Ad) => await ads.put(ad.designId, ad),
    // Bytes go to media first, so a record never points at missing bytes.
    saveArtwork: async (
      artwork: Omit<Artwork, "id" | "key">,
      bytes: Uint8Array,
      fileName: string
    ): Promise<Artwork> => {
      const key = `${userId}/${fileName}`;
      await media.put(key, bytes, artwork.contentType);
      return await transaction(async (tx) => {
        const id = await artworks.nextId("a", tx);
        return await artworks.put(id, { ...artwork, id, key }, tx);
      });
    },
    saveCampaign: async (campaign: SavedCampaign) =>
      await campaigns.put(ONLY, campaign),
    // A design without an id is new; one with an id replaces the stored copy,
    // keeping its publish state unless the caller sets it.
    saveDesign: async (
      design: Omit<Design, "id"> & { id?: string | undefined }
    ) =>
      await transaction(async (tx) => {
        // A new id has no stored copy, so its read is skipped.
        const current =
          design.id === undefined
            ? undefined
            : await designs.get(design.id, tx);
        const id = design.id ?? (await designs.nextId("d", tx));
        return await designs.put(id, { ...current, ...design, id }, tx);
      }),
    updateDesign: async (id: string, patch: Partial<Design>) =>
      await transaction(
        async (tx) =>
          await designs.put(
            id,
            { ...(await requireDesign(id, tx)), ...patch, id },
            tx
          )
      ),
    updateSettings: async (patch: SettingsPatch): Promise<Settings> =>
      await settingsTable.put(
        ONLY,
        applySettingsPatch(await settings(), patch)
      ),
  };
};

export type Store = ReturnType<typeof createStore>;
