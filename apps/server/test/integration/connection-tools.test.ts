import { expect, test } from "vitest";
import { z } from "zod";

import { localCipher } from "../../src/lib/cipher.ts";
import { createConnections } from "../../src/lib/connections.ts";
import { createUpstream } from "../../src/lib/upstream.ts";
import { connectWith, fakeUpstream } from "../fake-upstream.ts";
import { connectClient, testStorage, testStore } from "../helpers.ts";

const site = "https://wovain.test";

const setup = async () => {
  const fake = fakeUpstream("fourthwall");
  const connections = createConnections(testStorage().db, localCipher());
  const upstream = createUpstream({ connections, fetch: fake.fetch, site });
  const client = await connectClient({}, testStore(), { upstream });
  return { client, connections, fake, upstream };
};

test("the instructions and playbooks send the agent to list_connections first", async () => {
  const { client } = await setup();
  expect(client.getInstructions()).toContain("list_connections");
  expect(client.getInstructions()).toContain("connect_account");
  const playbooks = await Promise.all(
    ["design", "ads", "campaign", "autopilot"].map(
      async (step) =>
        await client.callTool({ arguments: { step }, name: "get_playbook" })
    )
  );
  for (const result of playbooks) {
    expect(JSON.stringify(result.content)).toContain("list_connections");
  }
});

test("list_connections shows who is connected; Meta needs its app configured", async () => {
  const { client, fake, upstream } = await setup();
  const before = await client.callTool({
    arguments: {},
    name: "list_connections",
  });
  expect(before.structuredContent).toEqual({
    connections: [
      { available: true, connected: false, provider: "fourthwall" },
      { available: true, connected: false, provider: "fal" },
      { available: false, connected: false, provider: "meta" },
    ],
  });
  await connectWith(upstream, fake, "test", "fourthwall");
  const after = await client.callTool({
    arguments: {},
    name: "list_connections",
  });
  expect(after.structuredContent).toMatchObject({
    connections: [
      { connected: true, provider: "fourthwall" },
      { connected: false, provider: "fal" },
      { connected: false, provider: "meta" },
    ],
  });
});

test("connect_account returns a personal single-use link for the merchant", async () => {
  const { client, connections } = await setup();
  const result = await client.callTool({
    arguments: { provider: "fourthwall" },
    name: "connect_account",
  });
  expect(result.isError).toBeFalsy();
  const { connectUrl } = z
    .object({ connectUrl: z.string() })
    .parse(result.structuredContent);
  const url = new URL(connectUrl);
  expect(url.origin + url.pathname).toBe(`${site}/connect/fourthwall`);
  expect(JSON.stringify(result.content)).toContain("works once, for 5 minutes");
  // The ticket is the one the connect route redeems: for this merchant, once.
  const ticket = url.searchParams.get("ticket") ?? "";
  await expect(connections.redeemTicket(ticket, "fourthwall")).resolves.toBe(
    "test"
  );
  await expect(
    connections.redeemTicket(ticket, "fourthwall")
  ).resolves.toBeUndefined();
});

test("connect_account refuses a provider the server can't connect, and unknown ones", async () => {
  const { client } = await setup();
  const meta = await client.callTool({
    arguments: { provider: "meta" },
    name: "connect_account",
  });
  expect(meta.structuredContent).toEqual({ configured: false });
  const unknown = await client.callTool({
    arguments: { provider: "tiktok" },
    name: "connect_account",
  });
  expect(unknown.isError).toBe(true);
});

test("without connections set up, connect_account says so and list_connections shows none", async () => {
  const client = await connectClient({}, testStore());
  const result = await client.callTool({
    arguments: { provider: "fal" },
    name: "connect_account",
  });
  expect(result.structuredContent).toEqual({ configured: false });
  const list = await client.callTool({
    arguments: {},
    name: "list_connections",
  });
  expect(list.isError).toBeFalsy();
  expect(JSON.stringify(list.content)).toContain("can't be connected");
});
