import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { LaunchFacts } from "@/components/onboarding/launch-steps";
import {
  clockOf,
  currentStep,
  doneCount,
  launchedAt,
  launchProgress,
  withinTarget,
} from "@/components/onboarding/launch-steps";
import { LaunchTimer } from "@/components/onboarding/launch-timer";
import { LaunchChecklist } from "@/components/shadcn-studio/blocks/onboarding-feed-01/onboarding-feed-01";

import messages from "../messages/en.json";

const MINUTE_MS = 60_000;

const fresh: LaunchFacts = {
  fourthwallConnected: false,
  guardrailsSet: false,
  metaConnected: false,
  storeReady: false,
};

const render = (node: React.ReactNode) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      {node}
    </NextIntlClientProvider>
  );

describe("launch progress", () => {
  it("starts with sign-in done and what to sell open", () => {
    const progress = launchProgress(fresh);

    expect(doneCount(progress)).toBe(1);
    expect(progress.signin).toBe(true);
    expect(currentStep(progress)).toBe("sell");
  });

  it("needs the store ready, not only connected", () => {
    const progress = launchProgress({
      ...fresh,
      brief: "Ghibli tees",
      fourthwallConnected: true,
    });

    expect(currentStep(progress)).toBe("store");
  });

  it("needs Meta and the guardrails before the designs", () => {
    const base = {
      ...fresh,
      brief: "Ghibli tees",
      fourthwallConnected: true,
      storeReady: true,
    };

    expect(currentStep(launchProgress({ ...base, metaConnected: true }))).toBe(
      "meta"
    );
    expect(
      currentStep(
        launchProgress({ ...base, guardrailsSet: true, metaConnected: true })
      )
    ).toBe("design");
  });

  it("ticks the design off once one is approved, and finishes with a campaign", () => {
    const ready = {
      brief: "Ghibli tees",
      fourthwallConnected: true,
      guardrailsSet: true,
      metaConnected: true,
      storeReady: true,
    };
    const approved = launchProgress({
      ...ready,
      run: { campaigns: [], designs: [{ status: "approved" }] },
    });
    const live = launchProgress({
      ...ready,
      run: {
        campaigns: [{ createdAt: "2026-10-29T10:08:00Z" }],
        designs: [{ status: "approved" }],
      },
    });

    expect(currentStep(approved)).toBe("ads");
    expect(currentStep(live)).toBeUndefined();
    expect(doneCount(live)).toBe(6);
  });
});

describe("launch timer", () => {
  it("stops at the first campaign", () => {
    const at = launchedAt({
      ...fresh,
      run: {
        campaigns: [
          { createdAt: "2026-10-29T10:09:00Z" },
          { createdAt: "2026-10-29T10:08:00Z" },
        ],
        designs: [],
      },
    });

    expect(at?.toISOString()).toBe("2026-10-29T10:08:00.000Z");
    expect(launchedAt(fresh)).toBeUndefined();
  });

  it("reads m:ss and checks the 10-minute target", () => {
    expect(clockOf(9 * MINUTE_MS + 5000)).toBe("9:05");
    expect(clockOf(-1)).toBe("0:00");
    expect(withinTarget(10 * MINUTE_MS)).toBe(true);
    expect(withinTarget(10 * MINUTE_MS + 1)).toBe(false);
  });

  it("shows the stopped time and that the campaign went live on time", () => {
    const html = render(
      <LaunchTimer
        startedAt="2026-10-29T10:00:00Z"
        stoppedAt={new Date("2026-10-29T10:08:30Z")}
      />
    );

    expect(html).toContain("8:30");
    expect(html).toContain("Live in under 10 minutes");
  });
});

describe("launch checklist", () => {
  it("lists every step with sign-in done", () => {
    const html = render(
      <LaunchChecklist
        active="sell"
        onOpen={() => {}}
        progress={launchProgress(fresh)}
      />
    );

    expect(html).toContain("1 of 6 done");
    expect(html).toContain("Pick what to sell");
    expect(html).toContain("Launch your ads");
    expect(html).toContain("(done)");
  });
});
