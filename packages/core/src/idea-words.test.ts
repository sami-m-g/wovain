import { expect, it, vi } from "vitest";

import { isRawTag, writeIdeaWords } from "./idea-words";
import type { IdeaEvidence, IdeaWords } from "./idea-words";
import type { Nemotron } from "./nemotron";
import { DecisionTrace } from "./trace";

const evidence: IdeaEvidence = {
  demand: { bestsellers: 2, reviews: 340 },
  nearIdenticalListings: 3,
  qloo: { affinity: 0.82, entities: ["Coraline"], tag: "+children's" },
};

const words = (overrides: Partial<IdeaWords> = {}): IdeaWords => ({
  buyer: "for parents who read aloud at night",
  concept: "A moonlit storybook moth on a soft tee for bedtime readers.",
  occasion: "a gift for a new parent",
  style: "soft pastel line art",
  title: "Moonlit storybook moth",
  whyNow: "Shoppers already buy it: 2 bestsellers and 340 reviews.",
  ...overrides,
});

// A writer that answers each call with the next reply in turn.
const writer = (...replies: (Error | IdeaWords)[]) => {
  const ask = vi.fn(async (_asked: { system: string }) => {
    const reply = replies.shift();
    if (reply === undefined || reply instanceof Error) {
      throw reply ?? new Error("no reply");
    }
    return await Promise.resolve(reply);
  });
  return { ask: ask as unknown as Nemotron, calls: ask };
};

const deps = (ask: Nemotron, trace?: DecisionTrace) => ({
  ask,
  locale: "en",
  trace,
});

it("writes a readable title and concept from the evidence", async () => {
  const { ask, calls } = writer(words());
  const result = await writeIdeaWords(deps(ask), evidence);
  expect(result).toMatchObject({
    status: "ok",
    title: "Moonlit storybook moth",
  });
  expect(calls).toHaveBeenCalledTimes(1);
});

it("sends an invented number back once, then accepts the grounded answer", async () => {
  const trace = new DecisionTrace({ userId: "u1" });
  const { ask, calls } = writer(
    words({ whyNow: "Over 9,000 sold last month." }),
    words()
  );
  const result = await writeIdeaWords(deps(ask, trace), evidence);
  expect(result.status).toBe("ok");
  expect(calls).toHaveBeenCalledTimes(2);
  expect(calls.mock.calls[1]?.[0].system).toContain("9,000");
  expect(trace.entries.map((entry) => entry.output)).toMatchObject([
    { verdict: "ungrounded" },
    { verdict: "ok" },
  ]);
});

it("leaves the words unavailable after a second ungrounded answer", async () => {
  const { ask } = writer(
    words({ whyNow: "The #1 tee this fall." }),
    words({ whyNow: "The #1 tee this fall." })
  );
  expect(await writeIdeaWords(deps(ask), evidence)).toStrictEqual({
    reason: "ungrounded",
    status: "unavailable",
    unsupported: ["#1"],
  });
});

it("never keeps the raw Qloo tag as the title", async () => {
  const { ask } = writer(
    words({ title: "+children's" }),
    words({ title: "Children's" })
  );
  expect(await writeIdeaWords(deps(ask), evidence)).toMatchObject({
    reason: "raw_tag",
    status: "unavailable",
  });
  expect(isRawTag("Middle grade", "Middle Grade")).toBe(true);
  expect(isRawTag("Moonlit storybook moth", "+children's")).toBe(false);
});

it("retries a failed call once, then says it failed", async () => {
  const { ask, calls } = writer(new Error("timeout"), new Error("timeout"));
  expect(await writeIdeaWords(deps(ask), evidence)).toMatchObject({
    reason: "failed",
    status: "unavailable",
  });
  expect(calls).toHaveBeenCalledTimes(2);
});
