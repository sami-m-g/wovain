import { designJudgmentSchema } from "@wovain/shared/judge";
import type {
  DesignBrief,
  DesignJudgment,
  JudgeCheck,
  JudgeRule,
} from "@wovain/shared/judge";
import type { Genkit } from "genkit";
import { z } from "zod";

import { createAi, models } from "./ai.ts";

export type DesignJudge = (brief: DesignBrief) => Promise<DesignJudgment>;

const TITLE_MAX = 120;
const COLORS_MIN = 3;
const COLORS_MAX = 5;

// The rules code can decide on its own. A failure here stands whatever the
// model says.
export const ruleFacts = (brief: DesignBrief): JudgeCheck[] => {
  const { artwork, colors, listing } = brief;
  const inStock = colors.filter((color) => color.inStock).length;
  return [
    {
      note:
        artwork.widthPx >= artwork.requiredPx
          ? `${artwork.widthPx} px wide, ${artwork.requiredPx} px needed.`
          : `Only ${artwork.widthPx} px wide; ${artwork.requiredPx} px needed. Upscale or use a smaller placement.`,
      pass: artwork.widthPx >= artwork.requiredPx,
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
      note: `Title is ${listing.title.length} characters; the limit is ${TITLE_MAX}.`,
      pass: listing.title.length <= TITLE_MAX,
      rule: "title",
    },
    {
      note: `${inStock} in-stock colors; use ${COLORS_MIN} to ${COLORS_MAX}.`,
      pass: inStock >= COLORS_MIN && inStock <= COLORS_MAX,
      rule: "colors",
    },
  ];
};

// Code-decided rules win: print size and transparency are code's alone; for
// title and colors a code failure overrides the model's pass. Any failed
// check means revise.
export const applyFacts = (
  judgment: DesignJudgment,
  facts: JudgeCheck[]
): DesignJudgment => {
  const byRule = new Map<JudgeRule, JudgeCheck>(
    judgment.checks.map((check) => [check.rule, check])
  );
  for (const fact of facts) {
    const model = byRule.get(fact.rule);
    const codeOnly = fact.rule === "print_size" || fact.rule === "transparency";
    if (codeOnly || model === undefined || !fact.pass) {
      byRule.set(fact.rule, fact);
    }
  }
  const checks = [...byRule.values()];
  const failed = checks.some((check) => !check.pass);
  return {
    ...judgment,
    checks,
    verdict: failed ? "revise" : judgment.verdict,
  };
};

const outputJsonSchema = (() => {
  const { $schema: _draft, ...schema } = z.toJSONSchema(designJudgmentSchema, {
    target: "draft-7",
  });
  return schema;
})();

const SYSTEM = `You check print-on-demand product designs before the merchant sees them. Judge the brief against these rules and answer only with JSON that matches the schema.

Rules:
- title: keyword first: the main keyword, then the design element, then the style. At most ${TITLE_MAX} characters.
- description: two short on-brand lines. No garment specs (fabric, fit, care); the shop adds those.
- colors: ${COLORS_MIN} to ${COLORS_MAX} in-stock colors, each contrasting with the artwork so the print stands out.
- idea_fit: the blank, placement and listing match the merchant's idea.
- print_size and transparency: the facts you are given are final; repeat them.

Give one check per rule (print_size, transparency, title, description, colors, idea_fit) with a short note. List up to 5 concrete fixes, most important first. verdict is "ready" only when every check passes. score is 0 to 100. coach is one friendly line (at most 160 characters) for the merchant about this design.

JSON schema:
${JSON.stringify(outputJsonSchema)}`;

export const createDesignJudge = (
  ai: Genkit,
  model: string = models.judge
): DesignJudge => {
  const flow = ai.defineFlow(
    { name: "judgeDesign" },
    async (brief: DesignBrief): Promise<DesignJudgment> => {
      const facts = ruleFacts(brief);
      const response = await ai.generate({
        config: { temperature: 0.2 },
        model,
        output: { format: "json", jsonSchema: outputJsonSchema },
        prompt: JSON.stringify({ brief, facts }),
        system: SYSTEM,
      });
      return applyFacts(designJudgmentSchema.parse(response.output), facts);
    }
  );
  // A flow without Genkit (zod 3) schemas is typed `any`; parsing again
  // gives the result its type back.
  return async (brief) => designJudgmentSchema.parse(await flow(brief));
};

// The judge on Nemotron, or undefined without a Nebius key.
export const designJudgeFor = (
  apiKey: string | undefined
): DesignJudge | undefined => {
  const ai = createAi(apiKey);
  return ai === undefined ? undefined : createDesignJudge(ai);
};
