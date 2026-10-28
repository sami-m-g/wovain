import { writeFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { armMetrics, meanMetrics, themeOverlap } from "../ablation";
import type { ArmMetrics } from "../ablation";
import { createAgentKit } from "../agents";
import { createNemotron } from "../nemotron";
import { createQloo } from "../qloo";
import type { Taste } from "../qloo";
import { themesFor } from "../themes";
import type { Theme } from "../themes";

// The with-Qloo vs LLM-only ablation (openspec qloo-taste-core). The same
// seeds go through the theme step twice: once with Qloo's taste graph
// (tags, cross-domain affinities with explainability and a trend bias), and
// once with Nemotron alone splitting the brief. Tavily is left out, so the
// eval spends no search credits: it compares what the themes and the brief
// stand on, not the web evidence found for them. It writes
// qloo-ablation.report.v1.json. Without QLOO_API_KEY and NEBIUS_API_KEY the
// suite is skipped; with them, NEMOTRON_MODEL names the model, as in the
// app's research step.

const qlooKey = process.env["QLOO_API_KEY"];
const nebiusKey = process.env["NEBIUS_API_KEY"];
const modelId = process.env["NEMOTRON_MODEL"];
const ready = qlooKey !== undefined && nebiusKey !== undefined;
if (ready && modelId === undefined) {
  throw new Error("Set NEMOTRON_MODEL to the Nebius model research runs on");
}
const REPORT = new URL("qloo-ablation.report.v1.json", import.meta.url);

// Directions an indie designer might type: fandoms, aesthetics, hobbies.
const SEEDS = [
  "Studio Ghibli",
  "Dark academia",
  "Y2K skate",
  "Cottagecore",
  "Lo-fi hip hop",
  "Pickleball",
  "Horror movie fans",
  "Taylor Swift",
] as const;

interface Arm {
  metrics: ArmMetrics;
  themes: string[];
}

interface SeedReport {
  llmOnly: Arm;
  overlap: number;
  seed: string;
  withQloo: Arm & { qloo: "used" | "no_match" };
}

const NO_TASTE: Taste = { names: [], themes: [] };

const armOf = (seed: string, themes: Theme[], taste: Taste): Arm => ({
  metrics: armMetrics(seed, themes, taste),
  themes: themes.map(({ name }) => name),
});

describe.skipIf(!ready)("with Qloo vs LLM-only", () => {
  // The app's own agents, so the LLM-only arm is exactly the app's
  // fallback; guardrails and scorers are off to keep the eval to the
  // theme calls.
  const ask = createNemotron(
    createAgentKit({
      apiKey: nebiusKey,
      baseURL:
        process.env["NEBIUS_BASE_URL"] ??
        "https://api.tokenfactory.nebius.com/v1/",
      environment: "eval",
      guardThresholds: { injection: 1, moderation: 1, pii: 1 },
      guardrails: false,
      model: modelId ?? "",
      posthogHost: "https://us.i.posthog.com",
      pricePerMillion: { input: 0, output: 0 },
      scoreSampleRate: 0,
      visionModel: modelId ?? "",
    })
  );
  const qloo = createQloo({
    apiKey: qlooKey,
    baseURL: process.env["QLOO_API_URL"] ?? "https://hackathon.api.qloo.com",
  });

  // A Qloo failure fails the eval: an ablation with a broken arm says
  // nothing.
  const seedReport = async (seed: string): Promise<SeedReport> => {
    const taste = await qloo.tasteOf(seed, undefined, { crossDomain: true });
    const [withQloo, llmOnly] = await Promise.all([
      themesFor(seed, taste.themes, ask),
      themesFor(seed, [], ask),
    ]);
    const qlooArm = armOf(seed, withQloo, taste);
    const llmArm = armOf(seed, llmOnly, NO_TASTE);
    return {
      llmOnly: llmArm,
      overlap: themeOverlap(qlooArm.themes, llmArm.themes),
      seed,
      withQloo: {
        ...qlooArm,
        qloo: taste.themes.length > 0 ? "used" : "no_match",
      },
    };
  };

  it("reports what Qloo adds to the themes and the brief", async () => {
    const seeds = await Promise.all(SEEDS.map(seedReport));
    const report = {
      at: new Date().toISOString(),
      llmOnly: meanMetrics(seeds.map((item) => item.llmOnly.metrics)),
      model: modelId,
      overlap:
        seeds.reduce((sum, item) => sum + item.overlap, 0) / seeds.length,
      seeds,
      withQloo: meanMetrics(seeds.map((item) => item.withQloo.metrics)),
    };
    await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`);

    // Qloo must ground some themes; the LLM-only arm never can.
    expect(report.withQloo.grounded).toBeGreaterThan(0);
    expect(report.llmOnly.grounded).toBe(0);
  });
});
