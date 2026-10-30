import { describe, expect, it, vi } from "vitest";

import type { Campaign, CampaignStaging } from "@/lib/flow-client";
import { awaitCampaign, describeProblem } from "@/lib/flow-client";

const KEY = "campaign:u1:test:p1";
const staged = { id: "c1" } as unknown as Campaign;
const noWait = async () => await Promise.resolve();

describe("awaitCampaign", () => {
  it("polls a background staging until the campaign is ready", async () => {
    const read = vi
      .fn<(key: string) => Promise<CampaignStaging>>()
      .mockResolvedValueOnce({ key: KEY, state: "staging" })
      .mockResolvedValueOnce({ campaign: staged, key: KEY, state: "ready" });

    const made = await awaitCampaign(
      { key: KEY, state: "staging" },
      read,
      noWait
    );

    expect(made).toBe(staged);
    expect(read).toHaveBeenCalledTimes(2);
    expect(read).toHaveBeenCalledWith(KEY);
  });

  it("rethrows a failed staging so the step explains it with its fix", async () => {
    const failed: CampaignStaging = {
      code: "PRECONDITION_FAILED",
      data: { fix: "Link a Facebook Page." },
      key: KEY,
      message: "Your Meta ad account has no Facebook Page to run the ads as",
      state: "failed",
    };

    const error = await awaitCampaign(
      { key: KEY, state: "staging" },
      async () => await Promise.resolve(failed),
      noWait
    ).catch((error_: unknown) => error_);

    expect(describeProblem(error)).toEqual({
      fix: "Link a Facebook Page.",
      kind: "limit",
      message: "Your Meta ad account has no Facebook Page to run the ads as",
    });
  });
});
