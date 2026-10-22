import { designJudgmentSchema } from "@wovain/shared/judge";
import { describe, expect, test } from "vitest";

import { createAi } from "../../src/lib/ai.ts";
import { designJudgeFor } from "../../src/lib/design-judge.ts";
import { demoBrief } from "../helpers.ts";

// Calls Nemotron 3 Super on Nebius Token Factory for real (a fraction of a
// cent). Runs only with NEBIUS_API_KEY set: `pnpm test:live`.
const apiKey = process.env["NEBIUS_API_KEY"];

describe.skipIf(apiKey === undefined || apiKey === "")("Nemotron judge", () => {
  test("judges the demo brief into the schema", async () => {
    const judge = designJudgeFor(createAi(apiKey));
    if (judge === undefined) {
      throw new Error("expected a judge");
    }
    const judgment = await judge(demoBrief);
    expect(designJudgmentSchema.safeParse(judgment).success).toBe(true);
    expect(judgment.checks.map((check) => check.rule)).toContain("idea_fit");
  });
});
