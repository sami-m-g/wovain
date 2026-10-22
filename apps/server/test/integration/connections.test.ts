import { describe, expect, test } from "vitest";

import { localCipher } from "../../src/lib/cipher.ts";
import { createConnections, nonceHashOf } from "../../src/lib/connections.ts";
import { testStorage } from "../helpers.ts";

const setup = () => {
  const { db } = testStorage();
  const clock = { now: 1_000_000 };
  const connections = createConnections(db, localCipher(), () => clock.now);
  return { clock, connections, db };
};

const tokens = {
  access_token: "at-secret",
  expires_in: 3600,
  refresh_token: "rt-secret",
  token_type: "Bearer",
};

describe("grants", () => {
  test("are stored encrypted and read back", async () => {
    const { connections, db } = setup();
    await connections.save("u1", "fourthwall", tokens);
    const raw = await db.doc("users/u1/connections/fourthwall").get();
    expect(JSON.stringify(raw.data())).not.toContain("secret");
    const grant = await connections.read("u1", "fourthwall");
    expect(grant?.tokens.access_token).toBe("at-secret");
    expect(grant?.record).toMatchObject({
      connectedAt: 1_000_000,
      expiresAt: 1_000_000 + 3_600_000,
      provider: "fourthwall",
      version: 1,
    });
  });

  test("keep connectedAt and bump the version on refresh", async () => {
    const { clock, connections } = setup();
    await connections.save("u1", "fal", tokens);
    clock.now += 5000;
    await connections.save("u1", "fal", { ...tokens, access_token: "at-2" });
    const grant = await connections.read("u1", "fal");
    expect(grant?.record).toMatchObject({
      connectedAt: 1_000_000,
      refreshedAt: 1_005_000,
      version: 2,
    });
  });

  test("a copied ciphertext doesn't open under another user", async () => {
    const { connections, db } = setup();
    await connections.save("u1", "fal", tokens);
    const raw = await db.doc("users/u1/connections/fal").get();
    await db.doc("users/u2/connections/fal").set(raw.data() ?? {});
    await expect(connections.read("u2", "fal")).rejects.toThrow();
  });

  test("a stale delete leaves a newer grant alone", async () => {
    const { connections } = setup();
    await connections.save("u1", "fal", tokens);
    await connections.save("u1", "fal", tokens);
    await expect(connections.remove("u1", "fal", 1)).resolves.toBe(false);
    expect(await connections.read("u1", "fal")).toBeDefined();
    await expect(connections.remove("u1", "fal", 2)).resolves.toBe(true);
    expect(await connections.read("u1", "fal")).toBeUndefined();
  });

  test("one lease at a time, and none on a changed grant", async () => {
    const { clock, connections } = setup();
    await connections.save("u1", "fal", tokens);
    const first = await connections.acquireLease("u1", "fal", 1);
    expect(first.status).toBe("held");
    await expect(connections.acquireLease("u1", "fal", 1)).resolves.toEqual({
      status: "busy",
    });
    clock.now += 30_000;
    const later = await connections.acquireLease("u1", "fal", 1);
    expect(later.status).toBe("held");
    await connections.save("u1", "fal", tokens);
    await expect(connections.acquireLease("u1", "fal", 1)).resolves.toEqual({
      status: "changed",
    });
  });
});

describe("tickets", () => {
  test("work once, for their provider, within 10 minutes", async () => {
    const { clock, connections } = setup();
    const ticket = await connections.createTicket("u1", "fourthwall");
    await expect(connections.redeemTicket(ticket, "fourthwall")).resolves.toBe(
      "u1"
    );
    await expect(
      connections.redeemTicket(ticket, "fourthwall")
    ).resolves.toBeUndefined();

    const other = await connections.createTicket("u1", "fourthwall");
    await expect(
      connections.redeemTicket(other, "fal")
    ).resolves.toBeUndefined();

    const late = await connections.createTicket("u1", "fal");
    clock.now += 11 * 60 * 1000;
    await expect(
      connections.redeemTicket(late, "fal")
    ).resolves.toBeUndefined();
  });
});

describe("flows", () => {
  const flow = {
    nonceHash: nonceHashOf("browser"),
    provider: "fal",
    purpose: "connect",
    userId: "u1",
  } as const;

  test("are taken once", async () => {
    const { connections } = setup();
    const state = await connections.createFlow(flow);
    await connections.updateFlow(state, { codeVerifier: "v" });
    await expect(
      connections.takeFlow(state, "connect", flow.nonceHash)
    ).resolves.toMatchObject({
      codeVerifier: "v",
      provider: "fal",
      userId: "u1",
    });
    await expect(
      connections.takeFlow(state, "connect", flow.nonceHash)
    ).resolves.toBeUndefined();
  });

  test("only open for their own browser and purpose", async () => {
    const { connections } = setup();
    const state = await connections.createFlow(flow);
    await expect(
      connections.takeFlow(state, "connect", nonceHashOf("other"))
    ).resolves.toBeUndefined();
    await expect(
      connections.takeFlow(state, "signin", flow.nonceHash)
    ).resolves.toBeUndefined();
    await expect(
      connections.takeFlow(state, "connect", flow.nonceHash)
    ).resolves.toMatchObject({ userId: "u1" });
  });
});
