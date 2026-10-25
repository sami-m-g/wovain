import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { z } from "zod";

import { external, notConfigured } from "./log";
import type { Logger } from "./log";

// NVIDIA Nemotron 3 Super (120B, 12B active) on Nebius Token Factory, through
// its OpenAI-compatible API and the official OpenAI SDK. wovain's own model
// calls (design briefs, the design judge, ad copy and autopilot's decisions)
// all go through `ask`, which returns schema-checked JSON.
export const NEMOTRON_MODEL = "nvidia/nemotron-3-super-120b-a12b";

export interface NebiusConfig {
  apiKey: string | undefined;
  baseURL: string;
}

export interface Ask<T extends z.ZodType> {
  log?: Logger | undefined;
  // Names the call in logs and in the response format.
  name: string;
  prompt: string;
  schema: T;
  system: string;
  temperature?: number;
}

export const createNemotron = ({ apiKey, baseURL }: NebiusConfig) => {
  const client =
    apiKey === undefined
      ? undefined
      : new OpenAI({ apiKey, baseURL, timeout: 90_000 });
  return async <T extends z.ZodType>({
    log,
    name,
    prompt,
    schema,
    system,
    temperature = 0.4,
  }: Ask<T>): Promise<z.output<T>> => {
    if (client === undefined) {
      throw notConfigured("nebius", "NEBIUS_API_KEY");
    }
    return await external(
      log,
      { operation: name, provider: "nebius" },
      async () => {
        const completion = await client.chat.completions.parse({
          messages: [
            { content: system, role: "system" },
            { content: prompt, role: "user" },
          ],
          model: NEMOTRON_MODEL,
          response_format: zodResponseFormat(schema, name),
          temperature,
        });
        const parsed = completion.choices[0]?.message.parsed;
        if (parsed === null || parsed === undefined) {
          throw new Error("Nemotron returned no structured answer");
        }
        return schema.parse(parsed);
      }
    );
  };
};

export type Nemotron = ReturnType<typeof createNemotron>;
