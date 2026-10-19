import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { adSchema } from "@wovain-foss/shared/ad";
import type { Ad } from "@wovain-foss/shared/ad";
import { designSchema } from "@wovain-foss/shared/design";
import type { Design } from "@wovain-foss/shared/design";
import {
  applySettingsPatch,
  defaultSettings,
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

// One JSON file holds settings, staged artwork and designs (spec.md > Data Model).
const storeSchema = z.object({
  // One ad set per design, keyed by design id.
  ads: z.record(z.string(), adSchema).default({}),
  artworks: z.record(z.string(), artworkSchema).default({}),
  designs: z.record(z.string(), designSchema).default({}),
  settings: settingsSchema.prefault({}),
});

type StoreData = z.infer<typeof storeSchema>;

const isMissingFile = (error: unknown) =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

const nextId = (prefix: string, existing: Record<string, unknown>) => {
  const used = Object.keys(existing).map((id) => Number(id.slice(1)));
  return `${prefix}${Math.max(0, ...used) + 1}`;
};

export const createStore = (dataDir: string) => {
  const file = path.join(dataDir, "wovain.json");
  const mediaDir = path.join(dataDir, "media");

  const read = async (): Promise<StoreData> => {
    try {
      return storeSchema.parse(JSON.parse(await readFile(file, "utf-8")));
    } catch (error) {
      if (isMissingFile(error)) {
        return storeSchema.parse({});
      }
      throw error;
    }
  };

  // Write to a temp file and rename, so a crash never leaves half a file.
  const write = async (data: StoreData) => {
    await mkdir(dataDir, { recursive: true });
    const tmp = `${file}.tmp`;
    await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`);
    await rename(tmp, file);
  };

  // Tool calls can overlap (a card polling while a skill writes), so every
  // read-modify-write waits for the one before it.
  let tail: Promise<unknown> = Promise.resolve();
  const update = async <T>(change: (data: StoreData) => T): Promise<T> => {
    const previous = tail;
    const { promise, resolve: release } = Promise.withResolvers<undefined>();
    tail = promise;
    await previous;
    try {
      const data = await read();
      const result = change(data);
      await write(data);
      return result;
    } finally {
      release();
    }
  };

  return {
    file,
    getAd: async (designId: string): Promise<Ad | undefined> => {
      const data = await read();
      return data.ads[designId];
    },
    getArtwork: async (id: string): Promise<Artwork | undefined> => {
      const data = await read();
      return data.artworks[id];
    },
    getDesign: async (id: string): Promise<Design | undefined> => {
      const data = await read();
      return data.designs[id];
    },
    getSettings: async (): Promise<Settings> => {
      const data = await read();
      return data.settings;
    },
    mediaDir,
    // Records add or skip and counts the ad cards still waiting, in one step.
    recordAd: async (designId: string, status: Ad["status"]) =>
      await update((data) => {
        const current = data.ads[designId];
        if (current === undefined) {
          throw new Error(`No ad card for ${designId}`);
        }
        const ad = adSchema.parse({ ...current, status });
        data.ads[designId] = ad;
        const waiting = Object.values(data.ads).filter(
          (item) => item.status === "draft"
        ).length;
        return { ad, waiting };
      }),
    resetSettings: async (): Promise<Settings> =>
      await update((data) => {
        data.settings = defaultSettings();
        return data.settings;
      }),
    saveAd: async (ad: Ad) =>
      await update((data) => {
        const saved = adSchema.parse(ad);
        data.ads[saved.designId] = saved;
        return saved;
      }),
    saveArtwork: async (artwork: Omit<Artwork, "id">): Promise<Artwork> =>
      await update((data) => {
        const saved = { ...artwork, id: nextId("a", data.artworks) };
        data.artworks[saved.id] = saved;
        return saved;
      }),
    // A design without an id is new; one with an id replaces the stored copy,
    // keeping its publish state unless the caller sets it.
    saveDesign: async (
      design: Omit<Design, "id"> & { id?: string | undefined }
    ) =>
      await update((data) => {
        const id = design.id ?? nextId("d", data.designs);
        const saved = designSchema.parse({
          ...data.designs[id],
          ...design,
          id,
        });
        data.designs[id] = saved;
        return saved;
      }),
    updateDesign: async (id: string, patch: Partial<Design>) =>
      await update((data) => {
        const current = data.designs[id];
        if (current === undefined) {
          throw new Error(`No design ${id}`);
        }
        const saved = designSchema.parse({ ...current, ...patch, id });
        data.designs[id] = saved;
        return saved;
      }),
    updateSettings: async (patch: SettingsPatch): Promise<Settings> =>
      await update((data) => {
        data.settings = applySettingsPatch(data.settings, patch);
        return data.settings;
      }),
  };
};

export type Store = ReturnType<typeof createStore>;
