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

/** The idea the drop's Qloo sections explain: the first picked, else the best scored. */
export const leadIdeaOf = <T extends { id: string; score: number }>(
  ideas: readonly T[],
  picked: readonly string[]
): T | undefined =>
  ideas.find((idea) => picked.includes(idea.id)) ??
  ideas.toSorted((a, b) => b.score - a.score)[0];
