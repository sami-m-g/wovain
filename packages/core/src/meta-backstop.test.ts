import { describe, expect, it } from "vitest";

import { AD_RULE_DEFAULTS } from "./ad-rules";
import {
  BACKSTOP_PREFIX,
  backstopRulesFor,
  isBackstopRule,
  planBackstop,
} from "./meta-backstop";
import { createMetaGraph } from "./meta-graph";

const settings = { ...AD_RULE_DEFAULTS };
const caps = { dailySpendCapCents: 2000, monthlySpendCapCents: 30_000 };
const shirt = { economics: { priceCents: 3500, profitCents: 1000 } };

const filtersOf = (rules: ReturnType<typeof backstopRulesFor>, kind: string) =>
  rules.find((rule) => rule.kind === kind)?.spec.evaluation_spec.filters;

describe("the Meta backstop rules", () => {
  it("mirrors the kills (looser) and the stops of one campaign", () => {
    const rules = backstopRulesFor(
      { ...shirt, metaCampaignId: "120" },
      settings,
      caps
    );
    expect(rules.map((rule) => rule.kind)).toEqual([
      "kill_no_sale",
      "kill_cart_no_sale",
      "stop_daily_cap",
      "stop_monthly_cap",
      "stop_loss_limit",
    ]);
    // $10 profit per sale: wovain kills at $10 and $20, Meta at 1.2x that.
    expect(filtersOf(rules, "kill_no_sale")).toContainEqual({
      field: "spent",
      operator: "GREATER_THAN",
      value: 1200,
    });
    expect(filtersOf(rules, "kill_cart_no_sale")).toContainEqual({
      field: "spent",
      operator: "GREATER_THAN",
      value: 2400,
    });
    expect(filtersOf(rules, "kill_no_sale")).toContainEqual({
      field: "campaign.id",
      operator: "IN",
      value: ["120"],
    });
    expect(filtersOf(rules, "stop_daily_cap")).toContainEqual({
      field: "time_preset",
      operator: "EQUAL",
      value: "TODAY",
    });
    expect(filtersOf(rules, "stop_loss_limit")).toContainEqual({
      field: "offsite_conversion.fb_pixel_purchase",
      operator: "LESS_THAN",
      value: 1,
    });
    for (const rule of rules) {
      expect(rule.spec.execution_spec).toEqual({ execution_type: "PAUSE" });
      expect(rule.spec.schedule_spec).toEqual({ schedule_type: "SEMI_HOURLY" });
      expect(isBackstopRule(rule.name)).toBe(true);
    }
  });

  it("skips the kills with no profit per sale, and caps left at zero", () => {
    const rules = backstopRulesFor(
      { economics: undefined, metaCampaignId: "120" },
      settings,
      { dailySpendCapCents: 0, monthlySpendCapCents: 0 }
    );
    expect(rules.map((rule) => rule.kind)).toEqual(["stop_loss_limit"]);
  });

  it("renames a rule when its threshold changes", () => {
    const before = backstopRulesFor(
      { ...shirt, metaCampaignId: "120" },
      settings,
      caps
    );
    const after = backstopRulesFor(
      { ...shirt, metaCampaignId: "120" },
      { ...settings, lossLimitCents: 9000 },
      caps
    );
    const name = (rules: typeof before) =>
      rules.find((rule) => rule.kind === "stop_loss_limit")?.name;
    expect(name(after)).not.toBe(name(before));
    expect(before[0]?.name).toBe(after[0]?.name);
  });

  it("creates what's missing and deletes only wovain's stale rules", () => {
    const wanted = backstopRulesFor(
      { ...shirt, metaCampaignId: "120" },
      settings,
      caps
    );
    const [kept] = wanted;
    const plan = planBackstop(wanted, [
      { id: "1", name: kept?.name ?? "" },
      { id: "2", name: `${BACKSTOP_PREFIX} 99 stop_daily_cap abcd1234` },
      { id: "3", name: "My own rule" },
    ]);
    expect(plan.create).toHaveLength(wanted.length - 1);
    expect(plan.remove).toEqual([
      { id: "2", name: `${BACKSTOP_PREFIX} 99 stop_daily_cap abcd1234` },
    ]);
  });
});

describe("automated rules on Graph", () => {
  it("lists, creates and deletes rules", async () => {
    const seen: { body: string | null; key: string }[] = [];
    const graph = createMetaGraph({
      fetch: async (input, init) => {
        const url = new URL(String(input));
        const key = `${init?.method ?? "GET"} ${url.pathname.replace("/v26.0", "")}`;
        seen.push({ body: init?.body?.toString() ?? null, key });
        const answers: Record<string, unknown> = {
          "DELETE /55": { success: true },
          "GET /act_222/adrules_library": { data: [{ id: "55", name: "x" }] },
          "POST /act_222/adrules_library": { id: "56" },
        };
        return await Promise.resolve(Response.json(answers[key] ?? {}));
      },
      graphUrl: "https://graph.facebook.com/v26.0",
    });
    expect(await graph.rules("token", "222")).toEqual([
      { id: "55", name: "x" },
    ]);
    const [rule] = backstopRulesFor(
      { ...shirt, metaCampaignId: "120" },
      settings,
      caps
    );
    if (rule === undefined) {
      throw new Error("expected a rule");
    }
    expect(
      await graph.createRule("token", "222", { ...rule.spec, name: rule.name })
    ).toBe("56");
    await graph.deleteRule("token", "55");
    expect(seen.map((each) => each.key)).toEqual([
      "GET /act_222/adrules_library",
      "POST /act_222/adrules_library",
      "DELETE /55",
    ]);
    const created = new URLSearchParams(seen[1]?.body ?? "");
    expect(created.get("status")).toBe("ENABLED");
    expect(JSON.parse(created.get("execution_spec") ?? "{}")).toEqual({
      execution_type: "PAUSE",
    });
  });
});
