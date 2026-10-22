import { printQuality } from "@wovain/shared/design";
import { judgeReplySchema, judgeRuleSchema } from "@wovain/shared/judge";
import type {
  DesignBrief,
  DesignJudgment,
  JudgeCheck,
  JudgeReply,
  JudgeRule,
} from "@wovain/shared/judge";
import type { Genkit } from "genkit";

import { generateObject, models } from "./ai.ts";

export type DesignJudge = (brief: DesignBrief) => Promise<DesignJudgment>;

const COLORS_MIN = 3;
const COLORS_MAX = 5;

// Rules code alone decides; the model's word on them is replaced. For the
// other rules code checks (colors), a code failure overrides a model pass.
const CODE_ONLY: ReadonlySet<JudgeRule> = new Set([
  "print_size",
  "transparency",
]);

export const ruleFacts = (brief: DesignBrief): JudgeCheck[] => {
  const { artwork, colors } = brief;
  const sharp = printQuality(artwork) === "high";
  const inStock = colors.filter((color) => color.inStock).length;
  return [
    {
      note: sharp
        ? `${artwork.widthPx} px wide, ${artwork.requiredPx} px needed.`
        : `Only ${artwork.widthPx} px wide; ${artwork.requiredPx} px needed. Upscale or use a smaller placement.`,
      pass: sharp,
      rule: "print_size",
    },
    {
      note: artwork.transparent
        ? "Transparent background."
        : "The background isn't transparent. Remove it.",
      pass: artwork.transparent,
      rule: "transparency",
    },
    {
      note: `${inStock} in-stock colors; use ${COLORS_MIN} to ${COLORS_MAX}.`,
      pass: inStock >= COLORS_MIN && inStock <= COLORS_MAX,
      rule: "colors",
    },
  ];
};

// Merges code's facts into the model's checks; any failed check means revise.
export const applyFacts = (
  reply: JudgeReply,
  facts: JudgeCheck[]
): DesignJudgment => {
  const byRule = new Map<JudgeRule, JudgeCheck>(
    reply.checks.map((check) => [check.rule, check])
  );
  for (const fact of facts) {
    if (CODE_ONLY.has(fact.rule) || !byRule.has(fact.rule) || !fact.pass) {
      byRule.set(fact.rule, fact);
    }
  }
  const checks = [...byRule.values()];
  return {
    ...reply,
    checks,
    verdict: checks.every((check) => check.pass) ? "ready" : "revise",
  };
};

const SYSTEM = `You check print-on-demand product designs before the merchant sees them. Judge the brief against these rules and answer only with JSON.

Rules:
- title: keyword first: the main keyword, then the design element, then the style.
- description: two short on-brand lines. No garment specs (fabric, fit, care); the shop adds those.
- colors: ${COLORS_MIN} to ${COLORS_MAX} in-stock colors, each contrasting with the artwork so the print stands out.
- idea_fit: the blank, placement and listing match the merchant's idea.
- ${[...CODE_ONLY].join(" and ")}: the facts you are given are final; repeat them.

Give one check per rule (${judgeRuleSchema.options.join(", ")}) with a short note. List up to 5 concrete fixes, most important first. score is 0 to 100. coach is one friendly line (at most 160 characters) for the merchant about this design.`;

export const createDesignJudge =
  (ai: Genkit, model: string = models.judge): DesignJudge =>
  async (brief) => {
    const facts = ruleFacts(brief);
    const reply = await generateObject(ai, {
      model,
      prompt: JSON.stringify({ brief, facts }),
      schema: judgeReplySchema,
      system: SYSTEM,
      temperature: 0.2,
    });
    return applyFacts(reply, facts);
  };

// The judge on Nemotron, or undefined without Genkit (no Nebius key).
export const designJudgeFor = (
  ai: Genkit | undefined
): DesignJudge | undefined =>
  ai === undefined ? undefined : createDesignJudge(ai);
