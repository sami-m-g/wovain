import { InMemoryStore } from "@mastra/core/storage";
import { describe, expect, it } from "vitest";

import { createMerchantMemory, recordLearnings, recordTaste } from "./taste";

// The feedback loop writes what sold into the merchant's working memory,
// next to their approvals, and replaces the last learnings each time.

const USER_ID = "merchant-1";

const read = async (memory: ReturnType<typeof createMerchantMemory>) =>
  await memory.getWorkingMemory({
    resourceId: USER_ID,
    threadId: `taste:${USER_ID}`,
  });

describe("recordLearnings", () => {
  it("replaces the last learnings and keeps the merchant's decisions", async () => {
    const memory = createMerchantMemory(new InMemoryStore());
    await recordTaste(memory, {
      approved: true,
      title: "Moth tee",
      userId: USER_ID,
    });

    await recordLearnings(memory, {
      learned: { sold: ["Old: 1 sold"], unsold: ["Older: no sales"] },
      userId: USER_ID,
    });
    await recordLearnings(memory, {
      learned: {
        sold: ["Retro slasher VHS: 4 sold, $96.00 revenue"],
        unsold: [],
      },
      userId: USER_ID,
    });

    const text = await read(memory);
    expect(text).toContain("  - Moth tee");
    expect(text).toContain(
      "- What sold (shop and ads):\n  - Retro slasher VHS: 4 sold, $96.00 revenue\n- What didn't sell:"
    );
    expect(text).not.toContain("Old: 1 sold");
    expect(text).not.toContain("Older: no sales");
  });
});
