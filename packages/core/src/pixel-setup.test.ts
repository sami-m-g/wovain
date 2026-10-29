import { describe, expect, it } from "vitest";

import { createMetaGraph } from "./meta-graph";
import { chooseDataset, datasetNameFor, newTestEventCode } from "./pixel-setup";

// A Graph that answers per method and path, and records what it was sent.
const fakeGraph = (answers: Record<string, unknown>) => {
  const seen: { body: string | null; key: string }[] = [];
  const graph = createMetaGraph({
    fetch: async (input, init) => {
      const url = new URL(String(input));
      const key = `${init?.method ?? "GET"} ${url.pathname.replace("/v26.0", "")}`;
      seen.push({ body: init?.body?.toString() ?? null, key });
      const body = answers[key];
      return await Promise.resolve(
        body === undefined
          ? Response.json({ error: { message: "no" } }, { status: 404 })
          : Response.json(body)
      );
    },
    graphUrl: "https://graph.facebook.com/v26.0",
  });
  return { graph, seen };
};

const dataset = (
  id: string,
  name: string | null,
  lastFiredAt: string | null
) => ({
  id,
  lastFiredAt,
  name,
});

describe("choosing the dataset", () => {
  it("takes the only one, else wovain's, else the last to fire", () => {
    expect(chooseDataset([])).toBeUndefined();
    expect(chooseDataset([dataset("1", "Old", null)])?.id).toBe("1");
    expect(
      chooseDataset([
        dataset("1", "Old", "2026-10-01T00:00:00+0000"),
        dataset("2", "wovain - Shop", null),
      ])?.id
    ).toBe("2");
    expect(
      chooseDataset([
        dataset("1", "A", "2026-09-01T00:00:00+0000"),
        dataset("2", "B", "2026-10-01T00:00:00+0000"),
        dataset("3", "C", null),
      ])?.id
    ).toBe("2");
  });

  it("names it after the shop, and makes Events Manager test codes", () => {
    expect(datasetNameFor("Night Owls")).toBe("wovain - Night Owls");
    expect(datasetNameFor()).toBe("wovain");
    expect(newTestEventCode()).toMatch(/^TEST\d{5}$/u);
  });
});

describe("dataset set-up on Graph", () => {
  it("creates it under the business and shares it with the ad account", async () => {
    const { graph, seen } = fakeGraph({
      "GET /act_222": { business: { id: "999" } },
      "POST /777/shared_accounts": { success: true },
      "POST /999/adspixels": { id: "777" },
    });
    expect(await graph.createDataset("token", "222", "wovain - Shop")).toEqual({
      businessId: "999",
      id: "777",
    });
    expect(seen.map((each) => each.key)).toEqual([
      "GET /act_222",
      "POST /999/adspixels",
      "POST /777/shared_accounts",
    ]);
    expect(seen[2]?.body).toBe("account_id=222&business=999");
  });

  it("creates it on a personal ad account, with nothing to share", async () => {
    const { graph, seen } = fakeGraph({
      "GET /act_222": {},
      "POST /act_222/adspixels": { id: "778" },
    });
    expect(await graph.createDataset("token", "222", "wovain")).toEqual({
      businessId: undefined,
      id: "778",
    });
    expect(seen).toHaveLength(2);
  });

  it("sends a PageView as a test event", async () => {
    const { graph, seen } = fakeGraph({
      "POST /777/events": { events_received: 1 },
    });
    expect(
      await graph.sendTestEvent("token", "777", {
        now: new Date("2026-10-29T12:00:00Z"),
        sourceUrl: "https://shop.example.com",
        testEventCode: "TEST12345",
      })
    ).toBe(1);
    const sent = new URLSearchParams(seen[0]?.body ?? "");
    expect(sent.get("test_event_code")).toBe("TEST12345");
    expect(JSON.parse(sent.get("data") ?? "[]")).toEqual([
      expect.objectContaining({
        action_source: "website",
        event_name: "PageView",
        event_source_url: "https://shop.example.com",
        event_time: 1_793_275_200,
      }),
    ]);
  });

  it("lists the account's datasets with when each last fired", async () => {
    const { graph } = fakeGraph({
      "GET /act_222/adspixels": {
        data: [{ id: "1", last_fired_time: "2026-10-01T00:00:00+0000" }],
      },
    });
    expect(await graph.datasets("token", "222")).toEqual([
      dataset("1", null, "2026-10-01T00:00:00+0000"),
    ]);
  });
});
