import type { Stage } from "@/components/product/run-tape";
import { stageOf } from "@/components/product/run-tape";

/** The drop page's working sections, read top to bottom after the Qloo ones. */
export const DROP_SECTIONS = [
  "ideas",
  "designs",
  "products",
  "campaign",
] as const;

export type DropSection = (typeof DROP_SECTIONS)[number];

export type SectionState =
  | "done"
  | "waiting"
  | "working"
  | "stopped"
  | "not_started";

const SECTION_STAGE: Record<DropSection, Stage> = {
  campaign: "campaign",
  designs: "designs",
  ideas: "trends",
  products: "products",
};

const ORDER: readonly Stage[] = [
  "brief",
  "trends",
  "designs",
  "products",
  "campaign",
];

interface RunState {
  status: "running" | "awaiting_approval" | "completed" | "failed";
  step?: string | null;
}

/** Where a section stands, from the run's status and step. */
export const sectionState = (
  section: DropSection,
  run: RunState
): SectionState => {
  if (run.status === "completed") {
    return "done";
  }
  const at = ORDER.indexOf(stageOf(run));
  const own = ORDER.indexOf(SECTION_STAGE[section]);
  if (own < at) {
    return "done";
  }
  if (own > at) {
    return "not_started";
  }
  if (run.status === "failed") {
    return "stopped";
  }
  return run.status === "running" ? "working" : "waiting";
};

// Steps before the ideas gate opens: nothing is picked yet.
const BEFORE_PICK = new Set([null, undefined, "research", "name", "ideas"]);

/**
 * The ideas the run draws: those with a design, the ones the merchant just
 * approved at the gate and, past the gate with nothing drawn yet, a run's
 * only idea. A drop started from an idea picked on the Home has that one
 * idea and no gate, so it is picked from the start.
 */
export const pickedIdeaIdsOf = (
  run: {
    designs: readonly { ideaId: string }[];
    ideas: readonly { id: string }[];
    step?: string | null;
  },
  approved: readonly string[]
): string[] => {
  const [only, ...others] = run.ideas;
  const pickedRun =
    only !== undefined && others.length === 0 && !BEFORE_PICK.has(run.step);
  return [
    ...new Set([
      ...run.designs.map((one) => one.ideaId),
      ...approved,
      ...(pickedRun ? [only.id] : []),
    ]),
  ];
};

/** The idea the drop's Qloo sections explain: the first picked, else the best scored. */
export const leadIdeaOf = <T extends { id: string; score: number }>(
  ideas: readonly T[],
  picked: readonly string[]
): T | undefined =>
  ideas.find((idea) => picked.includes(idea.id)) ??
  ideas.toSorted((a, b) => b.score - a.score)[0];
