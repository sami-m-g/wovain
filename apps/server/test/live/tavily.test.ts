import { trendsResultSchema } from "@wovain/shared/trends";
import { describe, expect, test } from "vitest";

import { trendResearchFor } from "../../src/lib/trends.ts";

// Calls Tavily for real: 2 basic searches, 2 credits ($0.016 pay-as-you-go).
// Runs only with TAVILY_API_KEY set: `pnpm test:live`. It ranks with rules
// here, so it doesn't also spend a Nebius call.
const apiKey = process.env["TAVILY_API_KEY"];

describe.skipIf(apiKey === undefined || apiKey === "")(
  "Tavily research",
  () => {
    test("finds linked tee ideas for a niche", async () => {
      const research = trendResearchFor(apiKey);
      if (research === undefined) {
        throw new Error("expected trend research");
      }
      const { ideas, ranker } = await research.research({
        count: 3,
        seed: "pickleball",
      });
      expect(ranker).toBe("rules");
      expect(
        trendsResultSchema.safeParse({ configured: true, ideas, ranker })
          .success
      ).toBe(true);
      expect(ideas.length).toBeGreaterThanOrEqual(1);
      for (const idea of ideas) {
        expect(idea.sources[0]?.url).toMatch(/^https?:\/\//u);
      }
    }, 60_000);
  }
);
