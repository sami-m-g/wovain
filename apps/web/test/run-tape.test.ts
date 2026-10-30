import { describe, expect, it } from "vitest";

import { reachedStage, STAGES, stateOf } from "@/components/product/run-tape";
import type { Stage } from "@/components/product/run-tape";

const none = { campaigns: [], designs: [], ideas: [], products: [] };
const some = [{}];

/** The tape as the wizard draws it: viewing `viewing`, the run holds `run`. */
const tape = (run: Parameters<typeof reachedStage>[0], viewing: Stage) => {
  const current = STAGES.indexOf(viewing);
  const passed = Math.max(current, STAGES.indexOf(reachedStage(run)));
  return STAGES.map((_, index) => stateOf(index, current, passed, false));
};

describe("run progress", () => {
  it("typed brief: researching, brief is done", () => {
    expect(tape({ ...none, step: "research" }, "trends")).toEqual([
      "done",
      "current",
      "pending",
      "pending",
      "pending",
    ]);
  });

  it("typed brief: each stage is reached once its data exists", () => {
    expect(reachedStage({ ...none, ideas: some })).toBe("trends");
    expect(reachedStage({ ...none, designs: some, ideas: some })).toBe(
      "designs"
    );
    expect(reachedStage({ ...none, designs: some, products: some })).toBe(
      "products"
    );
    expect(reachedStage({ ...none, campaigns: some, step: "campaign" })).toBe(
      "campaign"
    );
  });

  it("home pick with no step: designs current, brief and trends done", () => {
    expect(tape({ ...none, designs: some, step: null }, "designs")).toEqual([
      "done",
      "done",
      "current",
      "pending",
      "pending",
    ]);
  });

  it("home pick: going back keeps the later stages done", () => {
    const run = { ...none, designs: some, products: some, step: null };
    expect(tape(run, "trends")).toEqual([
      "done",
      "current",
      "done",
      "pending",
      "pending",
    ]);
  });

  it("home pick at products", () => {
    const run = { ...none, designs: some, products: some, step: "product" };
    expect(tape(run, "products")).toEqual([
      "done",
      "done",
      "done",
      "current",
      "pending",
    ]);
  });
});
