import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import path from "node:path";

import { adSchema } from "@wovain-foss/shared/ad";
import type { Ad } from "@wovain-foss/shared/ad";
import { designSchema } from "@wovain-foss/shared/design";
import type { Design } from "@wovain-foss/shared/design";
import {
  applySettingsPatch,
  settingsSchema,
} from "@wovain-foss/shared/settings";
import type { Settings, SettingsPatch } from "@wovain-foss/shared/settings";
import { z } from "zod";

// Artwork staged on this machine: the bytes live in data/media/<id>.<ext>.
const artworkSchema = z.object({
  bytes: z.int().positive(),
  contentType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  file: z.string(),
  height: z.int().positive(),
  id: z.string().regex(/^a\d+$/u),
  // Absent for data URLs and chat attachments, which have no public URL.
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

// Stores made before SQLite kept everything in wovain.json.
const legacySchema = z.object({
  ads: z.record(z.string(), adSchema).default({}),
  artworks: z.record(z.string(), artworkSchema).default({}),
  campaign: campaignSchema.optional(),
  designs: z.record(z.string(), designSchema).default({}),
  settings: settingsSchema.optional(),
});

export const createStore = (dataDir: string) => {
  mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, "wovain.sqlite");
  const mediaDir = path.join(dataDir, "media");
  const db = new Database(file, { create: true, strict: true });
  db.run("PRAGMA journal_mode = WAL");
  db.run(
    "CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (kind, id))"
  );
  const selectOne = db.query<{ data: string }, { id: string; kind: Kind }>(
    "SELECT data FROM records WHERE kind = $kind AND id = $id"
  );
  const selectAll = db.query<{ data: string; id: string }, { kind: Kind }>(
    "SELECT id, data FROM records WHERE kind = $kind"
  );
  const upsert = db.query<never, { data: string; id: string; kind: Kind }>(
    "INSERT INTO records (kind, id, data) VALUES ($kind, $id, $data) ON CONFLICT (kind, id) DO UPDATE SET data = excluded.data"
  );

  // One SQLite file holds settings, staged artwork, designs, ads (one ad set
  // per design, keyed by design id) and the campaign (spec.md > Data Model).
  // Each row is one record as JSON, checked against its schema on every read.
  const table = <T>(kind: Kind, schema: z.ZodType<T>) => ({
    all: (): T[] =>
      selectAll.all({ kind }).map((row) => schema.parse(JSON.parse(row.data))),
    get: (id: string): T | undefined => {
      const row = selectOne.get({ id, kind });
      return row === null ? undefined : schema.parse(JSON.parse(row.data));
    },
    nextId: (prefix: string) => {
      const used = selectAll
        .all({ kind })
        .map((row) => Number(row.id.slice(1)));
      return `${prefix}${Math.max(0, ...used) + 1}`;
    },
    put: (id: string, value: T): T => {
      const saved = schema.parse(value);
      upsert.run({ data: JSON.stringify(saved), id, kind });
      return saved;
    },
  });
  const ads = table("ad", adSchema);
  const artworks = table("artwork", artworkSchema);
  const campaigns = table("campaign", campaignSchema);
  const designs = table("design", designSchema);
  const settingsTable = table("settings", settingsSchema);

  const settings = () => settingsTable.get(ONLY) ?? settingsSchema.parse({});
  const requireDesign = (id: string) => {
    const design = designs.get(id);
    if (design === undefined) {
      throw new Error(`No design ${id}`);
    }
    return design;
  };

  // One-time import; the old file is kept beside the database, renamed.
  const legacyFile = path.join(dataDir, "wovain.json");
  if (existsSync(legacyFile)) {
    const legacy = legacySchema.parse(
      JSON.parse(readFileSync(legacyFile, "utf-8"))
    );
    db.transaction(() => {
      for (const [id, ad] of Object.entries(legacy.ads)) {
        ads.put(id, ad);
      }
      for (const [id, artwork] of Object.entries(legacy.artworks)) {
        artworks.put(id, artwork);
      }
      for (const [id, design] of Object.entries(legacy.designs)) {
        designs.put(id, design);
      }
      if (legacy.campaign !== undefined) {
        campaigns.put(ONLY, legacy.campaign);
      }
      if (legacy.settings !== undefined) {
        settingsTable.put(ONLY, legacy.settings);
      }
    })();
    renameSync(legacyFile, `${legacyFile}.imported`);
  }

  // bun:sqlite is synchronous, so each change runs whole in one transaction
  // and overlapping tool calls (a card polling while a skill writes) can't
  // interleave inside it. Methods stay async for the callers.
  return {
    file,
    getAds: async (): Promise<Ad[]> => await Promise.resolve(ads.all()),
    getArtwork: async (id: string): Promise<Artwork | undefined> =>
      await Promise.resolve(artworks.get(id)),
    getCampaign: async (): Promise<SavedCampaign | undefined> =>
      await Promise.resolve(campaigns.get(ONLY)),
    getDesign: async (id: string): Promise<Design | undefined> =>
      await Promise.resolve(designs.get(id)),
    getSettings: async (): Promise<Settings> =>
      await Promise.resolve(settings()),
    mediaDir,
    // Records add or skip and counts the ad cards still waiting, in one step.
    recordAd: async (designId: string, status: Ad["status"]) =>
      await Promise.resolve(
        db.transaction(() => {
          const current = ads.get(designId);
          if (current === undefined) {
            throw new Error(`No ad card for ${designId}`);
          }
          const ad = ads.put(designId, { ...current, status });
          const waiting = ads
            .all()
            .filter((item) => item.status === "draft").length;
          return { ad, waiting };
        })()
      ),
    requireDesign: async (id: string): Promise<Design> =>
      await Promise.resolve(requireDesign(id)),
    saveAd: async (ad: Ad) => await Promise.resolve(ads.put(ad.designId, ad)),
    saveArtwork: async (artwork: Omit<Artwork, "id">): Promise<Artwork> =>
      await Promise.resolve(
        db.transaction(() => {
          const id = artworks.nextId("a");
          return artworks.put(id, { ...artwork, id });
        })()
      ),
    saveCampaign: async (campaign: SavedCampaign) =>
      await Promise.resolve(campaigns.put(ONLY, campaign)),
    // A design without an id is new; one with an id replaces the stored copy,
    // keeping its publish state unless the caller sets it.
    saveDesign: async (
      design: Omit<Design, "id"> & { id?: string | undefined }
    ) =>
      await Promise.resolve(
        db.transaction(() => {
          const id = design.id ?? designs.nextId("d");
          return designs.put(id, { ...designs.get(id), ...design, id });
        })()
      ),
    updateDesign: async (id: string, patch: Partial<Design>) =>
      await Promise.resolve(
        db.transaction(() =>
          designs.put(id, { ...requireDesign(id), ...patch, id })
        )()
      ),
    updateSettings: async (patch: SettingsPatch): Promise<Settings> =>
      await Promise.resolve(
        settingsTable.put(ONLY, applySettingsPatch(settings(), patch))
      ),
  };
};

export type Store = ReturnType<typeof createStore>;
