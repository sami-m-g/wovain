import { describe, expect, it } from "vitest";

import {
  agreement,
  bootstrapInterval,
  correctedRate,
  splitOf,
  trusted,
} from "./calibration";
import type { Verdict } from "./calibration";

const flip = (label: Verdict): Verdict => (label === "pass" ? "fail" : "pass");

describe("judge calibration", () => {
  it("measures TPR and TNR against human labels", () => {
    const human: Verdict[] = ["pass", "pass", "pass", "pass", "fail", "fail"];
    const judge: Verdict[] = ["pass", "pass", "pass", "fail", "fail", "pass"];

    expect(agreement(human, judge)).toEqual({ n: 6, tnr: 0.5, tpr: 0.75 });
    expect(trusted(agreement(human, judge))).toBe(false);
    expect(trusted(agreement(human, human))).toBe(true);
  });

  it("corrects an observed pass rate for the judge's errors (Rogan-Gladen)", () => {
    // The validate-evaluator example: TPR 0.92, TNR 0.88, 80% observed.
    expect(correctedRate(0.8, { tnr: 0.88, tpr: 0.92 })).toBeCloseTo(0.85, 2);
    expect(correctedRate(0.8, { tnr: 0.5, tpr: 0.5 })).toBeUndefined();
  });

  it("gives a reproducible bootstrap interval around the corrected rate", () => {
    const human: Verdict[] = Array.from({ length: 40 }, (_, index) =>
      index % 2 === 0 ? "pass" : "fail"
    );
    // The judge flips one case in ten.
    const judge = human.map((label, index) =>
      index % 10 === 0 ? flip(label) : label
    );
    let seed = 1;
    const random = () => {
      seed = (seed * 16_807) % 2_147_483_647;
      return seed / 2_147_483_647;
    };

    const interval = bootstrapInterval(human, judge, 0.6, {
      random,
      rounds: 500,
    });

    expect(interval).toBeDefined();
    const [low, high] = interval ?? [0, 0];
    expect(low).toBeLessThanOrEqual(high);
    expect(low).toBeGreaterThanOrEqual(0);
    expect(high).toBeLessThanOrEqual(1);
  });

  it("keeps a case in the same split every time", () => {
    expect(splitOf("brand_fit-001")).toBe(splitOf("brand_fit-001"));
    const splits = new Set(
      Array.from({ length: 200 }, (_, index) => splitOf(`case-${index}`))
    );
    expect(splits).toEqual(new Set(["dev", "test", "train"]));
  });
});
