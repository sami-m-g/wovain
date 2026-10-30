import { describe, expect, it } from "vitest";

import { createMetaGraph } from "./meta-graph";
import { evaluateMetaSetup, metaLinks, readMetaAccount } from "./meta-setup";
import type { ToolCall } from "./upstream";

// Meta's MCP answers as the tools describe them.
const metaServer = (replies: Record<string, unknown>): ToolCall => {
  const call: ToolCall = async (tool) => {
    if (!(tool in replies)) {
      throw new Error(`unexpected tool ${tool}`);
    }
    const reply = replies[tool];
    if (reply instanceof Error) {
      throw reply;
    }
    return await Promise.resolve(reply);
  };
  return call;
};

const ACCOUNT = {
  account_status: 1,
  ad_account_id: "222",
  ad_account_name: "Shop",
  business_id: "999",
  has_payment_method: false,
  is_ads_mcp_enabled: true,
};

const stateOf = (steps: ReturnType<typeof evaluateMetaSetup>, id: string) =>
  steps.find((step) => step.id === id);

describe("Meta setup", () => {
  it("links a new account to Meta's payment and Page screens", async () => {
    const facts = await readMetaAccount(
      metaServer({
        ads_get_ad_account_pages: { pages: [] },
        ads_get_ad_accounts: { ad_accounts: [ACCOUNT] },
        ads_get_ig_accounts: { ig_accounts: [] },
        ads_get_user_pages: { pages: [] },
      })
    );
    const steps = evaluateMetaSetup({ facts, graph: undefined });
    expect(stateOf(steps, "ad_account")?.state).toBe("done");
    expect(stateOf(steps, "payment")).toMatchObject({
      how: "link",
      href: metaLinks.payment("222"),
      state: "todo",
    });
    expect(stateOf(steps, "page")).toMatchObject({
      altHref: metaLinks.pageCreate,
      href: metaLinks.pageLink("999"),
      state: "todo",
    });
    expect(stateOf(steps, "instagram")).toMatchObject({
      required: false,
      state: "todo",
    });
    expect(stateOf(steps, "safety_rules")?.state).toBe("waiting");
  });

  it("ticks off a paid account with a Page, and keeps Instagram unknown when Meta won't say", async () => {
    const facts = await readMetaAccount(
      metaServer({
        ads_get_ad_account_pages: {
          pages: [{ page_id: "p_1", page_name: "Shop" }],
        },
        ads_get_ad_accounts: {
          ad_accounts: [{ ...ACCOUNT, has_payment_method: true }],
        },
        ads_get_ig_accounts: new Error("instagram_basic not granted"),
      })
    );
    const steps = evaluateMetaSetup({
      facts,
      graph: {
        granted: ["ads_management", "business_management"],
        state: "ready",
      },
    });
    expect(
      steps.filter((step) => step.required).map((step) => step.state)
    ).toEqual(["done", "done", "done", "done"]);
    expect(stateOf(steps, "instagram")?.state).toBe("check");
  });

  it("sends a held account to Meta's account quality screen", async () => {
    const facts = await readMetaAccount(
      metaServer({
        ads_get_ad_account_pages: { pages: [] },
        ads_get_ad_accounts: {
          ad_accounts: [{ ...ACCOUNT, account_status: 2 }],
        },
        ads_get_ig_accounts: { ig_accounts: [] },
        ads_get_user_pages: { pages: [] },
      })
    );
    const steps = evaluateMetaSetup({ facts, graph: undefined });
    expect(stateOf(steps, "ad_account")).toMatchObject({
      href: metaLinks.accountQuality,
      state: "waiting",
    });
    expect(stateOf(steps, "payment")?.state).toBe("waiting");
  });

  it("asks for an ad account when Meta opens none to wovain", () => {
    const steps = evaluateMetaSetup({
      facts: { account: undefined, instagram: undefined, pages: [] },
      graph: undefined,
    });
    expect(stateOf(steps, "ad_account")).toMatchObject({
      href: metaLinks.adAccounts(null),
      state: "todo",
    });
  });

  it("asks to reconnect when Graph is missing a permission", () => {
    const steps = evaluateMetaSetup({
      facts: {
        account: {
          businessId: null,
          hasPaymentMethod: true,
          id: "222",
          name: null,
          status: "ACTIVE",
        },
        instagram: [],
        pages: [],
      },
      graph: {
        granted: ["ads_read"],
        missing: ["ads_management"],
        state: "missing",
      },
    });
    expect(stateOf(steps, "safety_rules")).toMatchObject({
      how: "reconnect",
      state: "todo",
    });
  });
});

// Graph answering each path from `answers`; every request is recorded.
const graphWith = (
  answers: Record<string, { status: number; body: unknown }>
) => {
  const seen: { auth: string | null; path: string }[] = [];
  const graph = createMetaGraph({
    fetch: async (input, init) => {
      const url = new URL(String(input));
      const path = url.pathname.replace("/v26.0", "");
      seen.push({
        auth: new Headers(init?.headers).get("authorization"),
        path,
      });
      const answer = answers[path] ?? { body: {}, status: 404 };
      return await Promise.resolve(
        Response.json(answer.body, { status: answer.status })
      );
    },
    graphUrl: "https://graph.facebook.com/v26.0",
  });
  return { graph, seen };
};

describe("Graph readiness", () => {
  it("is ready with both permissions and a readable rules library", async () => {
    const { graph, seen } = graphWith({
      "/act_222/adrules_library": { body: { data: [] }, status: 200 },
      "/me/permissions": {
        body: {
          data: [
            { permission: "ads_management", status: "granted" },
            { permission: "business_management", status: "granted" },
          ],
        },
        status: 200,
      },
    });
    await expect(graph.readiness("tok", "222")).resolves.toMatchObject({
      state: "ready",
    });
    expect(seen.map((call) => call.auth)).toEqual(["Bearer tok", "Bearer tok"]);
  });

  it("names a permission the merchant declined", async () => {
    const { graph } = graphWith({
      "/me/permissions": {
        body: {
          data: [
            { permission: "ads_management", status: "granted" },
            { permission: "business_management", status: "declined" },
          ],
        },
        status: 200,
      },
    });
    await expect(graph.readiness("tok", "222")).resolves.toMatchObject({
      missing: ["business_management"],
      state: "missing",
    });
  });

  it("reports a token Graph refuses", async () => {
    const { graph } = graphWith({
      "/me/permissions": {
        body: { error: { code: 190, message: "Invalid OAuth access token" } },
        status: 400,
      },
    });
    await expect(graph.readiness("tok", "222")).resolves.toMatchObject({
      state: "refused",
    });
  });
});
