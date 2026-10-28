import type { Taste } from "./qloo";
import { themeKey } from "./themes";
import type { Theme } from "./themes";

// The with-Qloo vs LLM-only comparison (evals/qloo-ablation.eval.ts): what a
// run's themes stand on in each arm. These measure grounding and
// explanation, not how well a design sells: there are no sales to learn
// from yet.

export interface ArmMetrics {
  // Distinct domains (brand, movie, tv_show) the brief's cues came from.
  crossDomains: number;
  // Distinct aesthetic cues the design brief receives.
  cues: number;
  // Share of themes from a Qloo tag whose run has an explained affinity.
  explained: number;
  // Share of themes that are a Qloo tag, with Qloo's affinity.
  grounded: number;
  // Mean share of a theme's words that are not the seed's own words.
  novelty: number;
  themes: number;
}

const WORD = /[\p{L}\p{N}]+/gu;

const wordsOf = (value: string) =>
  new Set([...value.toLowerCase().matchAll(WORD)].map(([word]) => word));

const share = (count: number, total: number) =>
  total === 0 ? 0 : count / total;

const mean = (values: number[]) =>
  share(
    values.reduce((sum, value) => sum + value, 0),
    values.length
  );

export const armMetrics = (
  seed: string,
  themes: Omit<Theme, "query">[],
  taste: Taste
): ArmMetrics => {
  const affinities = taste.affinities ?? [];
  const explainedRun = affinities.some(({ because }) => because.length > 0);
  const grounded = themes.filter(({ id }) => id !== undefined).length;
  const seedWords = wordsOf(seed);
  return {
    crossDomains: new Set(affinities.map(({ type }) => type)).size,
    cues: new Set(
      affinities.flatMap(({ cues }) => cues.map((cue) => cue.toLowerCase()))
    ).size,
    explained: explainedRun ? share(grounded, themes.length) : 0,
    grounded: share(grounded, themes.length),
    novelty: mean(
      themes.map(({ name }) => {
        const words = [...wordsOf(name)];
        return share(
          words.filter((word) => !seedWords.has(word)).length,
          words.length
        );
      })
    ),
    themes: themes.length,
  };
};

export const meanMetrics = (arms: ArmMetrics[]): ArmMetrics => ({
  crossDomains: mean(arms.map((arm) => arm.crossDomains)),
  cues: mean(arms.map((arm) => arm.cues)),
  explained: mean(arms.map((arm) => arm.explained)),
  grounded: mean(arms.map((arm) => arm.grounded)),
  novelty: mean(arms.map((arm) => arm.novelty)),
  themes: mean(arms.map((arm) => arm.themes)),
});

// Jaccard overlap of two arms' themes: 1 when Qloo changes nothing.
export const themeOverlap = (a: string[], b: string[]) => {
  const left = new Set(a.map(themeKey));
  const right = new Set(b.map(themeKey));
  const shared = [...left].filter((key) => right.has(key)).length;
  return share(shared, new Set([...left, ...right]).size);
};
