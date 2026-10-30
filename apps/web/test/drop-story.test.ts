import { describe, expect, it } from "vitest";

import {
  leadIdeaOf,
  pickedIdeaIdsOf,
  sectionState,
} from "@/components/drops/drop-sections";

import en from "../messages/en.json";
import es from "../messages/es.json";
import fr from "../messages/fr.json";

describe("the ideas a drop draws", () => {
  const one = [{ id: "i1" }];

  it("counts a Home pick's one idea as picked before its design lands", () => {
    expect(
      pickedIdeaIdsOf({ designs: [], ideas: one, step: "design" }, [])
    ).toEqual(["i1"]);
  });

  it("picks nothing while the run researches or waits at its ideas gate", () => {
    for (const step of ["research", "name", "ideas", null]) {
      expect(pickedIdeaIdsOf({ designs: [], ideas: one, step }, [])).toEqual(
        []
      );
    }
  });

  it("counts drawn and approved ideas, once each", () => {
    const run = {
      designs: [{ ideaId: "i1" }],
      ideas: [{ id: "i1" }, { id: "i2" }, { id: "i3" }],
      step: "design",
    };
    expect(pickedIdeaIdsOf(run, ["i1", "i2"])).toEqual(["i1", "i2"]);
  });
});

describe("the drop page's section states", () => {
  it("marks earlier sections done and the current one waiting", () => {
    const run = { status: "awaiting_approval" as const, step: "design" };

    expect(sectionState("ideas", run)).toBe("done");
    expect(sectionState("designs", run)).toBe("waiting");
    expect(sectionState("products", run)).toBe("not_started");
  });

  it("shows the ideas waiting at the ideas gate", () => {
    const run = { status: "awaiting_approval" as const, step: "ideas" };

    expect(sectionState("ideas", run)).toBe("waiting");
    expect(sectionState("designs", run)).toBe("not_started");
  });

  it("keeps the designs current at the design gate and after a decision", () => {
    for (const step of ["approval", "approved", "rejected"]) {
      const run = { status: "awaiting_approval" as const, step };

      expect(sectionState("ideas", run)).toBe("done");
      expect(sectionState("designs", run)).toBe("waiting");
    }
  });

  it("says working while the run works, stopped when it failed", () => {
    expect(sectionState("ideas", { status: "running", step: "research" })).toBe(
      "working"
    );
    expect(
      sectionState("products", { status: "failed", step: "publish" })
    ).toBe("stopped");
  });

  it("is all done once the drop is complete", () => {
    expect(
      sectionState("campaign", { status: "completed", step: "campaign" })
    ).toBe("done");
  });
});

describe("the lead idea", () => {
  const ideas = [
    { id: "a", score: 0.4 },
    { id: "b", score: 0.9 },
    { id: "c", score: 0.6 },
  ];

  it("is the first picked idea", () => {
    expect(leadIdeaOf(ideas, ["c"])?.id).toBe("c");
  });

  it("is the best scored when none is picked", () => {
    expect(leadIdeaOf(ideas, [])?.id).toBe("b");
  });

  it("is missing before Qloo returns ideas", () => {
    expect(leadIdeaOf([], [])).toBeUndefined();
  });
});

describe("drop page messages", () => {
  it.each([
    ["en", en],
    ["es", es],
    ["fr", fr],
  ])("name every section, state and the Qloo mark in %s", (_, messages) => {
    for (const section of [
      "ideas",
      "designs",
      "products",
      "campaign",
    ] as const) {
      expect(messages.DropStory[section].title).toBeTruthy();
      expect(messages.DropStory[section].notStarted).toBeTruthy();
    }
    expect(messages.DropStory.state.not_started).toBeTruthy();
    expect(messages.Qloo.decided).toBeTruthy();
  });
});
