import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import type { Core } from "@wovain/core/core";
import type { WovainEvent } from "@wovain/core/events";
import type { ToolCall } from "@wovain/core/upstream";
import type { Database } from "@wovain/db";
import { relations } from "@wovain/db/relations";
import { user } from "@wovain/db/schema/auth";
import { campaign, design, idea, product } from "@wovain/db/schema/seller";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";

import type { Actor } from "./actor";
import { setLossLimit } from "./ad-rules";
import { requestBackstopSync, syncBackstop } from "./backstop";

// The Meta backstop on real Postgres (PGlite, with the app's migrations)
// and a fake Graph that keeps the ad account's automated rules.

const MIGRATIONS = fileURLToPath(
  new URL("../../../db/src/migrations", import.meta.url)
);
const USER_ID = "user_1";

const fakeGraph = () => {
  const rules = new Map<string, { account: string; name: string }>([
    ["own", { account: "act1", name: "The merchant's own rule" }],
  ]);
  let next = 1;
  return {
    graph: {
      createRule: async (
        _token: string,
        account: string,
        rule: { name: string }
      ) => {
        const id = `r${next}`;
        next += 1;
        rules.set(id, { account, name: rule.name });
        return await Promise.resolve(id);
      },
      deleteRule: async (_token: string, id: string) => {
        rules.delete(id);
        await Promise.resolve();
      },
      rules: async (_token: string, account: string) =>
        await Promise.resolve(
          [...rules]
            .filter(([, rule]) => rule.account === account)
            .map(([id, rule]) => ({ id, name: rule.name }))
        ),
    },
    rules,
  };
};

// The backstop reads Graph only, never the Ads MCP.
const noTool: ToolCall = async () =>
  await Promise.reject(new Error("no MCP call expected"));

const setup = async (flag = true) => {
  const client = new PGlite();
  const db = drizzle({ client, relations });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  await db.insert(user).values({
    email: "merchant@example.com",
    emailVerified: true,
    id: USER_ID,
    name: "Merchant",
  });
  const [found] = await db
    .insert(idea)
    .values({
      avoidNames: [],
      rank: 1,
      research: {} as never,
      score: 80,
      seed: "cats",
      theme: "Cats",
      userId: USER_ID,
    })
    .returning();
  const [drawn] = await db
    .insert(design)
    .values({
      artworkHeight: 10,
      artworkUrl: "https://example.com/a.png",
      artworkWidth: 10,
      brief: {} as never,
      ideaId: found?.id ?? "",
      judgment: {} as never,
      userId: USER_ID,
    })
    .returning();
  const [made] = await db
    .insert(product)
    .values({
      catalogProductId: "cp",
      customizationId: "cu",
      designId: drawn?.id ?? "",
      mediaUri: "m",
      mockups: [],
      offerId: "o",
      price: 25,
      userId: USER_ID,
    })
    .returning();
  const [staged] = await db
    .insert(campaign)
    .values({
      adAccountId: "act1",
      adIds: ["ad1"],
      adSetId: "set1",
      copy: [],
      creativeIds: [],
      dailyBudgetCents: 1000,
      metaCampaignId: "mc1",
      pageId: "p",
      productId: made?.id ?? "",
      status: "active",
      userId: USER_ID,
    })
    .returning();
  const meta = fakeGraph();
  const sent: WovainEvent[] = [];
  const actor = {
    core: {
      flags: { isOn: async () => await Promise.resolve(flag) },
      metaGraph: meta.graph,
      upstream: {
        session: async (
          _provider: unknown,
          _grant: unknown,
          _log: unknown,
          work: (call: ToolCall, token: () => Promise<string>) => unknown
        ) => await work(noTool, async () => await Promise.resolve("token")),
      },
    } as unknown as Core,
    db: db as unknown as Database,
    events: {
      send: async (event: WovainEvent) => {
        sent.push(event);
        await Promise.resolve();
      },
    },
    userId: USER_ID,
  } as unknown as Actor;
  return { actor, campaignId: staged?.id ?? "", db, meta, sent };
};

const ours = (rules: Map<string, { name: string }>) =>
  [...rules.values()]
    .map((rule) => rule.name)
    .filter((name) => name.startsWith("wovain backstop"));

describe("the Meta backstop", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;

  beforeEach(async () => {
    ctx = await setup();
  });

  it("mirrors the campaign's rules once, and leaves the merchant's own", async () => {
    expect(await syncBackstop(ctx.actor)).toEqual({
      created: 3,
      kept: 0,
      removed: 0,
    });
    // Kills from the product's profit, and the loss limit; no caps set.
    expect(ours(ctx.meta.rules).map((name) => name.split(" ")[3])).toEqual([
      "kill_no_sale",
      "kill_cart_no_sale",
      "stop_loss_limit",
    ]);
    expect(await syncBackstop(ctx.actor)).toEqual({
      created: 0,
      kept: 3,
      removed: 0,
    });
    expect(ctx.meta.rules.get("own")).toBeDefined();
  });

  it("follows a new loss limit, and asks for a sync when it changes", async () => {
    await syncBackstop(ctx.actor);
    const before = ours(ctx.meta.rules);
    await setLossLimit(ctx.actor, 9000);
    await requestBackstopSync(ctx.actor);
    expect(ctx.sent).toEqual([
      { data: { userId: USER_ID }, name: "wovain/optimizer.tick" },
    ]);
    expect(await syncBackstop(ctx.actor)).toEqual({
      created: 1,
      kept: 2,
      removed: 1,
    });
    expect(ours(ctx.meta.rules)).not.toEqual(before);
    expect(ours(ctx.meta.rules)).toHaveLength(3);
  });

  it("removes the rules when the campaign ends", async () => {
    await syncBackstop(ctx.actor);
    await ctx.db.update(campaign).set({ status: "archived" });
    expect(await syncBackstop(ctx.actor)).toEqual({
      created: 0,
      kept: 0,
      removed: 3,
    });
    expect(ours(ctx.meta.rules)).toEqual([]);
    expect(ctx.meta.rules.get("own")).toBeDefined();
  });

  it("does nothing with the flag off", async () => {
    const off = await setup(false);
    expect(await syncBackstop(off.actor)).toBe("flag_off");
    expect(ours(off.meta.rules)).toEqual([]);
  });
});
