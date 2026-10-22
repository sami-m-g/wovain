import { describe, expect, test } from "vitest";

import { audienceOf, qlooFor, tasteOf } from "../../src/lib/qloo.ts";

// Calls Qloo for real: 5 requests against the hackathon quota, no Tavily
// credits. Runs only with QLOO_API_KEY set: `pnpm test:live`. It checks the
// host, the key and the response shapes wovain reads, which were taken from
// Qloo's docs and its harness before a key was available.
const apiKey = process.env["QLOO_API_KEY"];

describe.skipIf(apiKey === undefined || apiKey === "")("Qloo taste", () => {
  test("finds a seed's taste tags and their audience", async () => {
    const qloo = qlooFor(apiKey);
    if (qloo === undefined) {
      throw new Error("expected a Qloo client");
    }
    const taste = await tasteOf(qloo, "synthwave");
    expect(taste?.names.length).toBeGreaterThanOrEqual(1);
    expect(taste?.themes.length).toBeGreaterThanOrEqual(1);
    const [theme] = taste?.themes ?? [];
    expect(theme?.id).toMatch(/^urn:tag:/u);
    const audience = await audienceOf(qloo, [theme?.id ?? ""], "United States");
    expect(audience.ages ?? audience.genders).toBeDefined();
    expect(audience.locations.length).toBeGreaterThanOrEqual(1);
  }, 60_000);
});
