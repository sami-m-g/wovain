import type { ModelRole } from "./model-router";

// wovain's agents by job: the IDs and the model role each runs on when
// routed. Data only; @wovain/mastra builds the Mastra agents from it
// (agents/kit).

export const AGENT_IDS = [
  "design_brief",
  "design_judge",
  "design_vision",
  "ad_copy",
  "ad_judge",
  "autopilot_pick_idea",
  "autopilot_review_design",
  "brand_proxies",
  "research_themes",
  "brief_terms",
  "ads_optimizer_review",
  "voice_intent",
  "competition_summary",
  "brand_discovery",
  "drop_directions",
  "drop_style",
  "idea_words",
  "product_listing",
] as const;
export type AgentId = (typeof AGENT_IDS)[number];

// Which job each agent does, so which Nemotron model it runs on when routed:
// - default: what the merchant publishes (briefs, ad copy) and research.
// - reasoning: verdicts (the design judge, autopilot's go/no-go).
// - vision: looking at the drawn PNG.
// - fast: short binary checks (the ad judges).
export const AGENT_ROLES = {
  ad_copy: "default",
  ad_judge: "fast",
  ads_optimizer_review: "reasoning",
  autopilot_pick_idea: "reasoning",
  autopilot_review_design: "reasoning",
  // Names and words the starter brands Qloo found in onboarding (name,
  // niche, voice lines, palettes, products): it writes, code ranks.
  brand_discovery: "default",
  // Reads web results for a brand reference and names Qloo-searchable
  // proxies: research, on the default model.
  brand_proxies: "default",
  // Copies the phrases Qloo may know out of a brief: extraction, fast.
  brief_terms: "fast",
  // Reads competitors' listing pages and lists how they sell, each point
  // with its page: research, on the default model.
  competition_summary: "default",
  design_brief: "default",
  design_judge: "reasoning",
  design_vision: "vision",
  // Names the drop directions Qloo found rising for the brand (title, brief,
  // why now): it writes, code ranks.
  drop_directions: "default",
  // Suggests one drop's tones and palettes from its Qloo audience.
  drop_style: "default",
  // Names each idea past the evidence gate (title and concept) from its
  // evidence only; code checks every number and claim (./idea-words).
  idea_words: "default",
  // Rewrites a product page (name and description) for the Store.
  product_listing: "default",
  research_themes: "default",
  // Maps a spoken command, in any of the app's languages, to one action.
  voice_intent: "default",
} as const satisfies Record<AgentId, ModelRole>;
