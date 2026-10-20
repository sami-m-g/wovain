import { mkdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { get as getBlob, put as putBlob } from "@vercel/blob";
import { adSchema } from "@wovain-foss/shared/ad";
import type { Ad } from "@wovain-foss/shared/ad";
import { designSchema } from "@wovain-foss/shared/design";
import type { Design } from "@wovain-foss/shared/design";
import {
  applySettingsPatch,
  settingsSchema,
} from "@wovain-foss/shared/settings";
import type { Settings, SettingsPatch } from "@wovain-foss/shared/settings";
import { SQL } from "bun";
import { z } from "zod";

// Staged artwork: the bytes live in media under `key`, the record in the database.
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
// different server instances: Vercel Blob when hosted, files locally.
export interface Media {
  get: (key: string) => Promise<Uint8Array<ArrayBuffer> | undefined>;
  put: (key: string, bytes: Uint8Array, contentType: string) => Promise<void>;
}

export const fileMedia = (dir: string): Media => ({
  get: async (key) => {
    const file = Bun.file(path.join(dir, key));
    return (await file.exists())
      ? new Uint8Array(await file.arrayBuffer())
      : undefined;
  },
  put: async (key, bytes) => {
    const file = path.join(dir, key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes);
  },
});

// A private store: the bytes are only readable with the project's token.
export const blobMedia = (token: string): Media => ({
  get: async (key) => {
    const result = await getBlob(key, { access: "private", token });
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
      token,
    });
  },
});

// Neon Postgres when DATABASE_URL is set, else a SQLite file: Bun.SQL speaks
// both, so the queries below run unchanged on either.
export const openDatabase = (
  databaseUrl: string | undefined,
  dataDir: string
) => {
  if (databaseUrl !== undefined) {
    return new SQL(databaseUrl);
  }
  mkdirSync(dataDir, { recursive: true });
  return new SQL(`sqlite://${path.join(dataDir, "wovain.sqlite")}`);
};

const ready = new WeakMap<SQL, Promise<void>>();
const sqliteQueue = new WeakMap<SQL, Promise<unknown>>();

const migrate = async (db: SQL) => {
  await db`CREATE TABLE IF NOT EXISTS records (user_id TEXT NOT NULL, kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (user_id, kind, id))`;
  await db`CREATE TABLE IF NOT EXISTS counters (user_id TEXT NOT NULL, kind TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (user_id, kind))`;
};

// One merchant's records (spec.md > Data Model): settings, staged artwork,
// designs, ads (one ad set per design, keyed by design id) and the campaign.
// Each row is one record as JSON, checked against its schema on every read.
export const createStore = (db: SQL, media: Media, userId: string) => {
  const migrated = async () => {
    let done = ready.get(db);
    if (done === undefined) {
      done = migrate(db);
      ready.set(db, done);
    }
    await done;
  };

  const table = <T>(kind: Kind, schema: z.ZodType<T>) => ({
    all: async (q: SQL = db): Promise<T[]> => {
      await migrated();
      const rows: { data: string }[] =
        await q`SELECT data FROM records WHERE user_id = ${userId} AND kind = ${kind}`;
      return rows.map((row) => schema.parse(JSON.parse(row.data)));
    },
    get: async (id: string, q: SQL = db): Promise<T | undefined> => {
      await migrated();
      const [row]: { data: string }[] =
        await q`SELECT data FROM records WHERE user_id = ${userId} AND kind = ${kind} AND id = ${id}`;
      return row === undefined ? undefined : schema.parse(JSON.parse(row.data));
    },
    // Counters make ids unique even when two tool calls save at once.
    nextId: async (prefix: string, q: SQL = db) => {
      await migrated();
      const [row]: { n: number | string }[] =
        await q`INSERT INTO counters (user_id, kind, n) VALUES (${userId}, ${kind}, 1) ON CONFLICT (user_id, kind) DO UPDATE SET n = counters.n + 1 RETURNING n`;
      return `${prefix}${Number(row?.n ?? 1)}`;
    },
    put: async (id: string, value: T, q: SQL = db): Promise<T> => {
      await migrated();
      const saved = schema.parse(value);
      const data = JSON.stringify(saved);
      await q`INSERT INTO records (user_id, kind, id, data) VALUES (${userId}, ${kind}, ${id}, ${data}) ON CONFLICT (user_id, kind, id) DO UPDATE SET data = excluded.data`;
      return saved;
    },
  });
  const ads = table("ad", adSchema);
  const artworks = table("artwork", artworkSchema);
  const campaigns = table("campaign", campaignSchema);
  const designs = table("design", designSchema);
  const settingsTable = table("settings", settingsSchema);

  const settings = async () =>
    (await settingsTable.get(ONLY)) ?? settingsSchema.parse({});
  const requireDesign = async (id: string, q: SQL = db) => {
    const design = await designs.get(id, q);
    if (design === undefined) {
      throw new Error(`No design ${id}`);
    }
    return design;
  };

  // Each change that reads before it writes runs in one transaction, so
  // overlapping tool calls (a card polling while a skill writes) can't
  // interleave inside it.
  const transaction = async <T>(work: (q: SQL) => Promise<T>) => {
    await migrated();
    const run = async () => await db.begin(async (tx) => await work(tx));
    if (db.options.adapter !== "sqlite") {
      return await run();
    }
    // SQLite has one connection, so its transactions wait their turn; the
    // queue holds settled promises, so one failure doesn't block the next.
    const previous = sqliteQueue.get(db);
    const queued = (async () => {
      await previous;
      return await run();
    })();
    sqliteQueue.set(db, Promise.allSettled([queued]));
    return await queued;
  };

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
