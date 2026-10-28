import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import type { Core } from "@wovain/core/core";
import type { TrendIdea } from "@wovain/core/trends";
import type { Database } from "@wovain/db";
import { relations } from "@wovain/db/relations";
import { user } from "@wovain/db/schema/auth";
import { brandProfile } from "@wovain/db/schema/autonomy";
import { idea } from "@wovain/db/schema/seller";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it, vi } from "vitest";

import type { Actor } from "./actor";
import { readIdeaDossier, startIdeaDossier } from "./evidence";

// Research dossiers on real Postgres (PGlite, with the app's migrations) and
// a fake Tavily.

const MIGRATIONS = fileURLToPath(
  new URL("../../../db/src/migrations", import.meta.url)
);
const USER_ID = "user_1";

const research: TrendIdea = {
  qlooTag: "urn:tag:genre:horror",
  rank: 1,
  references: [],
  score: 0.7,
  signals: {
    affinity: 0.8,
    ipSafety: 1,
    margin: 0.5,
    marketHits: 3,
    newsHits: 2,
    recency: 0.5,
    relevance: 0.6,
  },
  sources: [],
  theme: "Retro slasher VHS",
};

const DONE = {
  content: {
    citations: [{ title: "Remake opens", url: "https://news.example/a" }],
    price_band: { high_usd: 32, low_usd: 22, note: "Most at $25" },
    risks: ["Licensed slasher characters are trademarked"],
    saturation: "high: thousands of VHS tees",
    why_now: "A slasher remake opens this month.",
  },
  createdAt: "",
  requestId: "req-1",
  responseTime: 40,
  sources: [{ title: "Etsy search", url: "https://www.etsy.com/search" }],
  status: "completed",
};

const setup = async ({ flag = true } = {}) => {
  const client = new PGlite();
  const db = drizzle({ client, relations });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  await db.insert(user).values({
    email: "merchant@example.com",
    emailVerified: true,
    id: USER_ID,
    name: "Merchant",
  });
  await db.insert(brandProfile).values({
    niches: ["horror"],
    qlooEntities: [{ id: "q1", name: "A24", type: "urn:entity:brand" }],
    userId: USER_ID,
  });
  const [row] = await db
    .insert(idea)
    .values({
      avoidNames: ["Freddy"],
      rank: 1,
      research,
      score: 0.7,
      seed: "horror",
      theme: research.theme,
      userId: USER_ID,
    })
    .returning();
  const tavily = {
    getResearch: vi.fn(
      async () =>
        await Promise.resolve({
          requestId: "req-1",
          responseTime: 1,
          status: "in_progress",
        })
    ),
    research: vi.fn(
      async (_input: string, _options?: Record<string, unknown>) =>
        await Promise.resolve({
          createdAt: "",
          input: "",
          model: "mini",
          requestId: "req-1",
          responseTime: 0,
          status: "pending",
        })
    ),
  };
  const error = vi.fn();
  const actor = {
    core: {
      flags: { isOn: async () => await Promise.resolve(flag) },
      tavily,
    } as unknown as Core,
    db: db as unknown as Database,
    log: { error, set: vi.fn() },
    userId: USER_ID,
  } as unknown as Actor;
  if (row === undefined) {
    throw new Error("No idea saved");
  }
  return { actor, error, ideaId: row.id, tavily };
};

describe("research dossiers", () => {
  it("starts once with the Qloo taste file, then reads it back", async () => {
    const { actor, ideaId, tavily } = await setup();

    expect(await readIdeaDossier(actor, ideaId)).toBeNull();
    const started = await startIdeaDossier(actor, ideaId);
    expect(started.status).toBe("pending");
    // A second start returns the pending one.
    await startIdeaDossier(actor, ideaId);
    expect(tavily.research).toHaveBeenCalledOnce();

    const options = tavily.research.mock.calls[0]?.[1] ?? {};
    const [file] = options["files"] as { data: string }[];
    const taste = JSON.parse(
      Buffer.from(file?.data ?? "", "base64").toString()
    ) as Record<string, unknown>;
    expect(taste).toMatchObject({
      brand: { niches: ["horror"] },
      idea: { qlooTag: "urn:tag:genre:horror", seed: "horror" },
    });

    const pending = await readIdeaDossier(actor, ideaId);
    expect(pending?.status).toBe("pending");
    tavily.getResearch.mockResolvedValueOnce(DONE);
    const done = await readIdeaDossier(actor, ideaId);
    expect(done?.status).toBe("done");
    expect(done?.dossier?.priceBand.lowUsd).toBe(22);
    expect(done?.dossier?.citations.map((c) => c.url)).toEqual([
      "https://news.example/a",
      "https://www.etsy.com/search",
    ]);
    // Saved: no more calls to Tavily.
    const calls = tavily.getResearch.mock.calls.length;
    const again = await readIdeaDossier(actor, ideaId);
    expect(again?.status).toBe("done");
    expect(tavily.getResearch.mock.calls).toHaveLength(calls);
  });

  it("marks a failed dossier and logs it at error level", async () => {
    const { actor, error, ideaId, tavily } = await setup();
    await startIdeaDossier(actor, ideaId);
    tavily.getResearch.mockResolvedValueOnce({
      requestId: "req-1",
      responseTime: 1,
      status: "failed",
    });

    const failed = await readIdeaDossier(actor, ideaId);

    expect(failed?.status).toBe("failed");
    expect(error).toHaveBeenCalledOnce();
    // A failed one can start again.
    await startIdeaDossier(actor, ideaId);
    expect(tavily.research).toHaveBeenCalledTimes(2);
  });

  it("is not found while tavily-evidence is off", async () => {
    const { actor, ideaId } = await setup({ flag: false });
    await expect(startIdeaDossier(actor, ideaId)).rejects.toThrow(
      "aren't available"
    );
  });
});
