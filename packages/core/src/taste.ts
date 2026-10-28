import type { MastraCompositeStore } from "@mastra/core/storage";
import { Memory } from "@mastra/memory";

import type { Learnings } from "./feedback";

// Each merchant's memory (Mastra memory on wovain's Postgres): the brief
// writer and the ad copywriter keep a run's messages as its thread, and
// share one working memory per merchant with the brand and taste they've
// shown. wovain writes the taste from the merchant's own calls (what they
// approved and rejected, and why) and, with the feedback loop on, from what
// sold, so the agents read it and never edit it.

export const TASTE_TEMPLATE = `# Brand and taste
- Voice:
- Palette and typography:
- Niches:
- Approved designs:
- Rejected designs (and why):
- What sold (shop and ads):
- What didn't sell:
`;

const SOLD_HEADING = "- What sold (shop and ads):";
const UNSOLD_HEADING = "- What didn't sell:";

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

export const tasteThread = (userId: string) => `taste:${userId}`;

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

// Replaces a heading's entries with these, adding the heading when missing.
const replaceSection = (
  lines: string[],
  heading: string,
  entries: string[]
) => {
  const at = lines.indexOf(heading);
  const items = entries.map((entry) => `  - ${entry}`);
  if (at === -1) {
    lines.push(heading, ...items);
    return;
  }
  let end = at + 1;
  while (lines[end]?.startsWith("  - ") === true) {
    end += 1;
  }
  lines.splice(at + 1, end - at - 1, ...items);
};

// Writes what the merchant's ideas did once for sale (the feedback loop,
// ./feedback) into their working memory, replacing the last learnings.
export const recordLearnings = async (
  memory: Memory,
  { learned, userId }: { learned: Learnings; userId: string }
) => {
  const current =
    (await memory.getWorkingMemory({
      resourceId: userId,
      threadId: tasteThread(userId),
    })) ?? TASTE_TEMPLATE;
  const lines = current.split("\n");
  replaceSection(lines, SOLD_HEADING, learned.sold);
  replaceSection(lines, UNSOLD_HEADING, learned.unsold);
  await memory.updateWorkingMemory({
    resourceId: userId,
    threadId: tasteThread(userId),
    workingMemory: lines.join("\n"),
  });
};
