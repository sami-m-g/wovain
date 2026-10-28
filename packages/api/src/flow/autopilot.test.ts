import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import type { NewsHit, RisingEntity } from "@wovain/core/autopilot-signals";
import type { WovainEvent } from "@wovain/core/events";
import type { Database } from "@wovain/db";
import { relations } from "@wovain/db/relations";
import { user } from "@wovain/db/schema/auth";
import {
  approval,
  brandProfile,
  decisionTrace,
  suggestion,
} from "@wovain/db/schema/autonomy";
import { creditReservation } from "@wovain/db/schema/billing";
import { run } from "@wovain/db/schema/seller";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "./actor";
import { setAutonomy } from "./approvals";
import {
  actOnSuggestion,
  autopilotLog,
  brandsToScan,
  executeRunStart,
  runEstimate,
  scanBrand,
} from "./autopilot";

// Autopilot's triggers on real Postgres (PGlite, the app's migrations),
// with Qloo, Tavily and the run engine faked.

const { startRun } = vi.hoisted(() => ({ startRun: vi.fn() }));
vi.mock("./runs", () => ({ startRun }));

const MIGRATIONS = fileURLToPath(
  new URL("../../../db/src/migrations", import.meta.url)
);
const USER_ID = "user_1";
const NOW = new Date("2026-10-28T12:00:00Z");

const hit = (title: string, url: string, score = 0.8): NewsHit => ({
  publishedDate: "2026-10-27T10:00:00Z",
  score,
  title,
  url,
});

interface Fakes {
  flags: Record<string, boolean>;
  news: (query: string) => Promise<NewsHit[]>;
  rising: () => Promise<RisingEntity[]>;
}

const setup = async () => {
  const client = new PGlite();
  const db = drizzle({ client, relations });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  await db.insert(user).values({
    email: "merchant@example.com",
    emailVerified: true,
    id: USER_ID,
    name: "Merchant",
  });
  const sent: WovainEvent[] = [];
  const fakes: Fakes = {
    flags: { autopilot: true, "autopilot-triggers": true },
    news: (query) =>
      Promise.resolve(
        query.startsWith("Salomon")
          ? [hit("Salomon sneakers sell out", "https://news.example/salomon")]
          : []
      ),
    rising: () =>
      Promise.resolve([{ affinity: 0.9, id: "q-salomon", name: "Salomon" }]),
  };
  const actor = {
    core: {
      flags: {
        isOn: (name: string) => Promise.resolve(fakes.flags[name] ?? false),
      },
      signals: {
        news: (query: string) => fakes.news(query),
        rising: () => fakes.rising(),
      },
    },
    db: db as unknown as Database,
    events: {
      send: (event: WovainEvent) => {
        sent.push(event);
        return Promise.resolve();
      },
    },
    userId: USER_ID,
  } as unknown as Actor;
  await db.insert(brandProfile).values({
    demographics: { countries: ["gb", "x1", "US"] },
    niches: ["gorpcore", "y2k racing"],
    qlooEntities: [{ id: "q-own", name: "Own", type: "urn:entity:brand" }],
    userId: USER_ID,
  });
  return { actor, db, fakes, sent };
};

describe("autopilot triggers on Postgres", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;

  beforeEach(async () => {
    startRun.mockReset();
    ctx = await setup();
  });

  it("lists brands whose agent isn't paused", async () => {
    expect(await brandsToScan(ctx.db as unknown as Database)).toEqual([
      USER_ID,
    ]);
    await setAutonomy(ctx.actor, {
      dailySpendCapCents: 0,
      level: "suggest",
      monthlySpendCapCents: 0,
      paused: true,
    });
    expect(await brandsToScan(ctx.db as unknown as Database)).toEqual([]);
  });

  it("does nothing with the flag off", async () => {
    ctx.fakes.flags["autopilot-triggers"] = false;
    expect(await scanBrand(ctx.actor, "manual", NOW)).toEqual({
      status: "off",
      suggestionIds: [],
    });
  });

  it("saves a suggestion with its evidence, traces it and announces it", async () => {
    ctx.fakes.news = (query) =>
      query.startsWith("y2k")
        ? Promise.reject(new Error("Tavily 432"))
        : Promise.resolve(
            query.startsWith("Salomon")
              ? [hit("Salomon sneakers sell out", "https://news.example/s")]
              : []
          );
    const result = await scanBrand(ctx.actor, "schedule", NOW);
    expect(result.suggestionIds).toHaveLength(1);
    const [saved] = await ctx.db.select().from(suggestion);
    expect(saved).toMatchObject({
      kind: "drop",
      sources: [
        { id: "q-salomon", provider: "qloo", title: "Salomon" },
        {
          provider: "tavily",
          title: "Salomon sneakers sell out",
          url: "https://news.example/s",
        },
      ],
      status: "new",
      title: "A drop on Salomon",
      trigger: "qloo",
    });
    expect(saved?.payload).toMatchObject({
      key: "qloo:salomon",
      seed: "gorpcore looks for fans of Salomon",
    });
    const steps = await ctx.db
      .select()
      .from(decisionTrace)
      .orderBy(decisionTrace.seq);
    expect(steps.map((entry) => entry.step)).toEqual([
      "scan",
      "qloo.rising",
      "tavily.news",
      "match",
      "suggest",
    ]);
    expect(steps.every((entry) => entry.suggestionId === saved?.id)).toBe(true);
    expect(ctx.sent.map(({ name }) => name)).toEqual([
      "wovain/trigger.fired",
      "wovain/notify",
    ]);
    expect(ctx.sent[1]?.data).toMatchObject({
      kind: "suggestion",
      title: "A drop on Salomon",
    });
  });

  it("goes on with Tavily when Qloo fails, and skips repeats", async () => {
    ctx.fakes.rising = () => Promise.reject(new Error("Qloo 500"));
    ctx.fakes.news = (query) =>
      Promise.resolve(
        query.startsWith("gorpcore")
          ? [hit("Gorpcore is back", "https://news.example/g")]
          : []
      );
    const first = await scanBrand(ctx.actor, "manual", NOW);
    expect(first.suggestionIds).toHaveLength(1);
    const again = await scanBrand(ctx.actor, "manual", NOW);
    expect(again.suggestionIds).toEqual([]);
    const failed = await ctx.db.select().from(decisionTrace);
    expect(
      failed.some((entry) => entry.step === "qloo.rising" && !entry.ok)
    ).toBe(true);
    const log = await autopilotLog(ctx.actor);
    expect(log.suggestions).toHaveLength(1);
    expect(log.scans).toHaveLength(1);
    expect(log.scans[0]?.output).toMatchObject({ repeats: ["gorpcore"] });
  });

  const suggest = async () => {
    const { suggestionIds } = await scanBrand(ctx.actor, "manual", NOW);
    const [id] = suggestionIds;
    if (id === undefined) {
      throw new Error("No suggestion");
    }
    ctx.sent.length = 0;
    return id;
  };

  it("waits for the merchant on suggest", async () => {
    const id = await suggest();
    expect(await actOnSuggestion(ctx.actor, id, NOW)).toBe("queued");
    const [queued] = await ctx.db.select().from(approval);
    expect(queued).toMatchObject({
      actionType: "autopilot.run.start",
      policyReason: "above_level",
      proposedBy: "autopilot",
      status: "pending",
      suggestionId: id,
    });
    expect(ctx.sent.map(({ name }) => name)).toEqual([
      "wovain/approval.requested",
    ]);
    const [row] = await ctx.db.select().from(suggestion);
    expect(row?.approvalId).toBe(queued?.id);
    // Queued once per suggestion.
    expect(await actOnSuggestion(ctx.actor, id, NOW)).toBe("missing");
  });

  it("starts a run that waits at the ideas gate on draft", async () => {
    await setAutonomy(ctx.actor, {
      dailySpendCapCents: 0,
      level: "draft",
      monthlySpendCapCents: 0,
      paused: false,
    });
    const id = await suggest();
    await actOnSuggestion(ctx.actor, id, NOW);
    const [queued] = await ctx.db.select().from(approval);
    expect(queued).toMatchObject({ decidedBy: "policy", status: "approved" });
    expect(ctx.sent.map(({ name }) => name)).toEqual([
      "wovain/approval.decided",
    ]);
    await ctx.db
      .insert(run)
      .values({ id: "run_1", seed: "s", userId: USER_ID });
    startRun.mockResolvedValue({ id: "run_1" });
    const outcome = await executeRunStart(ctx.actor, queued?.id ?? "");
    expect(outcome).toEqual({ runId: "run_1", status: "done" });
    expect(startRun).toHaveBeenCalledWith(ctx.actor, {
      autopilot: false,
      countries: ["GB", "US"],
      dailyBudget: 15,
      seed: "gorpcore looks for fans of Salomon",
    });
    const [done] = await ctx.db.select().from(approval);
    expect(done).toMatchObject({
      result: { autopilot: false, runId: "run_1" },
      status: "done",
    });
    const [row] = await ctx.db.select().from(suggestion);
    expect(row).toMatchObject({ runId: "run_1", status: "accepted" });
    // A retry finds the approval done and starts nothing.
    expect(await executeRunStart(ctx.actor, queued?.id ?? "")).toEqual({
      status: "skipped",
    });
    expect(startRun).toHaveBeenCalledTimes(1);
  });

  it("lets the run decide its gates on publish_ads_paused, and records failures", async () => {
    await setAutonomy(ctx.actor, {
      dailySpendCapCents: 0,
      level: "publish_ads_paused",
      monthlySpendCapCents: 0,
      paused: false,
    });
    const id = await suggest();
    await actOnSuggestion(ctx.actor, id, NOW);
    const [queued] = await ctx.db.select().from(approval);
    startRun.mockRejectedValue(new Error("Connect fal first"));
    const outcome = await executeRunStart(ctx.actor, queued?.id ?? "");
    expect(outcome).toEqual({ error: "Connect fal first", status: "failed" });
    expect(startRun).toHaveBeenCalledWith(
      ctx.actor,
      expect.objectContaining({ autopilot: true })
    );
    const [failed] = await ctx.db.select().from(approval);
    expect(failed).toMatchObject({
      error: "Connect fal first",
      status: "failed",
    });
  });

  it("doesn't queue without the autopilot entitlement", async () => {
    ctx.fakes.flags["autopilot"] = false;
    const id = await suggest();
    expect(await actOnSuggestion(ctx.actor, id, NOW)).toBe("not_entitled");
    expect(await ctx.db.select().from(approval)).toEqual([]);
  });

  it("stops at the plan's daily credit cap", async () => {
    // Free: 15 credits a day; a run is about 13.
    expect(runEstimate()).toBe(13);
    await ctx.db
      .insert(run)
      .values({ id: "run_0", seed: "s", userId: USER_ID });
    await ctx.db.insert(approval).values({
      actionType: "autopilot.run.start",
      domain: "autopilot",
      policyReason: "within_level",
      proposedBy: "autopilot",
      result: { runId: "run_0" },
      risk: "R1",
      status: "done",
      title: "Earlier drop",
      userId: USER_ID,
    });
    await ctx.db.insert(creditReservation).values({
      createdAt: new Date(),
      credits: 3,
      runId: "run_0",
      status: "settled",
      step: "research",
      takes: [],
      userId: USER_ID,
    });
    const id = await suggest();
    expect(await actOnSuggestion(ctx.actor, id, new Date())).toBe("credit_cap");
    const [row] = await ctx.db.select().from(suggestion);
    expect(row).toMatchObject({ approvalId: null, status: "new" });
    const steps = await ctx.db.select().from(decisionTrace);
    expect(steps.some((entry) => entry.step === "credit_cap")).toBe(true);
  });
});
