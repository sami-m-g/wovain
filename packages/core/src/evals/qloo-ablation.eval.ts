import { writeFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import { armMetrics, meanMetrics, themeOverlap } from "../ablation";
import type { ArmMetrics } from "../ablation";
import { createAgentKit } from "../agents";
import { createNemotron } from "../nemotron";
import { createQloo } from "../qloo";
import type { Taste } from "../qloo";
import { qlooThemes } from "../themes";
import type { Theme } from "../themes";
import { llmOnlyThemes } from "./llm-themes";

// The with-Qloo vs LLM-only ablation (openspec qloo-taste-core). The same
// seeds go through the theme step twice: once with Qloo's taste graph
// (tags, cross-domain affinities with explainability and a trend bias), and
// once with Nemotron alone splitting the brief (./llm-themes: an eval-only
// arm, since no product path runs without Qloo). Tavily is left out, so the
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
  withQloo: Arm & {
    // Cross-domain calls Qloo refused for this seed.
    failedDomains: string[];
    qloo: "used" | "no_match";
  };
}

const NO_TASTE: Taste = { names: [], themes: [] };

const armOf = (seed: string, themes: Theme[], taste: Taste): Arm => ({
  metrics: armMetrics(seed, themes, taste),
  themes: themes.map(({ name }) => name),
});

describe.skipIf(!ready)("with Qloo vs LLM-only", () => {
  // The app's own agents; guardrails and scorers are off to keep the eval
  // to the theme calls.
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

  // A failed theme call fails the eval: tasteOf throws, and an ablation with
  // a broken arm says nothing. A failed brand, film or TV call is caught
  // inside tasteOf, as in the app, and recorded on the seed: Qloo's search
  // can return entities its insights refuse as signals ("All of the provided
  // signal.interests.entities were invalid", the Pickleball video games on
  // 2026-10-29), which leaves that seed without cross-domain affinities but
  // with its themes.
  const seedReport = async (seed: string): Promise<SeedReport> => {
    const taste = await qloo.tasteOf(
      seed,
      { error: vi.fn(), set: vi.fn() },
      { crossDomain: true }
    );
    const withQloo = qlooThemes(seed, taste.themes);
    const llmOnly = await llmOnlyThemes(ask, seed);
    const qlooArm = armOf(seed, withQloo, taste);
    const llmArm = armOf(seed, llmOnly, NO_TASTE);
    return {
      llmOnly: llmArm,
      overlap: themeOverlap(qlooArm.themes, llmArm.themes),
      seed,
      withQloo: {
        ...qlooArm,
        failedDomains: taste.failedDomains ?? [],
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
