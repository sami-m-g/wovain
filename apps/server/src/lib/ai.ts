import { openAICompatible } from "@genkit-ai/compat-oai";
import { genkit } from "genkit";
import type { Genkit } from "genkit";
import { disableGenkitOTelInitialization } from "genkit/tracing";
import { z } from "zod";

// Genkit is wovain's one layer for its own model calls. Models run on Nebius
// Token Factory (OpenAI-compatible); the plugin resolves any
// `nebius/<model id>` on first use.
const NEBIUS_BASE_URL = "https://api.tokenfactory.nebius.com/v1/";

// The models wovain calls, in one place.
export const models = {
  // NVIDIA Nemotron 3 Super (120B, 12B active).
  judge: "nebius/nvidia/nemotron-3-super-120b-a12b",
  // Ranks and phrases research_trends' ideas.
  trends: "nebius/nvidia/nemotron-3-super-120b-a12b",
} as const;

// Without a key there is no Genkit instance, and each feature says it isn't
// set up.
export const createAi = (apiKey?: string): Genkit | undefined => {
  if (apiKey === undefined) {
    return undefined;
  }
  // Genkit would otherwise start its own OpenTelemetry SDK on the first call;
  // its spans go to the tracer telemetry.ts registers instead.
  disableGenkitOTelInitialization();
  return genkit({
    plugins: [
      openAICompatible({
        apiKey,
        baseURL: NEBIUS_BASE_URL,
        name: "nebius",
        timeout: 60_000,
      }),
    ],
  });
};

// Genkit's schema helpers are zod 3 and wovain's schemas are zod 4, so the
// schema crosses as JSON Schema (draft 7, which Genkit validates with) and
// the reply is parsed with the zod 4 schema. Genkit adds the schema to the
// prompt and to response_format itself.
export const generateObject = async <T>(
  ai: Genkit,
  {
    model,
    prompt,
    schema,
    system,
    temperature,
  }: {
    model: string;
    prompt: string;
    schema: z.ZodType<T>;
    system: string;
    temperature?: number;
  }
): Promise<T> => {
  const { $schema: _draft, ...jsonSchema } = z.toJSONSchema(schema, {
    target: "draft-7",
  });
  const response = await ai.generate({
    config: temperature === undefined ? {} : { temperature },
    model,
    output: { format: "json", jsonSchema },
    prompt,
    system,
  });
  return schema.parse(response.output);
};
