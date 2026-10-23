import { createHmac } from "node:crypto";

import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet } from "jose";
import { describe, expect, it, vi } from "vitest";

import {
  cloudTasks,
  memoryTasks,
  taskName,
  verifyTaskToken,
} from "../../src/lib/tasks.ts";
import {
  fourthwallSigned,
  metaSigned,
  tokenMatches,
} from "../../src/optimizer/signatures.ts";

const body = '{"id":"evt_1","shopId":"sh_1","type":"ORDER_PLACED","data":{}}';
const fwSig = (secret: string, raw = body) =>
  createHmac("sha256", secret).update(raw).digest("base64");
const metaSig = (secret: string, raw = body) =>
  `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;

describe("Fourthwall signatures", () => {
  it("accepts the HMAC of the raw body", () => {
    expect(fourthwallSigned(body, fwSig("s3cret"), "s3cret")).toBe(true);
  });

  it("refuses a wrong secret, a missing header or secret, and a re-serialized body", () => {
    expect(fourthwallSigned(body, fwSig("other"), "s3cret")).toBe(false);
    expect(fourthwallSigned(body, undefined, "s3cret")).toBe(false);
    expect(fourthwallSigned(body, fwSig("s3cret"))).toBe(false);
    expect(fourthwallSigned(body, fwSig(""), "")).toBe(false);
    const reserialized = JSON.stringify(JSON.parse(body), null, 1);
    expect(fourthwallSigned(reserialized, fwSig("s3cret"), "s3cret")).toBe(
      false
    );
    expect(fourthwallSigned(body, "not base64!", "s3cret")).toBe(false);
  });
});

describe("Meta signatures", () => {
  it("accepts sha256=<hex> of the raw body with the app secret", () => {
    expect(metaSigned(body, metaSig("app"), "app")).toBe(true);
  });

  it("refuses a wrong secret, a bad format, a missing header or secret", () => {
    expect(metaSigned(body, metaSig("other"), "app")).toBe(false);
    expect(
      metaSigned(body, metaSig("app").replace("sha256=", "sha1="), "app")
    ).toBe(false);
    expect(metaSigned(body, undefined, "app")).toBe(false);
    expect(metaSigned(body, metaSig("app"))).toBe(false);
    expect(metaSigned(`${body} `, metaSig("app"), "app")).toBe(false);
  });

  it("matches the verify token only when one is configured", () => {
    expect(tokenMatches("tok", "tok")).toBe(true);
    expect(tokenMatches("tok", "other")).toBe(false);
    expect(tokenMatches("tok")).toBe(false);
    expect(tokenMatches(undefined, "tok")).toBe(false);
    expect(tokenMatches("", "")).toBe(false);
  });
});

describe("task tokens", () => {
  const account = "tasks-invoker@wovain.iam.gserviceaccount.com";
  const audience = "https://site.example/tasks/optimizer/run";
  const setup = async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const keys = createLocalJWKSet({
      keys: [{ ...(await exportJWK(publicKey)), alg: "RS256", kid: "k1" }],
    });
    const sign = async (claims: Record<string, unknown>, aud = audience) =>
      await new SignJWT(claims)
        .setProtectedHeader({ alg: "RS256", kid: "k1" })
        .setIssuer("https://accounts.google.com")
        .setAudience(aud)
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(privateKey);
    return { keys, sign };
  };

  it("accepts the task account's token for this audience", async () => {
    const { keys, sign } = await setup();
    const token = await sign({ email: account, email_verified: true });
    await expect(
      verifyTaskToken({
        audience,
        authorization: `Bearer ${token}`,
        keys,
        serviceAccount: account,
      })
    ).resolves.toBe(true);
  });

  it("refuses another account, another audience, no account set, or no token", async () => {
    const { keys, sign } = await setup();
    const other = await sign({ email: "x@evil.example", email_verified: true });
    const elsewhere = await sign(
      { email: account, email_verified: true },
      "https://other.example"
    );
    const good = await sign({ email: account, email_verified: true });
    const check = async (header?: string) =>
      await verifyTaskToken({
        audience,
        authorization: header,
        keys,
        serviceAccount: account,
      });
    await expect(check(`Bearer ${other}`)).resolves.toBe(false);
    await expect(check(`Bearer ${elsewhere}`)).resolves.toBe(false);
    await expect(check()).resolves.toBe(false);
    await expect(check("Bearer not-a-jwt")).resolves.toBe(false);
    await expect(
      verifyTaskToken({
        audience,
        authorization: `Bearer ${good}`,
        keys,
        serviceAccount: undefined,
      })
    ).resolves.toBe(false);
  });
});

describe("task queues", () => {
  it("names tasks with only allowed characters", () => {
    expect(taskName("user_01H:x/y", "run", 7)).toBe("user_01H_x_y-run-7");
  });

  it("treats a task name in use as already queued", async () => {
    const createTask = vi
      .fn()
      .mockResolvedValueOnce([{}])
      .mockRejectedValueOnce(Object.assign(new Error("exists"), { code: 6 }))
      .mockRejectedValueOnce(Object.assign(new Error("denied"), { code: 7 }));
    const queue = cloudTasks({
      client: { createTask },
      queue: "projects/p/locations/r/queues/optimizer",
      serviceAccount: "sa@p.iam.gserviceaccount.com",
      site: "https://site.example",
    });
    const task = {
      body: { uid: "u1" },
      name: "u1-run-1",
      path: "/tasks/optimizer/run",
      scheduleAt: 61_000,
    };
    await expect(queue.enqueue(task)).resolves.toBe(true);
    await expect(queue.enqueue(task)).resolves.toBe(false);
    await expect(queue.enqueue(task)).rejects.toThrow("denied");
    expect(createTask.mock.calls[0]?.[0]).toMatchObject({
      parent: "projects/p/locations/r/queues/optimizer",
      task: {
        httpRequest: {
          oidcToken: {
            audience: "https://site.example/tasks/optimizer/run",
            serviceAccountEmail: "sa@p.iam.gserviceaccount.com",
          },
          url: "https://site.example/tasks/optimizer/run",
        },
        name: "projects/p/locations/r/queues/optimizer/tasks/u1-run-1",
        scheduleTime: { seconds: 61 },
      },
    });
  });

  it("dedupes in memory too", async () => {
    const queue = memoryTasks();
    const task = { body: {}, name: "a", path: "/x" };
    await expect(queue.enqueue(task)).resolves.toBe(true);
    await expect(queue.enqueue(task)).resolves.toBe(false);
    expect(queue.tasks.size).toBe(1);
  });
});
