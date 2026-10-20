import { get as getBlob, put as putBlob } from "@vercel/blob";
import { and, counters, eq, records, sql } from "@wovain/db";
import type { Db } from "@wovain/db";
import { adSchema } from "@wovain/shared/ad";
import type { Ad } from "@wovain/shared/ad";
import { designSchema } from "@wovain/shared/design";
import type { Design } from "@wovain/shared/design";
import { applySettingsPatch, settingsSchema } from "@wovain/shared/settings";
import type { Settings, SettingsPatch } from "@wovain/shared/settings";
import { z } from "zod";

// Staged artwork: the bytes live in media under `key`, the record in Neon.
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

const requireToken = (token: string | undefined) => {
  if (token === undefined) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN is not set, so artwork can't be staged"
    );
  }
  return token;
};

// The private Blob store: the bytes are only readable with the project's token.
export const blobMedia = (token: string | undefined): Media => ({
  get: async (key) => {
    const result = await getBlob(key, {
      access: "private",
      token: requireToken(token),
    });
    const bytes =
      result?.statusCode === 200
        ? new Uint8Array(await new Response(result.stream).arrayBuffer())
        : undefined;
    return bytes;
  },
  put: async (key, bytes, contentType) => {
    await putBlob(key, Buffer.from(bytes), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType,
      token: requireToken(token),
    });
  },
});

const selectData = (q: Db) =>
  q.select({ data: records.data }).from(records).$dynamic();

// One merchant's records (spec.md > Data Model): settings, staged artwork,
// designs, ads (one ad set per design, keyed by design id) and the campaign.
// Each row is one record as JSON, checked against its schema on every read.
export const createStore = (db: Db, media: Media, userId: string) => {
  const table = <T>(kind: Kind, schema: z.ZodType<T>) => {
    const mine = and(eq(records.userId, userId), eq(records.kind, kind));
    return {
      all: async (q: Db = db): Promise<T[]> => {
        const rows = await selectData(q).where(mine);
        return rows.map((row) => schema.parse(row.data));
      },
      get: async (id: string, q: Db = db): Promise<T | undefined> => {
        const [row] = await selectData(q).where(and(mine, eq(records.id, id)));
        return row === undefined ? undefined : schema.parse(row.data);
      },
      // Counters make ids unique even when two tool calls save at once.
      nextId: async (prefix: string, q: Db = db) => {
        const [row] = await q
          .insert(counters)
          .values({ kind, n: 1, userId })
          .onConflictDoUpdate({
            set: { n: sql`${counters.n} + 1` },
            target: [counters.userId, counters.kind],
          })
          .returning({ n: counters.n });
        return `${prefix}${row?.n ?? 1}`;
      },
      put: async (id: string, value: T, q: Db = db): Promise<T> => {
        const saved = schema.parse(value);
        await q
          .insert(records)
          .values({ data: saved, id, kind, userId })
          .onConflictDoUpdate({
            set: { data: saved },
            target: [records.userId, records.kind, records.id],
          });
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
  const requireDesign = async (id: string, q: Db = db) => {
    const design = await designs.get(id, q);
    if (design === undefined) {
      throw new Error(`No design ${id}`);
    }
    return design;
  };

  // Each change that reads before it writes runs in one transaction, so
  // overlapping tool calls (a card polling while a skill writes) can't
  // interleave inside it.
  const transaction = async <T>(work: (q: Db) => Promise<T>) =>
    await db.transaction(async (tx) => await work(tx));

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
    // Records add or skip and counts the ad cards still waiting, in one step.
    recordAd: async (designId: string, status: Ad["status"]) =>
      await transaction(async (q) => {
        const current = await ads.get(designId, q);
        if (current === undefined) {
          throw new Error(`No ad card for ${designId}`);
        }
        const ad = await ads.put(designId, { ...current, status }, q);
        // oxlint-disable-next-line react-doctor/server-sequential-independent-await -- the count must include the write above
        const all = await ads.all(q);
        const waiting = all.filter((item) => item.status === "draft").length;
        return { ad, waiting };
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
      return await transaction(async (q) => {
        const id = await artworks.nextId("a", q);
        return await artworks.put(id, { ...artwork, id, key }, q);
      });
    },
    saveCampaign: async (campaign: SavedCampaign) =>
      await campaigns.put(ONLY, campaign),
    // A design without an id is new; one with an id replaces the stored copy,
    // keeping its publish state unless the caller sets it.
    saveDesign: async (
      design: Omit<Design, "id"> & { id?: string | undefined }
    ) =>
      await transaction(async (q) => {
        const id = design.id ?? (await designs.nextId("d", q));
        const current = await designs.get(id, q);
        return await designs.put(id, { ...current, ...design, id }, q);
      }),
    updateDesign: async (id: string, patch: Partial<Design>) =>
      await transaction(
        async (q) =>
          await designs.put(
            id,
            { ...(await requireDesign(id, q)), ...patch, id },
            q
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
