import { writeFile } from "node:fs/promises";

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  createAgentTestRun,
  createTestMessage,
} from "@mastra/evals/scorers/utils";
import { describe, expect, it } from "vitest";

import { agreement, splitOf, trusted } from "../calibration";
import type { Agreement, Verdict } from "../calibration";
import { JUDGE_IDS, LABELED } from "../judges";
import type { JudgeId, LabeledCase } from "../judges";
import { judgeScorer } from "../scorers";
import baseline from "./baseline.v1.json" with { type: "json" };

// Offline evals of wovain's judges on the versioned labeled set
// (judges.v1.json), run in CI when a prompt, a judge or the model changes
// (`pnpm --filter @wovain/core evals`). For each judge it measures TPR and
// TNR against the labels on the dev and test splits, writes the report, and
// fails when a judge drops below its recorded baseline (baseline.v1.json) by
// more than the tolerance. Without NEBIUS_API_KEY the suite is skipped; with
// it, NEMOTRON_MODEL names the model.

const apiKey = process.env["NEBIUS_API_KEY"];
const baseURL =
  process.env["NEBIUS_BASE_URL"] ?? "https://api.tokenfactory.nebius.com/v1/";
// The model under test: required with a key, as in the app.
const modelId = process.env["NEMOTRON_MODEL"];
if (apiKey !== undefined && modelId === undefined) {
  throw new Error("Set NEMOTRON_MODEL to the Nebius model the judges run on");
}
const TOLERANCE = 0.05;
const REPORT = new URL("report.v1.json", import.meta.url);

interface Baseline {
  judges: Partial<
    Record<JudgeId, { tnr: number; tpr: number; trusted: boolean }>
  >;
}

const runOf = (item: LabeledCase) => {
  const { brand, ...context } = item.input;
  return createAgentTestRun({
    inputMessages: [
      createTestMessage({ content: JSON.stringify(context), role: "user" }),
    ],
    output: [
      createTestMessage({
        content: JSON.stringify(item.output),
        role: "assistant",
      }),
    ],
    ...(typeof brand === "string" && {
      systemMessages: [
        { content: `Brand and taste: ${brand}`, role: "system" },
      ],
    }),
  });
};

describe.skipIf(apiKey === undefined)("judge agreement with labels", () => {
  const model = createOpenAICompatible({
    apiKey: apiKey ?? "",
    baseURL,
    name: "nebius",
    supportsStructuredOutputs: true,
  }).chatModel(modelId ?? "");
  const report: Record<string, Agreement & { trusted: boolean }> = {};

  it.each(JUDGE_IDS)(
    "%s holds its baseline",
    async (id) => {
      const scorer = judgeScorer(id, model);
      // Train cases are the judge's few-shot examples: never scored.
      const cases = LABELED.cases.filter(
        (item) => item.judge === id && splitOf(item.id) !== "train"
      );
      const verdicts = await Promise.all(
        cases.map(async (item): Promise<Verdict> => {
          const scored = await scorer.run(runOf(item));
          return scored.score === 1 ? "pass" : "fail";
        })
      );
      const measured = agreement(
        cases.map((item) => item.label),
        verdicts
      );
      report[id] = { ...measured, trusted: trusted(measured) };
      const recorded = (baseline as Baseline).judges[id];
      if (recorded !== undefined) {
        expect(measured.tpr).toBeGreaterThanOrEqual(recorded.tpr - TOLERANCE);
        expect(measured.tnr).toBeGreaterThanOrEqual(recorded.tnr - TOLERANCE);
      }
      await writeFile(
        REPORT,
        `${JSON.stringify({ dataset: LABELED.version, judges: report, model: modelId }, null, 2)}\n`
      );
    },
    600_000
  );
});
