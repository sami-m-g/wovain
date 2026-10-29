import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import type { Core } from "@wovain/core/core";
import { fakeAgents } from "@wovain/core/test-doubles";
import type { TrendIdea } from "@wovain/core/trends";
import type { Database } from "@wovain/db";
import { relations } from "@wovain/db/relations";
import { user } from "@wovain/db/schema/auth";
import { decisionTrace } from "@wovain/db/schema/autonomy";
import { idea } from "@wovain/db/schema/seller";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it, vi } from "vitest";

import type { Actor } from "./actor";
import {
  readIdeaCompetition,
  readRunCompetition,
  skipSaturated,
} from "./competition";

// The competition read on real Postgres (PGlite, with the app's migrations),
// a fake Tavily and a fake Nemotron.

const MIGRATIONS = fileURLToPath(
  new URL("../../../db/src/migrations", import.meta.url)
);
const USER_ID = "user_1";

const research: TrendIdea = {
  rank: 1,
  references: [],
  score: 0.7,
  signals: {
    ipSafety: 1,
    margin: 0.5,
    marketHits: 3,
    newsHits: 2,
    recency: 0.5,
    relevance: 0.6,
  },
  sources: [],
  theme: "Spooky Season",
};

const listing = (index: number) => ({
  content: "Retro ghost tee",
  id: String(index),
  publishedDate: "",
  score: 0.9,
  title: `Spooky Season Tee ${index}`,
  url: `https://www.etsy.com/listing/${index}`,
});

const setup = async ({
  flag = true,
  listings = 9,
  searchFails = false,
} = {}) => {
  const client = new PGlite();
  const db = drizzle({ client, relations });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  await db.insert(user).values({
    email: "merchant@example.com",
    emailVerified: true,
    id: USER_ID,
    name: "Merchant",
  });
  const rows = await db
    .insert(idea)
    .values({
      avoidNames: [],
      rank: 1,
      research,
      score: 0.7,
      seed: "halloween",
      theme: research.theme,
      userId: USER_ID,
    })
    .returning();
  const search = vi.fn(async () =>
    searchFails
      ? await Promise.reject(new Error("tavily down"))
      : await Promise.resolve({
          images: [],
          query: "q",
          requestId: "r",
          responseTime: 0.1,
          results: Array.from({ length: listings }, (_, index) =>
            listing(index)
          ),
        })
  );
  const extract = vi.fn(
    async () =>
      await Promise.resolve({
        failedResults: [],
        requestId: "r",
        responseTime: 1,
        results: [
          {
            rawContent: "Spooky Season tee $24.99, retro ghost",
            title: "Tee",
            url: "https://www.etsy.com/listing/0",
          },
        ],
      })
  );
  const { ask } = fakeAgents({
    competition_summary: [
      {
        points: [
          {
            kind: "style",
            sourceUrl: "https://www.etsy.com/listing/0",
            text: "Retro ghost",
          },
        ],
      },
    ],
  });
  const actor = {
    core: {
      flags: { isOn: async () => await Promise.resolve(flag) },
      nemotron: ask,
      tavily: { extract, search },
    } as unknown as Core,
    db: db as unknown as Database,
    log: { error: vi.fn(), set: vi.fn() },
    userId: USER_ID,
  } as unknown as Actor;
  return { actor, db, rows, search };
};

describe("competition per theme", () => {
  it("reads, saves and traces each idea's competition once", async () => {
    const { actor, db, rows, search } = await setup();
    const [read] = await readRunCompetition(actor, rows);
    expect(read?.competition?.saturated).toBe(true);
    // A second pass keeps the saved read.
    const saved = await db.select().from(idea);
    await readRunCompetition(actor, saved);
    expect(search).toHaveBeenCalledOnce();
    expect(saved[0]?.competition?.points[0]?.text).toBe("Retro ghost");
    const steps = await db.select().from(decisionTrace);
    expect(steps.map((step) => step.step)).toEqual(
      expect.arrayContaining(["tavily.search", "competition.cite"])
    );
  });

  it("has autopilot skip a saturated theme and stores why", async () => {
    const { actor, db, rows } = await setup();
    const read = await readRunCompetition(actor, rows);
    expect(await skipSaturated(actor, read)).toEqual([]);
    const [saved] = await db.select().from(idea);
    expect(saved?.competition?.skipped).toContain("Saturated");
  });

  it("keeps a theme with room", async () => {
    const { actor, rows } = await setup({ listings: 2 });
    const read = await readRunCompetition(actor, rows);
    expect(await skipSaturated(actor, read)).toHaveLength(1);
  });

  it("marks a failed read unknown and reads it again on request", async () => {
    const { actor, db, rows, search } = await setup({ searchFails: true });
    const [read] = await readRunCompetition(actor, rows);
    expect(read?.competition?.status).toBe("unknown");
    expect(read?.competition?.error).toContain("tavily down");
    const [saved] = await db.select().from(idea);
    await readIdeaCompetition(actor, saved?.id ?? "");
    expect(search).toHaveBeenCalledTimes(2);
  });

  it("does nothing with the flag off", async () => {
    const { actor, rows, search } = await setup({ flag: false });
    const [read] = await readRunCompetition(actor, rows);
    expect(read?.competition).toBeNull();
    expect(search).not.toHaveBeenCalled();
  });
});
