import { trace } from "@opentelemetry/api";
import { designBriefSchema } from "@wovain/shared/judge";
import { genkit } from "genkit";
import { mockModel } from "genkit/testing";
import { expect, test, vi } from "vitest";

import { createAi } from "../../src/lib/ai.ts";
import {
  applyFacts,
  createDesignJudge,
  ruleFacts,
} from "../../src/lib/design-judge.ts";
import { demoBrief, passingReply } from "../helpers.ts";

// First in the file: once any Genkit action runs, its telemetry choice holds
// for the whole process.
test("Genkit doesn't register a second tracer provider", async () => {
  const register = vi.spyOn(trace, "setGlobalTracerProvider");
  const ai = createAi("test-key");
  if (ai === undefined) {
    throw new Error("expected a Genkit instance");
  }
  mockModel(ai, { respond: { text: JSON.stringify(passingReply) } });
  await createDesignJudge(ai, "mockModel")(demoBrief);
  expect(register).not.toHaveBeenCalled();
  register.mockRestore();
});

const failed = (brief: typeof demoBrief) =>
  ruleFacts(brief)
    .filter((check) => !check.pass)
    .map((check) => check.rule);

test("code-decided rules pass for the demo brief", () => {
  expect(failed(demoBrief)).toStrictEqual([]);
});

test("code-decided rules fail at their thresholds", () => {
  expect(
    failed({
      ...demoBrief,
      artwork: { ...demoBrief.artwork, transparent: false, widthPx: 1799 },
      colors: demoBrief.colors.slice(0, 2),
    })
  ).toStrictEqual(["print_size", "transparency", "colors"]);
  expect(
    failed({ ...demoBrief, artwork: { ...demoBrief.artwork, widthPx: 1800 } })
  ).toStrictEqual([]);
});

test("a code failure overrides the model's pass and forces revise", () => {
  const facts = ruleFacts({
    ...demoBrief,
    artwork: { ...demoBrief.artwork, widthPx: 900 },
  });
  const judged = applyFacts(passingReply, facts);
  expect(judged.verdict).toBe("revise");
  expect(judged.checks.find((c) => c.rule === "print_size")?.pass).toBe(false);
  // Model-only rules keep the model's note.
  expect(judged.checks.find((c) => c.rule === "description")?.note).toBe(
    "Fine."
  );
});

test("a model fail stands where code passes, and the verdict follows", () => {
  const reply = {
    ...passingReply,
    checks: passingReply.checks.map((check) =>
      check.rule === "title"
        ? { ...check, note: "Keyword isn't first.", pass: false }
        : check
    ),
  };
  const judged = applyFacts(reply, ruleFacts(demoBrief));
  expect(judged.checks.find((c) => c.rule === "title")?.note).toBe(
    "Keyword isn't first."
  );
  expect(judged.verdict).toBe("revise");
  expect(applyFacts(passingReply, ruleFacts(demoBrief)).verdict).toBe("ready");
});

test("the judge sends the brief and facts and parses the reply", async () => {
  const ai = genkit({});
  const model = mockModel(ai, {
    respond: { text: JSON.stringify(passingReply) },
  });
  const judged = await createDesignJudge(ai, "mockModel")(demoBrief);
  expect(judged.verdict).toBe("ready");
  expect(judged.score).toBe(92);
  // Code writes its own notes for the rules it decides.
  expect(judged.checks.find((c) => c.rule === "print_size")?.note).toBe(
    "4500 px wide, 1800 px needed."
  );
  expect(model.lastRequest?.output?.format).toBe("json");
  expect(model.lastRequest?.output?.schema).toMatchObject({ type: "object" });
  expect(model.lastRequestText).toContain("Japanese Cat Sunset Tee");
});

test("a reply that breaks the schema is an error", async () => {
  const ai = genkit({});
  mockModel(ai, {
    respond: { text: JSON.stringify({ ...passingReply, score: 400 }) },
  });
  await expect(createDesignJudge(ai, "mockModel")(demoBrief)).rejects.toThrow();
});

test("a model error is an error", async () => {
  const ai = genkit({});
  mockModel(ai, { respond: [new Error("rate limited")] });
  await expect(createDesignJudge(ai, "mockModel")(demoBrief)).rejects.toThrow(
    "rate limited"
  );
});

test("no key, no Genkit", () => {
  expect(createAi()).toBeUndefined();
});

test("the brief is bounded before it reaches the model", () => {
  expect(designBriefSchema.safeParse(demoBrief).success).toBe(true);
  for (const oversized of [
    { ...demoBrief, idea: "x".repeat(501) },
    {
      ...demoBrief,
      colors: Array.from({ length: 21 }, () => demoBrief.colors[0]),
    },
    {
      ...demoBrief,
      placement: { ...demoBrief.placement, style: "x".repeat(121) },
    },
    { ...demoBrief, blank: { ...demoBrief.blank, name: "x".repeat(121) } },
    { ...demoBrief, listing: { ...demoBrief.listing, title: "x".repeat(121) } },
  ]) {
    expect(designBriefSchema.safeParse(oversized).success).toBe(false);
  }
});
