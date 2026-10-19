import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  applySettingsPatch,
  defaultSettings,
  settingsSchema,
} from "@wovain/shared";
import type { Settings, SettingsPatch } from "@wovain/shared";
import { z } from "zod";

// One JSON file holds settings and the state of each run (spec.md > Data Model).
const storeSchema = z.object({
  runs: z.record(z.string(), z.unknown()).default({}),
  settings: settingsSchema.prefault({}),
});

type StoreData = z.infer<typeof storeSchema>;

const isMissingFile = (error: unknown) =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

export const createStore = (dataDir: string) => {
  const file = path.join(dataDir, "wovain.json");

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

  return {
    file,
    getSettings: async (): Promise<Settings> => {
      const data = await read();
      return data.settings;
    },
    resetSettings: async (): Promise<Settings> => {
      const data = await read();
      data.settings = defaultSettings();
      await write(data);
      return data.settings;
    },
    updateSettings: async (patch: SettingsPatch): Promise<Settings> => {
      const data = await read();
      data.settings = applySettingsPatch(data.settings, patch);
      await write(data);
      return data.settings;
    },
  };
};

export type Store = ReturnType<typeof createStore>;
