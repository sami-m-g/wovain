import { randomBytes } from "node:crypto";

import { EvlogError } from "evlog";
import { describe, expect, it, vi } from "vitest";

import { external } from "./log";
import { createSealer } from "./sealing";
import { resultData } from "./upstream";

describe("external", () => {
  it("logs each call and turns a failure into a structured provider error", async () => {
    const set = vi.fn();

    await expect(
      external(
        { set },
        { operation: "search", provider: "tavily" },
        async () => await Promise.reject(new Error("429 Too Many Requests"))
      )
    ).rejects.toSatisfy(
      (error: unknown) =>
        EvlogError.isEvlogError(error) &&
        error.code === "TAVILY_FAILED" &&
        error.status === 502 &&
        error.why === "429 Too Many Requests"
    );
    expect(set).toHaveBeenCalledWith({
      external: [
        expect.objectContaining({
          ok: false,
          operation: "search",
          provider: "tavily",
        }),
      ],
    });
  });

  it("keeps the provider's status and words in the message", async () => {
    const refused = Object.assign(new Error("invalid_token"), { status: 401 });

    await expect(
      external(
        undefined,
        { operation: "submit_job", provider: "fal" },
        async () => await Promise.reject(refused)
      )
    ).rejects.toSatisfy(
      (error: unknown) =>
        EvlogError.isEvlogError(error) &&
        error.message === "fal submit_job failed: 401 invalid_token" &&
        error.why === "401 invalid_token"
    );
  });

  it("makes a provider's spent plan a 4xx, so the run fails at once", async () => {
    // Tavily's SDK throws a plain Error with only these words.
    const spent = new Error(
      "This request exceeds your plan's set usage limit. Please upgrade your plan or contact support@tavily.com"
    );

    await expect(
      external(
        undefined,
        { operation: "search", provider: "tavily" },
        async () => await Promise.reject(spent)
      )
    ).rejects.toSatisfy(
      (error: unknown) =>
        EvlogError.isEvlogError(error) &&
        error.code === "TAVILY_FAILED" &&
        error.status === 402
    );
  });

  it("makes fal's exhausted balance a 4xx, so the run fails at once", async () => {
    // fal's client keeps the reason only in the 403 body's detail.
    const locked = Object.assign(new Error("Forbidden"), {
      body: {
        detail:
          "User is locked. Reason: Exhausted balance. Top up your balance at fal.ai/dashboard/billing.",
      },
      status: 403,
    });

    await expect(
      external(
        undefined,
        { operation: "submit_art", provider: "fal" },
        async () => await Promise.reject(locked)
      )
    ).rejects.toSatisfy(
      (error: unknown) =>
        EvlogError.isEvlogError(error) &&
        error.code === "FAL_FAILED" &&
        error.status === 402 &&
        error.message.includes("Exhausted balance")
    );
  });

  it("passes a result through and records success", async () => {
    const set = vi.fn();
    const value = await external(
      { set },
      { operation: "taste", provider: "qloo" },
      async () => await Promise.resolve(42)
    );
    expect(value).toBe(42);
    expect(set).toHaveBeenCalledWith({
      external: [expect.objectContaining({ ok: true, provider: "qloo" })],
    });
  });
});

describe("sealing", () => {
  const sealer = createSealer(randomBytes(32).toString("base64"));

  it("opens what it sealed for the same owner and provider", () => {
    const sealed = sealer.seal('{"access_token":"t"}', "u1:meta");
    expect(sealed).not.toContain("access_token");
    expect(sealer.open(sealed, "u1:meta")).toBe('{"access_token":"t"}');
  });

  it("refuses a ciphertext moved to another row", () => {
    const sealed = sealer.seal("secret", "u1:meta");
    expect(() => sealer.open(sealed, "u2:meta")).toThrow();
  });

  it("rejects a key that isn't 32 bytes", () => {
    expect(() => createSealer("c2hvcnQ=")).toThrow("32 bytes");
  });
});

describe("resultData", () => {
  it("prefers structured content, then JSON text, and surfaces tool errors", () => {
    expect(resultData({ content: [], structuredContent: { a: 1 } })).toEqual({
      a: 1,
    });
    expect(
      resultData({ content: [{ text: '{"b":2}', type: "text" }] })
    ).toEqual({ b: 2 });
    expect(() =>
      resultData({
        content: [{ text: "Offer not found", type: "text" }],
        isError: true,
      })
    ).toThrow("Offer not found");
  });
});
