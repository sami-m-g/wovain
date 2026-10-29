import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { applyGrant } from "@wovain/billing/mirror";
import { createBilling } from "@wovain/billing/service";
import type { WovainEvent } from "@wovain/core/events";
import { fakeNemotron } from "@wovain/core/test-doubles";
import type { ProviderId, ToolCall } from "@wovain/core/upstream";
import type { Database } from "@wovain/db";
import { relations } from "@wovain/db/relations";
import { user } from "@wovain/db/schema/auth";
import {
  approval,
  brandProfile,
  decisionTrace,
} from "@wovain/db/schema/autonomy";
import { campaign, design, idea, product, run } from "@wovain/db/schema/seller";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Core } from "../services";
import type { Actor } from "./actor";
import {
  approvalsFor,
  autonomyOf,
  setAutonomy,
  spendToDate,
} from "./approvals";
import { createProductCampaign } from "./campaigns";
import {
  claimMediaApproval,
  executeMediaApproval,
  performMediaApproval,
  recordMediaOutcome,
  pauseCampaignNow,
  requestCampaignActivation,
  syncCampaignStatus,
} from "./media";
import { QLOO_BRAND, qlooAudienceCore } from "./qloo-audience-fixture";

// Live media buying against real Postgres (PGlite, with the app's
// migrations) and a fake Meta Ads MCP server in draft mode: staging, the
// read-back, activation through the approval queue and pausing.

const MIGRATIONS = fileURLToPath(
  new URL("../../../../db/src/migrations", import.meta.url)
);
const USER_ID = "user_1";
const REQUEST = "6f1c2c1e-6d55-4b8e-9b5e-2f5a3c1d9e01";
const AGAIN = "0b8c6a4e-1d2f-4a3b-8c9d-7e6f5a4b3c2d";

// Meta in draft mode: creates stage DRAFT objects; publishing them as
// active makes them live, IN_PROCESS (Meta's review), then ACTIVE.
const draftMeta = ({
  pixels = ["px_1"],
  readBackFails = false,
}: { pixels?: string[]; readBackFails?: boolean } = {}) => {
  const made: { id: string; level: string }[] = [];
  let live: "none" | "active" | "paused" = "none";
  const calls: { args: Record<string, unknown>; tool: string }[] = [];
  const create = (level: string, key: string) => () => {
    const id = `${level}_${made.length + 1}`;
    made.push({ id, level });
    return { [key]: id, status: "DRAFT" };
  };
  const replies: Record<string, (args: Record<string, unknown>) => unknown> = {
    ads_activate_entity: () => {
      live = "active";
      return { status: "PUBLISHING" };
    },
    ads_create_ad: create("ad", "ad_id"),
    ads_create_ad_set: create("adset", "ad_set_id"),
    ads_create_campaign: create("campaign", "campaign_id"),
    ads_create_creative: create("creative", "creative_id"),
    ads_get_ad_account_pages: () => ({ pages: [{ page_id: "p_1" }] }),
    ads_get_ad_accounts: () => ({
      ad_accounts: [{ ad_account_id: "222", is_ads_mcp_enabled: true }],
    }),
    ads_get_ad_entities: (args) => {
      const objects = made.filter((item) => item.level !== "creative");
      if (args["object_state"] === "draft") {
        return {
          ad_drafts:
            live === "none"
              ? objects.map((item) => ({ ad_object_id: item.id }))
              : [],
        };
      }
      if (live === "none") {
        return { ad_entities: [] };
      }
      if (readBackFails) {
        throw new Error("ads_get_ad_entities: timed out");
      }
      return {
        ad_entities: objects
          .filter((item) => item.level === args["level"])
          .map((item) => ({
            effective_status: live === "active" ? "IN_PROCESS" : "PAUSED",
            id: item.id,
            status: live === "active" ? "ACTIVE" : "PAUSED",
          })),
      };
    },
    ads_get_datasets: () => ({
      data: pixels.map((id) => ({ id, name: `Pixel ${id}` })),
    }),
    ads_update_entity: () => {
      live = "paused";
      return { is_draft: false };
    },
  };
  const call: ToolCall = async (tool, args) => {
    calls.push({ args, tool });
    const reply = replies[tool];
    if (reply === undefined) {
      throw new Error(`unexpected tool ${tool}`);
    }
    return await Promise.resolve(reply(args));
  };
  const argsOf = (tool: string) =>
    calls.find((item) => item.tool === tool)?.args;
  return { argsOf, call, calls };
};

// A Meta that refuses every call, as an account without a payment method.
const refusingMeta: ToolCall = async (tool) => {
  await Promise.resolve();
  throw new Error(`${tool}: Your ad account has no payment method`);
};

const setup = async (
  meta: ToolCall,
  flags: string[] = ["media-buying-live", "autonomy-approvals"]
) => {
  const client = new PGlite();
  const db = drizzle({ client, relations });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  await db.insert(user).values({
    email: "merchant@example.com",
    emailVerified: true,
    id: USER_ID,
    name: "Merchant",
  });
  await applyGrant(db as unknown as Database, {
    grantId: "grant_plan",
    periodKey: "2026-10-01T00:00:00Z",
    rollover: false,
    source: "plan",
    units: 1000,
    userId: USER_ID,
  });
  const { ask } = fakeNemotron({
    variants: [
      { angle: "humor", headline: "Not today", message: "For quiet nights." },
      { angle: "gift", headline: "Gift a reader", message: "They'll love it." },
    ],
  });
  const providers: Partial<Record<ProviderId, ToolCall>> = { meta };
  const sent: WovainEvent[] = [];
  const core = {
    flags: {
      isOn: async (name: string) => await Promise.resolve(flags.includes(name)),
    },
    nemotron: ask,
    ...qlooAudienceCore,
    upstream: {
      session: async (
        provider: ProviderId,
        _grant: unknown,
        _log: unknown,
        work: (call: ToolCall) => Promise<unknown>
      ) => {
        const call = providers[provider];
        if (call === undefined) {
          throw new Error(`${provider} isn't faked`);
        }
        return await work(call);
      },
    },
  } as unknown as Core;
  const actor: Actor = {
    billing: createBilling({
      BETTER_AUTH_URL: "http://localhost:3000",
      POLAR_ENVIRONMENT: "sandbox",
    }),
    core,
    db: db as unknown as Database,
    events: {
      send: async (event) => {
        sent.push(event);
        await Promise.resolve();
      },
    },
    mailer: vi.fn(async () => {
      await Promise.resolve();
    }),
    userId: USER_ID,
  };
  return { actor, db, sent };
};

type Db = Awaited<ReturnType<typeof setup>>["db"];

// A published product from an approved design, ready to advertise.
const seedProduct = async (db: Db) => {
  const [started] = await db
    .insert(run)
    .values({ seed: "cozy reading", status: "running", userId: USER_ID })
    .returning();
  const [found] = await db
    .insert(idea)
    .values({
      avoidNames: [],
      rank: 1,
      research: { theme: "Reading cats" } as never,
      runId: started?.id ?? null,
      score: 80,
      seed: "cozy reading",
      theme: "Reading cats",
      userId: USER_ID,
    })
    .returning();
  const [drawn] = await db
    .insert(design)
    .values({
      artworkHeight: 2880,
      artworkUrl: "https://v3.fal.media/a.png",
      artworkWidth: 2880,
      brief: {
        artPrompt: "A sleepy cat reading under a lamp",
        description: "Two lines.",
        garmentColors: ["black"],
        printedText: [],
        title: "Reading Cat Tee",
      },
      ideaId: found?.id ?? "",
      judgment: {
        checks: [],
        coach: "Good",
        fixes: [],
        score: 90,
        verdict: "ready",
      },
      runId: started?.id ?? null,
      status: "approved",
      userId: USER_ID,
    })
    .returning();
  const [live] = await db
    .insert(product)
    .values({
      catalogProductId: "prd_tee",
      customizationId: "cus_1",
      designId: drawn?.id ?? "",
      mediaUri: "https://cdn.fourthwall.com/m/1.png",
      mockups: ["https://cdn.fourthwall.com/mock.png"],
      offerId: "off_1",
      price: 24,
      productUrl: "https://shop.example.com/products/reading-cat",
      status: "public",
      userId: USER_ID,
    })
    .returning();
  return live?.id ?? "";
};

const CAPS = {
  dailySpendCapCents: 2000,
  level: "draft" as const,
  // Room for $20 a day on every day of any month, so the tests don't
  // depend on today's date.
  monthlySpendCapCents: 100_000,
  paused: false,
};

const decide = async (actor: Actor, approvalId: string) =>
  await approvalsFor(actor).decide(
    { approvalId, approve: true, decidedBy: USER_ID, userId: USER_ID },
    await autonomyOf(actor),
    await spendToDate(actor)
  );

describe("live media buying", () => {
  let meta: ReturnType<typeof draftMeta>;
  let ctx: Awaited<ReturnType<typeof setup>>;
  let productId: string;

  beforeEach(async () => {
    meta = draftMeta();
    ctx = await setup(meta.call);
    productId = await seedProduct(ctx.db);
    await ctx.db.insert(brandProfile).values({
      demographics: { ageMax: 34, ageMin: 22, genders: ["female"] },
      qlooEntities: [QLOO_BRAND],
      userId: USER_ID,
    });
  });

  it("stages a sales campaign on the pixel, reads it back as a draft and never activates it", async () => {
    const staged = await createProductCampaign(ctx.actor, {
      countries: ["US"],
      dailyBudget: 15,
      productId,
    });

    expect(staged.status).toBe("draft");
    expect(meta.argsOf("ads_create_campaign")).toMatchObject({
      objective: "OUTCOME_SALES",
    });
    const adSet = meta.argsOf("ads_create_ad_set");
    expect(adSet).toMatchObject({ optimization_goal: "OFFSITE_CONVERSIONS" });
    expect(JSON.parse(String(adSet?.["targeting"]))).toMatchObject({
      age_max: 34,
      age_min: 22,
      genders: [2],
      geo_locations: { countries: ["US"] },
    });
    const link = new URL(
      String(meta.argsOf("ads_create_creative")?.["link_url"])
    );
    expect(link.searchParams.get("utm_campaign")).toBe(staged.metaCampaignId);
    expect(meta.calls.some((item) => item.tool === "ads_activate_entity")).toBe(
      false
    );
  });

  it("goes live only after the merchant approves, inside the caps", async () => {
    await setAutonomy(ctx.actor, CAPS);
    const staged = await createProductCampaign(ctx.actor, {
      countries: ["US"],
      dailyBudget: 15,
      productId,
    });

    const asked = await requestCampaignActivation(ctx.actor, {
      campaignId: staged.id,
      requestId: REQUEST,
    });
    expect(asked).toMatchObject({
      actionType: "media.campaign.activate",
      costPreview: { amountCents: 1500, currency: "USD" },
      policyReason: "starts_spend",
      status: "pending",
    });
    // Asked twice with the same request ID: one approval.
    const again = await requestCampaignActivation(ctx.actor, {
      campaignId: staged.id,
      requestId: REQUEST,
    });
    expect(again.id).toBe(asked.id);
    // Not approved yet: the executor does nothing.
    const early = await executeMediaApproval(ctx.actor, asked.id);
    expect(early.status).toBe("pending");
    expect(meta.calls.some((item) => item.tool === "ads_activate_entity")).toBe(
      false
    );

    await decide(ctx.actor, asked.id);
    const done = await executeMediaApproval(ctx.actor, asked.id);

    expect(done.status).toBe("done");
    expect(meta.argsOf("ads_activate_entity")).toMatchObject({
      entity_id: staged.metaCampaignId,
      entity_type: "campaign",
      publish_as_active: true,
    });
    const [row] = await ctx.db
      .select()
      .from(campaign)
      .where(eq(campaign.id, staged.id));
    expect(row?.status).toBe("in_review");
    // A second delivery of the event changes nothing.
    const activations = meta.calls.length;
    await executeMediaApproval(ctx.actor, asked.id);
    expect(meta.calls).toHaveLength(activations);
    const traces = await ctx.db
      .select()
      .from(decisionTrace)
      .where(eq(decisionTrace.agent, "media_executor"));
    expect(traces.map((trace) => [trace.agent, trace.step, trace.ok])).toEqual([
      ["media_executor", "activate", true],
    ]);
    expect(ctx.sent.map((event) => event.name)).toContain(
      "wovain/approval.decided"
    );
  });

  it("denies an activation over the daily cap without touching Meta", async () => {
    await setAutonomy(ctx.actor, { ...CAPS, dailySpendCapCents: 1000 });
    const staged = await createProductCampaign(ctx.actor, {
      countries: ["US"],
      dailyBudget: 15,
      productId,
    });

    const asked = await requestCampaignActivation(ctx.actor, {
      campaignId: staged.id,
      requestId: REQUEST,
    });

    expect(asked).toMatchObject({
      policyReason: "over_daily_cap",
      status: "denied",
    });
    await executeMediaApproval(ctx.actor, asked.id);
    expect(meta.calls.some((item) => item.tool === "ads_activate_entity")).toBe(
      false
    );
  });

  it("counts campaigns already committed against the daily cap", async () => {
    // $20 a day across every campaign: one $15 campaign fits, two don't.
    await setAutonomy(ctx.actor, CAPS);
    const first = await createProductCampaign(ctx.actor, {
      countries: ["US"],
      dailyBudget: 15,
      productId,
      requestId: REQUEST,
    });
    const second = await createProductCampaign(ctx.actor, {
      countries: ["US"],
      dailyBudget: 15,
      productId,
      requestId: AGAIN,
    });
    expect(second.id).not.toBe(first.id);
    const asked = await requestCampaignActivation(ctx.actor, {
      campaignId: first.id,
      requestId: REQUEST,
    });
    await decide(ctx.actor, asked.id);

    // Approved but not yet on Meta: its budget is committed already.
    const waiting = await requestCampaignActivation(ctx.actor, {
      campaignId: second.id,
      requestId: REQUEST,
    });
    expect(waiting).toMatchObject({
      policyReason: "over_daily_cap",
      status: "denied",
    });

    await executeMediaApproval(ctx.actor, asked.id);
    const live = await requestCampaignActivation(ctx.actor, {
      campaignId: second.id,
      requestId: AGAIN,
    });
    expect(live).toMatchObject({
      policyReason: "over_daily_cap",
      status: "denied",
    });
    await expect(spendToDate(ctx.actor)).resolves.toMatchObject({
      todayCents: 1500,
    });
  });

  it("checks the monthly cap against every day left in the month", async () => {
    // Oct 28: four days left, so $15 a day commits $60 of a $50 month.
    await setAutonomy(ctx.actor, { ...CAPS, monthlySpendCapCents: 5000 });
    const staged = await createProductCampaign(ctx.actor, {
      countries: ["US"],
      dailyBudget: 15,
      productId,
    });
    const spent = await spendToDate(
      ctx.actor,
      new Date("2026-10-28T12:00:00Z")
    );
    expect(spent).toEqual({ daysLeftInMonth: 4, monthCents: 0, todayCents: 0 });
    const { approval: asked } = await approvalsFor(ctx.actor).enqueue(
      {
        payload: { campaignId: staged.id },
        proposedBy: "merchant",
        spendCents: 1500,
        title: "Start",
        type: "media.campaign.activate",
        userId: USER_ID,
      },
      await autonomyOf(ctx.actor),
      spent
    );
    expect(asked).toMatchObject({
      policyReason: "over_monthly_cap",
      status: "denied",
    });
  });

  it("records an activation as done when Meta took it but the read-back failed", async () => {
    const flaky = draftMeta({ readBackFails: true });
    const own = await setup(flaky.call);
    const ownProduct = await seedProduct(own.db);
    await own.db
      .insert(brandProfile)
      .values({ qlooEntities: [QLOO_BRAND], userId: USER_ID });
    await setAutonomy(own.actor, CAPS);
    const staged = await createProductCampaign(own.actor, {
      countries: ["US"],
      dailyBudget: 15,
      productId: ownProduct,
    });
    const asked = await requestCampaignActivation(own.actor, {
      campaignId: staged.id,
      requestId: REQUEST,
    });
    await decide(own.actor, asked.id);

    const done = await executeMediaApproval(own.actor, asked.id);

    expect(flaky.argsOf("ads_activate_entity")).toBeDefined();
    expect(done).toMatchObject({
      error: null,
      result: { campaignId: staged.id, status: "publishing", verified: false },
      status: "done",
    });
    const [row] = await own.db
      .select()
      .from(campaign)
      .where(eq(campaign.id, staged.id));
    // Wovain says it may spend: Pause is offered, Start isn't.
    expect(row?.status).toBe("publishing");
  });

  it("resumes an approval a crashed executor left executing", async () => {
    await setAutonomy(ctx.actor, CAPS);
    const staged = await createProductCampaign(ctx.actor, {
      countries: ["US"],
      dailyBudget: 15,
      productId,
    });
    const asked = await requestCampaignActivation(ctx.actor, {
      campaignId: staged.id,
      requestId: REQUEST,
    });
    await decide(ctx.actor, asked.id);
    // The first attempt claimed it, then died before it recorded anything.
    await expect(claimMediaApproval(ctx.actor, asked.id)).resolves.toBe(true);

    // A second delivery doesn't take it; the retry of the same run does.
    await expect(claimMediaApproval(ctx.actor, asked.id)).resolves.toBe(false);
    await expect(
      claimMediaApproval(ctx.actor, asked.id, { resume: true })
    ).resolves.toBe(true);
    const outcome = await performMediaApproval(ctx.actor, asked.id);
    const done = await recordMediaOutcome(ctx.actor, asked.id, outcome);

    expect(done.status).toBe("done");
    // Recording again (a retried step) changes nothing.
    const again = await recordMediaOutcome(ctx.actor, asked.id, outcome);
    expect(again.status).toBe("done");
  });

  it("pauses a live campaign at once and syncs its status", async () => {
    await setAutonomy(ctx.actor, CAPS);
    const staged = await createProductCampaign(ctx.actor, {
      countries: ["US"],
      dailyBudget: 15,
      productId,
    });
    const asked = await requestCampaignActivation(ctx.actor, {
      campaignId: staged.id,
      requestId: REQUEST,
    });
    await decide(ctx.actor, asked.id);
    await executeMediaApproval(ctx.actor, asked.id);

    const paused = await pauseCampaignNow(ctx.actor, {
      campaignId: staged.id,
      requestId: AGAIN,
    });

    expect(paused).toMatchObject({
      actionType: "media.campaign.pause",
      status: "done",
    });
    expect(meta.argsOf("ads_update_entity")).toMatchObject({
      fields: JSON.stringify({ status: "PAUSED" }),
    });
    const synced = await syncCampaignStatus(ctx.actor, staged.id);
    expect(synced.status).toBe("paused");
    // A paused campaign can be asked to go live again.
    const relaunch = await requestCampaignActivation(ctx.actor, {
      campaignId: staged.id,
      requestId: AGAIN,
    });
    expect(relaunch.status).toBe("pending");
  });

  it("records a failed activation and logs it, leaving the campaign as it was", async () => {
    await setAutonomy(ctx.actor, CAPS);
    const staged = await createProductCampaign(ctx.actor, {
      countries: ["US"],
      dailyBudget: 15,
      productId,
    });
    const asked = await requestCampaignActivation(ctx.actor, {
      campaignId: staged.id,
      requestId: REQUEST,
    });
    await decide(ctx.actor, asked.id);
    const broken = await setup(refusingMeta);
    // Same database, a Meta that refuses.
    const actor = { ...ctx.actor, core: broken.actor.core };

    const failed = await executeMediaApproval(actor, asked.id);

    expect(failed.status).toBe("failed");
    expect(failed.error).toMatch(/payment method/u);
    const [row] = await ctx.db
      .select()
      .from(approval)
      .where(eq(approval.id, asked.id));
    expect(row?.status).toBe("failed");
    const [kept] = await ctx.db
      .select()
      .from(campaign)
      .where(eq(campaign.id, staged.id));
    expect(kept?.status).toBe("draft");
  });

  it("refuses activation while the flag is off", async () => {
    const off = await setup(meta.call, ["autonomy-approvals"]);
    await expect(
      requestCampaignActivation(off.actor, {
        campaignId: "anything",
        requestId: REQUEST,
      })
    ).rejects.toThrow(/isn't available/u);
  });
});
