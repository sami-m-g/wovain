import { describe, expect, it } from "vitest";

import { nextHref, nextStepOf } from "@/components/home/next-step";
import type { LaunchFacts } from "@/components/onboarding/launch-steps";

import en from "../messages/en.json";
import es from "../messages/es.json";
import fr from "../messages/fr.json";

const fresh: LaunchFacts = {
  fourthwallConnected: false,
  guardrailsSet: false,
  metaConnected: false,
  storeReady: false,
};

const RUN = { campaigns: [], designs: [{ status: "pending" }] };

describe("the Home's next step", () => {
  it("asks what to sell first, on what sells now", () => {
    expect(nextStepOf(fresh)).toBe("sell");
    expect(nextHref("sell")).toBeNull();
  });

  it("sends store setup to the Store, its one checklist", () => {
    const step = nextStepOf({ ...fresh, brief: "folk hiking apparel" });

    expect(step).toBe("store");
    expect(nextHref(step)).toBe("/dashboard/store");
  });

  it("opens the drop once only a design is left", () => {
    const facts: LaunchFacts = {
      brief: "folk hiking apparel",
      fourthwallConnected: true,
      guardrailsSet: true,
      metaConnected: true,
      run: RUN,
      storeReady: true,
    };

    expect(nextStepOf(facts)).toBe("design");
    expect(nextHref("design", "run-1")).toStrictEqual({
      pathname: "/dashboard/new",
      query: { run: "run-1" },
    });
  });

  it("is done once a campaign exists", () => {
    const facts: LaunchFacts = {
      brief: "folk hiking apparel",
      fourthwallConnected: true,
      guardrailsSet: true,
      metaConnected: true,
      run: {
        campaigns: [{ createdAt: "2026-10-29T10:00:00Z" }],
        designs: [{ status: "approved" }],
      },
      storeReady: true,
    };

    expect(nextStepOf(facts)).toBe("done");
    expect(nextHref("done", "run-1")).toBeNull();
  });
});

describe("story Home messages", () => {
  const steps = ["sell", "store", "meta", "design", "ads", "done"] as const;

  it.each([
    ["en", en],
    ["es", es],
    ["fr", fr],
  ])("has every next step and the empty results in %s", (_, messages) => {
    for (const step of steps) {
      expect(messages.StoryHome.next[step].title).toBeTruthy();
      expect(messages.StoryHome.next[step].action).toBeTruthy();
    }
    expect(messages.StoryHome.results.emptyTitle).toBeTruthy();
    expect(messages.Shell.nav.home).toBeTruthy();
    expect(messages.Shell.nav.settings).toBeTruthy();
  });

  it("drops the With and Without Qloo panel's strings", () => {
    expect("WithoutQloo" in en).toBe(false);
  });
});
