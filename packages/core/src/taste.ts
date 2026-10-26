import type { MastraCompositeStore } from "@mastra/core/storage";
import { Memory } from "@mastra/memory";

// Each merchant's memory (Mastra memory on wovain's Postgres): the brief
// writer and the ad copywriter keep a run's messages as its thread, and
// share one working memory per merchant with the brand and taste they've
// shown. wovain writes the taste from the merchant's own calls (what they
// approved and rejected, and why), so the agents read it and never edit it.

export const TASTE_TEMPLATE = `# Brand and taste
- Voice:
- Palette and typography:
- Niches:
- Approved designs:
- Rejected designs (and why):
`;

// The newest decisions stay; older ones fall off.
const KEPT_DECISIONS = 20;

export const createMerchantMemory = (storage: MastraCompositeStore) =>
  new Memory({
    options: {
      generateTitle: false,
      lastMessages: 10,
      semanticRecall: false,
      workingMemory: {
        agentManaged: false,
        enabled: true,
        scope: "resource",
        template: TASTE_TEMPLATE,
      },
    },
    storage,
  });

const tasteThread = (userId: string) => `taste:${userId}`;

// Adds one decision to the merchant's working memory.
export const recordTaste = async (
  memory: Memory,
  {
    approved,
    reason,
    title,
    userId,
  }: {
    approved: boolean;
    reason?: string | null;
    title: string;
    userId: string;
  }
) => {
  const current =
    (await memory.getWorkingMemory({
      resourceId: userId,
      threadId: tasteThread(userId),
    })) ?? TASTE_TEMPLATE;
  const lines = current.split("\n");
  const heading = approved
    ? "- Approved designs:"
    : "- Rejected designs (and why):";
  const at = lines.indexOf(heading);
  const entry = `  - ${title}${reason ? `: ${reason}` : ""}`;
  if (at === -1) {
    lines.push(heading, entry);
  } else {
    let end = at + 1;
    while (lines[end]?.startsWith("  - ") === true) {
      end += 1;
    }
    const kept = lines.slice(at + 1, end).slice(-(KEPT_DECISIONS - 1));
    lines.splice(at + 1, end - at - 1, ...kept, entry);
  }
  await memory.updateWorkingMemory({
    resourceId: userId,
    threadId: tasteThread(userId),
    workingMemory: lines.join("\n"),
  });
};
