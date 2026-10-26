import { createScorer } from "@mastra/core/evals";
import { z } from "zod";

import { REQUIRED_PX } from "./design";
import { DEFAULT_BASE_COST, PRICING, profitPerSale } from "./pricing";

// Code scorers on the run workflow's steps: facts code can check without a
// model. Each step puts what it made in its output's `facts`; each scorer
// returns the share of its checks that pass (1 = all).

export const designFactsSchema = z.object({
  artworkWidth: z.number(),
  avoidNames: z.array(z.string()),
  description: z.string(),
  printedText: z.array(z.string()),
  text: z.string(),
  title: z.string(),
});
export type DesignFacts = z.infer<typeof designFactsSchema>;

export const productFactsSchema = z.object({ price: z.number() });

export const copyFactsSchema = z.object({
  variants: z.array(z.object({ headline: z.string(), message: z.string() })),
});

const LIMITS = {
  description: 300,
  headline: 40,
  message: 250,
  printedWords: 8,
  title: 120,
} as const;

const share = (checks: boolean[]) =>
  checks.length === 0 ? 1 : checks.filter(Boolean).length / checks.length;

const words = (text: string) => text.split(/\s+/u).filter(Boolean).length;

export const designChecks = (facts: DesignFacts) => {
  const text = facts.text.toLowerCase();
  return {
    avoidedNames: facts.avoidNames.every(
      (name) => !text.includes(name.toLowerCase())
    ),
    descriptionLength: facts.description.length <= LIMITS.description,
    printSize: facts.artworkWidth >= REQUIRED_PX,
    printedTextLength: facts.printedText.every(
      (line) => words(line) <= LIMITS.printedWords
    ),
    titleLength: facts.title.length <= LIMITS.title,
  };
};

// Without the blank's own cost, the default tee's cost is the floor's base.
export const priceClearsFloor = (price: number) =>
  profitPerSale(price, DEFAULT_BASE_COST) >= PRICING.minProfit;

export const copyChecks = ({ variants }: z.infer<typeof copyFactsSchema>) =>
  variants.flatMap((variant) => [
    variant.headline.length <= LIMITS.headline,
    variant.message.length <= LIMITS.message,
  ]);

const factsOf = <T extends z.ZodType>(
  schema: T,
  output: unknown
): z.output<T> | undefined => {
  const facts: unknown =
    typeof output === "object" && output !== null && "facts" in output
      ? output.facts
      : undefined;
  const parsed = schema.safeParse(facts);
  return parsed.success ? parsed.data : undefined;
};

const codeScorer = <T extends z.ZodType>(
  id: string,
  description: string,
  schema: T,
  checks: (facts: z.output<T>) => boolean[]
) =>
  createScorer({ description, id })
    .preprocess(({ run }) => ({ facts: factsOf(schema, run.output) }))
    .generateScore(({ results }) => {
      const { facts } = results.preprocessStepResult;
      return facts === undefined ? 0 : share(checks(facts));
    });

export const stepScorers = {
  ad_copy_lengths: codeScorer(
    "ad_copy_lengths",
    "Share of ad variants whose headline and text fit Meta's limits",
    copyFactsSchema,
    copyChecks
  ),
  design_facts: codeScorer(
    "design_facts",
    "Share of the design's code checks that pass: print size, avoided names, listing and printed-text lengths",
    designFactsSchema,
    (facts) => Object.values(designChecks(facts))
  ),
  price_floor: codeScorer(
    "price_floor",
    "1 when the product's price clears wovain's minimum profit",
    productFactsSchema,
    ({ price }) => [priceClearsFloor(price)]
  ),
};
