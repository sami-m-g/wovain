import type { MastraScorers } from "@mastra/core/evals";
import { createScorer } from "@mastra/core/evals";
import type { MastraModelConfig } from "@mastra/core/llm";
import {
  createAnswerRelevancyScorer,
  createBiasScorer,
  createCompletenessScorer,
  createFaithfulnessScorer,
  createHallucinationScorer,
  createPromptAlignmentScorerLLM,
  createToxicityScorer,
} from "@mastra/evals/scorers/prebuilt";
import {
  getAssistantMessageFromRunOutput,
  getCombinedSystemPrompt,
  getUserMessageFromRunInput,
} from "@mastra/evals/scorers/utils";
import type { AgentId } from "@wovain/core/agents";
import {
  judgeInstructions,
  judgePrompt,
  verdictSchema,
} from "@wovain/core/judges";
import type { JudgeId } from "@wovain/core/judges";

// The scorers on wovain's agents. Built-in Mastra scorers cover the generic
// failure modes (relevancy, faithfulness to the research, hallucination,
// toxicity, bias, completeness, prompt alignment); wovain's own binary
// judges (./judges) cover the domain ones. Each is sampled on live calls
// and run in full offline on the labeled set (src/evals). Scores land in
// Mastra's store and reach PostHog as agent_score (packages/api).
//
// Tool-call accuracy isn't attached: no agent calls tools. Each model call
// is a one-shot structured answer, and the provider calls are workflow
// steps by design, so there is no tool choice to score.

// A wovain judge as a Mastra scorer: 1 for Pass, 0 for Fail. The context is
// what the agent was asked (its prompt and, for brand fit, the merchant's
// memory in the system prompt); the output is its answer.
export const judgeScorer = (id: JudgeId, model: MastraModelConfig) =>
  createScorer({
    description: `wovain judge: ${id.replaceAll("_", " ")} (Pass = 1, Fail = 0)`,
    id: `judge_${id}`,
    judge: { instructions: judgeInstructions(id), model },
    type: "agent",
  })
    .preprocess(({ run }) => ({
      context: {
        asked: getUserMessageFromRunInput(run.input) ?? "",
        ...(id === "brand_fit" && {
          memory: getCombinedSystemPrompt(run.input),
        }),
      },
      output: getAssistantMessageFromRunOutput(run.output) ?? "",
    }))
    .analyze({
      createPrompt: ({ results }) =>
        judgePrompt(
          results.preprocessStepResult.context,
          results.preprocessStepResult.output
        ),
      description: "Pass or Fail, critique first",
      outputSchema: verdictSchema,
    })
    .generateScore(({ results }) =>
      results.analyzeStepResult.result === "Pass" ? 1 : 0
    )
    .generateReason(({ results }) => results.analyzeStepResult.critique);

export type AnyScorer = MastraScorers[string]["scorer"];

const DOMAIN: Record<AgentId, JudgeId[]> = {
  ad_copy: ["ad_copy_quality", "meta_policy", "brand_fit"],
  ad_judge: [],
  ads_optimizer_review: [],
  autopilot_pick_idea: ["trend_fit"],
  autopilot_review_design: [],
  brand_discovery: [],
  brand_proxies: [],
  brief_terms: [],
  competition_summary: [],
  design_brief: ["design_quality", "brand_fit", "trend_fit", "ip_risk"],
  design_judge: [],
  design_vision: [],
  drop_directions: [],
  drop_style: [],
  idea_words: [],
  product_listing: [],
  research_themes: [],
  // The merchant's own words: never judged, so never sent to scorers.
  voice_intent: [],
};

// Built-ins per agent. Faithfulness and hallucination read the research the
// brief was written from (its prompt), so they only fit the brief writer.
const BUILT_INS: Record<AgentId, string[]> = {
  ad_copy: ["answer_relevancy", "prompt_alignment", "toxicity", "bias"],
  // A judge itself: its verdict is the score.
  ad_judge: [],
  ads_optimizer_review: ["answer_relevancy"],
  autopilot_pick_idea: ["answer_relevancy", "prompt_alignment"],
  autopilot_review_design: ["answer_relevancy", "prompt_alignment", "bias"],
  // Writes names and words from the Qloo facts in its prompt.
  brand_discovery: ["answer_relevancy", "prompt_alignment", "toxicity"],
  // The names it lists must come from the web results in its prompt.
  brand_proxies: ["faithfulness", "hallucination"],
  // Code keeps only phrases copied from the brief: nothing to score.
  brief_terms: [],
  // Every point it lists must come from the listing pages in its prompt.
  competition_summary: ["faithfulness", "hallucination"],
  design_brief: [
    "answer_relevancy",
    "faithfulness",
    "hallucination",
    "prompt_alignment",
    "toxicity",
    "bias",
    "completeness",
  ],
  design_judge: ["answer_relevancy", "prompt_alignment", "completeness"],
  // The text scorers can't see the image the answer is about.
  design_vision: [],
  // Writes titles and "why now" lines from the Qloo and news facts given.
  drop_directions: ["answer_relevancy", "prompt_alignment", "toxicity"],
  drop_style: ["answer_relevancy", "prompt_alignment"],
  // Titles and concepts from the evidence given.
  idea_words: ["answer_relevancy", "prompt_alignment", "toxicity"],
  // Every claim on the page must come from the product facts in its prompt.
  product_listing: [
    "answer_relevancy",
    "faithfulness",
    "hallucination",
    "toxicity",
  ],
  research_themes: ["answer_relevancy", "prompt_alignment"],
  voice_intent: [],
};

export const createScorers = (model: MastraModelConfig, rate: number) => {
  const builtIns: Record<string, AnyScorer> = {
    answer_relevancy: createAnswerRelevancyScorer({ model }),
    bias: createBiasScorer({ model }),
    completeness: createCompletenessScorer(),
    faithfulness: createFaithfulnessScorer({ model }),
    hallucination: createHallucinationScorer({ model }),
    prompt_alignment: createPromptAlignmentScorerLLM({
      model,
      options: { evaluationMode: "both" },
    }),
    toxicity: createToxicityScorer({ model }),
  };
  const judges = Object.fromEntries(
    (
      [
        "design_quality",
        "brand_fit",
        "trend_fit",
        "ip_risk",
        "ad_copy_quality",
        "meta_policy",
      ] as const
    ).map((id) => [`judge_${id}`, judgeScorer(id, model)])
  ) as Record<string, AnyScorer>;
  const all: Record<string, AnyScorer> = { ...builtIns, ...judges };
  const sampling = { rate, type: "ratio" as const };
  const forAgent = (id: AgentId): MastraScorers =>
    Object.fromEntries(
      [
        ...BUILT_INS[id],
        ...DOMAIN[id].map((judge) => `judge_${judge}`),
      ].flatMap((name) => {
        const scorer = all[name];
        return scorer === undefined ? [] : [[name, { sampling, scorer }]];
      })
    );
  return { all, forAgent };
};
