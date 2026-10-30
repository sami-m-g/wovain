import { once } from "node:events";

import { ErrorCategory, ErrorDomain, MastraError } from "@mastra/core/error";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createNemotron } from "./ask";
import type { AgentKit } from "./kit";

// 2026-10-30: Nemotron answered a design brief with an empty list where the
// schema wanted one item, and Mastra's structured-output check failed the
// paid run. A misshapen reply is now asked once more, naming the failure.

const schema = z.object({ title: z.string().min(1) });

const misshapen = () =>
  new MastraError(
    {
      category: ErrorCategory.SYSTEM,
      domain: ErrorDomain.AGENT,
      id: "STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED",
      text: "Structured output validation failed: - title: Too small",
    },
    new Error("Too small")
  );

const kitWith = (generate: ReturnType<typeof vi.fn>) =>
  ({ agents: { design_judge: { generate } } }) as unknown as AgentKit;

const ask = async (kit: AgentKit, set = vi.fn()) =>
  await createNemotron(kit)({
    log: { set },
    name: "design_judge",
    prompt: "{}",
    schema,
    system: "Judge.",
  });

describe("a reply that misses the schema", () => {
  it("is asked once more, naming the failure, and the retry's answer is used", async () => {
    const generate = vi
      .fn()
      .mockRejectedValueOnce(misshapen())
      .mockResolvedValueOnce({ messages: [], object: { title: "Moth tee" } });
    const set = vi.fn();

    await expect(ask(kitWith(generate), set)).resolves.toEqual({
      title: "Moth tee",
    });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1]?.[1].instructions).toContain(
      "did not match the JSON schema"
    );
    expect(set).toHaveBeenCalledWith({ shapeRetry: { agent: "design_judge" } });
  });

  it("fails when the retry misses the schema too", async () => {
    const generate = vi.fn().mockRejectedValue(misshapen());

    await expect(ask(kitWith(generate))).rejects.toThrow();
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("is not retried for other failures", async () => {
    const generate = vi.fn().mockRejectedValue(new Error("socket hang up"));

    await expect(ask(kitWith(generate))).rejects.toThrow("socket hang up");
    expect(generate).toHaveBeenCalledTimes(1);
  });
});

// 2026-10-30: drop_style kept "Suggesting a tone and colours…" spinning for
// over two minutes (a 90 s call, then its shape retry). A call the merchant
// waits on sets one budget for every attempt.
describe("a call with a time budget", () => {
  it("gives every attempt the same abort signal", async () => {
    const generate = vi
      .fn()
      .mockRejectedValueOnce(misshapen())
      .mockResolvedValueOnce({ messages: [], object: { title: "Moth tee" } });

    await createNemotron(kitWith(generate))({
      name: "design_judge",
      prompt: "{}",
      schema,
      system: "Judge.",
      timeoutMs: 45_000,
    });
    const [first, second] = generate.mock.calls.map(
      (call) => call[1].abortSignal as AbortSignal
    );
    expect(first).toBeInstanceOf(AbortSignal);
    expect(second).toBe(first);
  });

  it("fails once the budget runs out", async () => {
    const generate = vi.fn(
      async (_input: unknown, options: { abortSignal: AbortSignal }) => {
        await once(options.abortSignal, "abort");
        throw options.abortSignal.reason;
      }
    );

    await expect(
      createNemotron(kitWith(generate as ReturnType<typeof vi.fn>))({
        name: "design_judge",
        prompt: "{}",
        schema,
        system: "Judge.",
        timeoutMs: 10,
      })
    ).rejects.toThrow();
  });
});
