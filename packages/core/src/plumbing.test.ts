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
