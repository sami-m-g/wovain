import { describe, expect, it } from "vitest";

import { splitOf } from "./calibration";
import { JUDGE_IDS, judgeInstructions, LABELED } from "./judges";

describe("judge prompts", () => {
  it("covers every judge with both labels in the labeled set", () => {
    for (const id of JUDGE_IDS) {
      const labels = new Set(
        LABELED.cases
          .filter((item) => item.judge === id)
          .map((item) => item.label)
      );
      expect(labels, id).toEqual(new Set(["fail", "pass"]));
    }
  });

  it("shows the judge only train-split examples, never dev or test", () => {
    for (const id of JUDGE_IDS) {
      const instructions = judgeInstructions(id);
      for (const item of LABELED.cases.filter((one) => one.judge === id)) {
        const shown = instructions.includes(JSON.stringify(item.output));
        expect(shown, item.id).toBe(splitOf(item.id) === "train");
      }
      expect(instructions).toContain("PASS:");
      expect(instructions).toContain("FAIL:");
      expect(instructions).toContain('"critique"');
    }
  });

  it("fails art whose subject is a garment, and says so in the definition", () => {
    // A picture of a pink tee reached approval in production.
    const pinkTee = LABELED.cases.find(
      (item) => item.id === "design_quality-005"
    );
    expect(pinkTee?.label).toBe("fail");
    expect(String(pinkTee?.output.artPrompt)).toContain("tee silhouette");
    expect(judgeInstructions("design_quality")).toContain(
      "subject is a garment"
    );
  });

  it("keeps case IDs unique", () => {
    const ids = LABELED.cases.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
