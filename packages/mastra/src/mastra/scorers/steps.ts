import { createScorer } from "@mastra/core/evals";
import { REQUIRED_PX } from "@wovain/core/design";
import { pricingRules, profitPerSale } from "@wovain/core/pricing";
import { z } from "zod";

// Code scorers on the run workflow's steps: facts code can check without a
// model. Each step puts what it made in its output's `facts` (one item, or
// a list with one per design); each scorer returns the share of its checks
// that pass (1 = all).

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
  profitPerSale(price, pricingRules().defaultBaseCost) >=
  pricingRules().minProfit;

export const copyChecks = ({ variants }: z.infer<typeof copyFactsSchema>) =>
  variants.flatMap((variant) => [
    variant.headline.length <= LIMITS.headline,
    variant.message.length <= LIMITS.message,
  ]);

// A step that made several things (one per design) puts a list in `facts`;
// each item is scored and the step gets their mean.
const factsOf = <T extends z.ZodType>(
  schema: T,
  output: unknown
): z.output<T>[] => {
  const facts: unknown =
    typeof output === "object" && output !== null && "facts" in output
      ? output.facts
      : undefined;
  const items: unknown[] = Array.isArray(facts) ? facts : [facts];
  return items.flatMap((item) => {
    const parsed = schema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
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
      if (facts.length === 0) {
        return 0;
      }
      const shares = facts.map((item) => share(checks(item)));
      return shares.reduce((sum, value) => sum + value, 0) / shares.length;
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
