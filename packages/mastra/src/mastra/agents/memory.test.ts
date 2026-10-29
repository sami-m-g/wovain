import { Agent } from "@mastra/core/agent";
import { ErrorCategory, ErrorDomain, MastraError } from "@mastra/core/error";
import type { MastraModelConfig } from "@mastra/core/llm";
import { InMemoryStore } from "@mastra/core/storage";
import { createMockModel } from "@mastra/core/test-utils/llm-mock";
import { Memory } from "@mastra/memory";
import { withLlmTrace } from "@wovain/core/nemotron";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createNemotron } from "./ask";
import type { AgentKit } from "./kit";

// The brief writer remembers the merchant through Mastra memory. When
// Mastra's store works, the run's thread is kept; when it fails (its schema
// missing in Postgres, as on 2026-10-26), the call still answers, without
// memory, and the failure is logged.

const brief = z.object({ title: z.string() });
const trace = { distinctId: "merchant-1", traceId: "run-1" };

const kitWith = (memory: Memory) => {
  const generate = vi.fn();
  const agent = new Agent({
    id: "design_brief",
    instructions: "Answer with JSON only.",
    memory,
    // A v2 mock; its declared type is the v1 | v2 union.
    model: createMockModel({
      mockText: { title: "Moth tee" },
      spyGenerate: generate,
      version: "v2",
    }) as MastraModelConfig,
    name: "design_brief",
  });
  const kit = { agents: { design_brief: agent } } as unknown as AgentKit;
  return { generate, kit };
};

const ask = async (kit: AgentKit, set = vi.fn()) =>
  await withLlmTrace(
    trace,
    async () =>
      await createNemotron(kit)({
        log: { set },
        name: "design_brief",
        prompt: "A tee for moth lovers",
        schema: brief,
        system: "Write a brief.",
      })
  );

describe("design_brief memory", () => {
  it("keeps the run's thread when Mastra's store works", async () => {
    const memory = new Memory({ storage: new InMemoryStore() });
    const { kit } = kitWith(memory);
    const set = vi.fn();

    await expect(ask(kit, set)).resolves.toEqual({ title: "Moth tee" });
    await expect(
      memory.getThreadById({ threadId: trace.traceId })
    ).resolves.toMatchObject({ resourceId: trace.distinctId });
    expect(set).not.toHaveBeenCalledWith(
      expect.objectContaining({ memory: expect.anything() })
    );
  });

  it("answers without memory when Mastra's store fails", async () => {
    const storage = new InMemoryStore();
    const memory = new Memory({ storage });
    const missing = new MastraError(
      {
        category: ErrorCategory.THIRD_PARTY,
        domain: ErrorDomain.STORAGE,
        id: "MASTRA_STORAGE_PG_GET_THREAD_BY_ID_FAILED",
      },
      new Error('relation "mastra.mastra_threads" does not exist')
    );
    vi.spyOn(memory, "getThreadById").mockRejectedValue(missing);
    const { generate, kit } = kitWith(memory);
    const set = vi.fn();

    await expect(ask(kit, set)).resolves.toEqual({ title: "Moth tee" });
    expect(generate).toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith({
      memory: expect.objectContaining({
        agent: "design_brief",
        failed: "MASTRA_STORAGE_PG_GET_THREAD_BY_ID_FAILED",
      }),
    });
  });

  it("still fails on errors that aren't the store's", async () => {
    const memory = new Memory({ storage: new InMemoryStore() });
    vi.spyOn(memory, "getThreadById").mockRejectedValue(
      new Error("socket hang up")
    );
    const { kit } = kitWith(memory);

    await expect(ask(kit)).rejects.toThrow();
  });
});
