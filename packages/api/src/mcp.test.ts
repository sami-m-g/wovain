import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { ORPCError } from "@orpc/server";
import type { RouterClient } from "@orpc/server";
import { describe, expect, it, vi } from "vitest";

import { createMcpServer } from "./mcp";
import type { AppRouter } from "./routers/index";

// The ChatGPT app's tools as an MCP client sees them: each tool calls its
// oRPC procedure (mocked here) and answers JSON, or the error's why, fix
// and connect link.

// The widgets' HTML is built (packages/widgets), which the tests don't wait
// for; any page will do here.
vi.mock("@wovain/widgets/html", () => ({
  widgetHtml: new Proxy({}, { get: () => "<!doctype html>" }),
}));

const APP_URL = "https://wovain.test";

const connect = async (router: object) => {
  const server = createMcpServer(router as RouterClient<AppRouter>, {
    appUrl: APP_URL,
    resourceDomains: [],
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return client;
};

const textOf = (result: Awaited<ReturnType<Client["callTool"]>>) =>
  (result.content as { text: string }[]).map((part) => part.text).join("\n");

describe("MCP server", () => {
  it("lists one tool per seller-flow step", async () => {
    const client = await connect({});
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).toSorted()).toEqual([
      "approve_design",
      "approve_ideas",
      "create_campaign",
      "create_product",
      "generate_design",
      "get_run",
      "list_connections",
      "publish_product",
      "reject_design",
      "research_trends",
      "start_run",
    ]);
  });

  it("gives a connect link for each provider that isn't connected", async () => {
    const list = vi.fn(
      async () =>
        await Promise.resolve([
          {
            connectedAt: "2026-10-01",
            needsReconnect: false,
            provider: "fourthwall",
          },
          { connectedAt: "2026-10-01", needsReconnect: true, provider: "meta" },
        ])
    );
    const client = await connect({ connections: { list } });
    const result = await client.callTool({
      arguments: {},
      name: "list_connections",
    });
    expect(result.structuredContent).toEqual({
      result: [
        { connected: true, connectedAt: "2026-10-01", provider: "fourthwall" },
        {
          connectUrl: `${APP_URL}/api/connections/meta/start`,
          connected: false,
          needsReconnect: true,
          provider: "meta",
        },
        {
          connectUrl: `${APP_URL}/api/connections/fal/start`,
          connected: false,
          provider: "fal",
        },
      ],
    });
  });

  it.each([
    [
      "start_run",
      { seed: "y2k racing" },
      ["runs", "start"],
      { seed: "y2k racing" },
    ],
    [
      "approve_ideas",
      { ideaIds: ["i1"], runId: "r1" },
      ["runs", "approveIdeas"],
      { id: "r1", ideaIds: ["i1"] },
    ],
    [
      "approve_design",
      { designId: "d1" },
      ["designs", "approve"],
      { id: "d1" },
    ],
    ["reject_design", { designId: "d1" }, ["designs", "reject"], { id: "d1" }],
    [
      "publish_product",
      { productId: "p1" },
      ["products", "publish"],
      { id: "p1" },
    ],
    [
      "create_campaign",
      { productId: "p1" },
      ["campaigns", "create"],
      { productId: "p1" },
    ],
    ["get_run", { runId: "r1" }, ["runs", "get"], { id: "r1" }],
  ])(
    "%s calls its procedure with the tool's arguments",
    async (name, args, [group = "", procedure = ""], expected) => {
      const handler = vi.fn(async () => await Promise.resolve({ ok: true }));
      const client = await connect({ [group]: { [procedure]: handler } });
      const result = await client.callTool({ arguments: args, name });
      expect(handler).toHaveBeenCalledWith(expected);
      expect(result.structuredContent).toEqual({ result: { ok: true } });
    }
  );

  it("answers a refused step with why, fix and the connect link", async () => {
    const research = vi.fn().mockRejectedValue(
      new ORPCError("PRECONDITION_FAILED", {
        data: { fix: "Connect fal.", provider: "fal", why: "No fal key." },
        message: "fal isn't connected",
      })
    );
    const client = await connect({ ideas: { research } });
    const result = await client.callTool({
      arguments: { seed: "y2k" },
      name: "research_trends",
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      `fal isn't connected\nNo fal key.\nConnect fal.\nConnect link: ${APP_URL}/api/connections/fal/start`
    );
  });
});
