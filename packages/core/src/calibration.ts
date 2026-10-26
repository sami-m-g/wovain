import { createHash } from "node:crypto";

// Judge calibration (the validate-evaluator method): a binary LLM judge is
// trusted for gating only once its agreement with human labels is known.
// Human Pass/Fail labels are split into train (few-shot examples only), dev
// (iterate on the prompt) and test (measured once); TPR and TNR come from
// the test split, and a production pass rate is corrected for the judge's
// known errors (Rogan-Gladen) with a bootstrap confidence interval.

export type Verdict = "fail" | "pass";

export interface Labeled {
  id: string;
  label: Verdict;
}

export interface Agreement {
  // Of the cases a human passed, the share the judge passed.
  tpr: number;
  // Of the cases a human failed, the share the judge failed.
  tnr: number;
  n: number;
}

// The bar a judge clears before it gates anything (validate-evaluator).
export const TARGET = { minimum: 0.8, target: 0.9 } as const;

// A deterministic split by ID: the same case always lands in the same split
// (about 15% train, 43% dev, 42% test), so few-shot examples never leak
// into dev or test.
export const splitOf = (id: string): "dev" | "test" | "train" => {
  const bucket = createHash("sha256").update(id).digest().readUInt16BE(0) % 100;
  if (bucket < 15) {
    return "train";
  }
  return bucket < 58 ? "dev" : "test";
};

export const agreement = (
  human: readonly Verdict[],
  judge: readonly Verdict[]
): Agreement => {
  let tp = 0;
  let fn = 0;
  let tn = 0;
  let fp = 0;
  for (const [index, label] of human.entries()) {
    const said = judge[index];
    if (label === "pass") {
      tp += said === "pass" ? 1 : 0;
      fn += said === "pass" ? 0 : 1;
    } else {
      tn += said === "fail" ? 1 : 0;
      fp += said === "fail" ? 0 : 1;
    }
  }
  return {
    n: human.length,
    tnr: tn + fp === 0 ? 0 : tn / (tn + fp),
    tpr: tp + fn === 0 ? 0 : tp / (tp + fn),
  };
};

// The true pass rate behind an observed one, given the judge's TPR and TNR;
// undefined when the judge is no better than chance.
export const correctedRate = (
  observed: number,
  { tnr, tpr }: Pick<Agreement, "tnr" | "tpr">
) => {
  const denominator = tpr + tnr - 1;
  if (Math.abs(denominator) < 1e-6) {
    return;
  }
  return Math.min(1, Math.max(0, (observed + tnr - 1) / denominator));
};

// A 95% bootstrap interval for the corrected rate. `random` is injectable
// so the interval is reproducible in tests and CI.
export const bootstrapInterval = (
  human: readonly Verdict[],
  judge: readonly Verdict[],
  observed: number,
  { random = Math.random, rounds = 2000 } = {}
): [number, number] | undefined => {
  const estimates: number[] = [];
  for (let round = 0; round < rounds; round += 1) {
    const picks = human.map(() => Math.floor(random() * human.length));
    const rate = correctedRate(
      observed,
      agreement(
        picks.map((index) => human[index] ?? "fail"),
        picks.map((index) => judge[index] ?? "fail")
      )
    );
    if (rate !== undefined) {
      estimates.push(rate);
    }
  }
  if (estimates.length === 0) {
    return undefined;
  }
  estimates.sort((a, b) => a - b);
  const at = (share: number) =>
    estimates[
      Math.min(estimates.length - 1, Math.floor(share * estimates.length))
    ] ?? 0;
  return [at(0.025), at(0.975)];
};

export const trusted = ({ tnr, tpr }: Agreement) =>
  tpr >= TARGET.minimum && tnr >= TARGET.minimum;
