import { defaultSettings } from "@wovain/shared/settings";
import { trendsResultSchema } from "@wovain/shared/trends";
import { describe, expect, test } from "vitest";

import { trendResearchFor } from "../../src/lib/trends.ts";

// Calls Tavily for real: 2 basic searches and 1 extract, about 3 credits.
// The cap is 10 here, so the niche brief (Tavily Research, 4 to 110
// credits) is skipped. Runs only with TAVILY_API_KEY set: `pnpm test:live`.
const apiKey = process.env["TAVILY_API_KEY"];

describe.skipIf(apiKey === undefined || apiKey === "")(
  "Tavily research",
  () => {
    test("scores linked themes for a niche and reports its credits", async () => {
      const research = trendResearchFor(apiKey);
      if (research === undefined) {
        throw new Error("expected trend research");
      }
      const settings = defaultSettings();
      const found = await research.research(
        { seed: "pickleball" },
        { ...settings, research: { ...settings.research, maxCredits: 10 } },
        "live"
      );
      expect(
        trendsResultSchema.safeParse({ configured: true, ...found }).success
      ).toBe(true);
      expect(found.briefId).toBeUndefined();
      expect(found.credits.used).toBeGreaterThan(0);
      expect(found.credits.used).toBeLessThanOrEqual(10);
      for (const idea of found.ideas) {
        expect(idea.sources[0]?.url).toMatch(/^https?:\/\//u);
      }
    }, 60_000);
  }
);
