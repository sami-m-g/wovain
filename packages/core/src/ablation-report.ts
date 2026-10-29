import type { ArmMetrics } from "./ablation";
// The committed with-Qloo vs LLM-only ablation (evals/qloo-ablation.eval.ts,
// `pnpm --filter @wovain/core evals`), as the ideas step shows it beside the
// real ideas: what the theme step stands on with Qloo's taste graph, and
// what Nemotron alone makes of the same seeds. A new run of the eval
// rewrites the JSON; this reads whatever is committed.
import report from "./evals/qloo-ablation.report.v1.json" with { type: "json" };

export interface AblationSeed {
  seed: string;
  // Qloo's themes for the seed; empty when Qloo found no taste for it.
  withQloo: string[];
  llmOnly: string[];
}

export interface AblationReport {
  // When the eval ran (ISO 8601) and on which model.
  at: string;
  model: string;
  withQloo: ArmMetrics;
  llmOnly: ArmMetrics;
  seeds: AblationSeed[];
}

export const qlooAblation: AblationReport = {
  at: report.at,
  llmOnly: report.llmOnly,
  model: report.model,
  seeds: report.seeds.map(({ llmOnly, seed, withQloo }) => ({
    llmOnly: llmOnly.themes,
    seed,
    withQloo: withQloo.themes,
  })),
  withQloo: report.withQloo,
};
