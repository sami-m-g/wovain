/**
 * Long-form, localized content for the public SEO pages (integrations, use
 * cases and guides). It lives outside messages/*.json so it is only loaded by
 * the server pages that render it and never shipped to the client.
 */

export const INTEGRATION_SLUGS = [
  "fourthwall",
  "meta",
  "qloo",
  "tavily",
  "nebius",
  "chatgpt",
] as const;
export type IntegrationSlug = (typeof INTEGRATION_SLUGS)[number];

export const USE_CASE_SLUGS = [
  "creator-merch",
  "youtube-merch",
  "twitch-merch",
  "band-merch",
] as const;
export type UseCaseSlug = (typeof USE_CASE_SLUGS)[number];

export const GUIDE_SLUGS = [
  "price-print-on-demand-merch",
  "launch-a-merch-drop",
] as const;
export type GuideSlug = (typeof GUIDE_SLUGS)[number];

export interface Faq {
  question: string;
  answer: string;
}

export interface Step {
  title: string;
  body: string;
}

interface Integration {
  /** Display name, e.g. "Fourthwall". */
  name: string;
  /** What the partner is, in a few words, e.g. "Print-on-demand shop and catalog". */
  category: string;
  /** H1 for the page. */
  title: string;
  /** Meta description, 140 to 160 characters. */
  description: string;
  /** One or two sentences under the H1. */
  lead: string;
  /** Who connects it: the creator's own account, or wovain's keys. */
  connection: "yours" | "wovain";
  /** One sentence on what the creator has to do (or that they do nothing). */
  setup: string;
  /** What wovain does with it, in the order it happens in a run. */
  steps: Step[];
  /** What is sent to or stored from this service, plainly. */
  data: string;
  faq: Faq[];
  /** Path on docs.wovain.com, e.g. "/docs/integrations/fourthwall". */
  docsPath: string;
  related: UseCaseSlug[];
}

interface UseCase {
  /** Short name, e.g. "YouTube merch". */
  name: string;
  /** H1 for the page. */
  title: string;
  /** Meta description, 140 to 160 characters. */
  description: string;
  lead: string;
  /** The situation the creator is in, one short paragraph. */
  situation: string;
  /** A realistic one-sentence brief this creator could type. */
  exampleBrief: string;
  /** How a drop goes for this creator, in order. */
  steps: Step[];
  /** Concrete tips specific to this audience. */
  tips: string[];
  faq: Faq[];
  related: IntegrationSlug[];
}

interface GuideSection {
  heading: string;
  paragraphs: string[];
  /** Optional bullet list after the paragraphs. */
  list?: string[];
}

interface Guide {
  title: string;
  /** Meta description, 140 to 160 characters. */
  description: string;
  lead: string;
  /** ISO date, e.g. "2026-10-25". */
  published: string;
  readingMinutes: number;
  sections: GuideSection[];
  faq: Faq[];
}

export interface SiteContent {
  integrations: Record<IntegrationSlug, Integration>;
  cases: Record<UseCaseSlug, UseCase>;
  guides: Record<GuideSlug, Guide>;
}
