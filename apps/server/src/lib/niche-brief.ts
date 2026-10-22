import { isWebUrl, nicheBriefSchema } from "@wovain/shared/trends";
import { z } from "zod";

import { clip, TIMEOUT_S } from "./tavily.ts";
import type { TavilyApi } from "./tavily.ts";

// The cited niche brief: Tavily Research (model mini) fills this schema in
// the background. research_trends starts it; get_niche_brief polls it, so
// neither MCP call waits for it.

const list = (description: string) => ({
  description,
  items: { description, type: "string" },
  type: "array",
});

const BRIEF_SCHEMA = {
  properties: {
    angles: list("Up to 5 design or message angles that sell in this niche"),
    audience: {
      description:
        "Who buys t-shirts in this niche: ages, identities, where they gather",
      type: "string",
    },
    priceBand: {
      description: "The usual retail price range for a tee here, in USD",
      type: "string",
    },
    risks: list("Up to 5 risks: trademarks, saturated designs, seasonality"),
    sources: list("URLs of the pages the brief relies on"),
  },
  required: ["audience", "priceBand", "angles", "risks"],
};

export const startBrief = async (
  client: TavilyApi,
  seed: string,
  themes: string[]
) => {
  const started = await client.research(
    `A print-on-demand t-shirt niche brief for fans of "${seed}" (themes: ${themes.join(", ")}): who buys, the usual price band, design angles that sell, and risks such as trademarks and saturation. Cite sources.`,
    {
      citationFormat: "numbered",
      model: "mini",
      outputSchema: BRIEF_SCHEMA,
      // Not in the SDK's options: sent as-is.
      output_length: "short",
      timeout: TIMEOUT_S,
    }
  );
  return "requestId" in started ? started.requestId : undefined;
};

// The SDK returns the status reply as Tavily sends it (snake_case), so it's
// parsed leniently here.
const replySchema = z.object({
  content: z.unknown().optional(),
  sources: z
    .array(z.object({ title: z.string().optional(), url: z.string() }))
    .optional(),
  status: z.string().max(32),
  usage: z.object({ credits: z.number().optional() }).optional(),
});

const text = (value: unknown, max: number) =>
  typeof value === "string" ? clip(value, max) : undefined;
const texts = (value: unknown) =>
  Array.isArray(value)
    ? value.flatMap((item) =>
        typeof item === "string" ? [clip(item, 300)] : []
      )
    : [];

const briefOf = (content: unknown) => {
  const fields: Record<string, unknown> =
    typeof content === "object" && content !== null ? { ...content } : {};
  return nicheBriefSchema.parse({
    angles: texts(fields["angles"]).slice(0, 5),
    audience: text(fields["audience"] ?? content, 1200),
    priceBand: text(fields["priceBand"], 200),
    risks: texts(fields["risks"]).slice(0, 5),
  });
};

export const brief = async (client: TavilyApi, id: string) => {
  const reply = replySchema.parse(
    await client.getResearch(id, { includeUsage: true })
  );
  if (reply.status === "failed" || reply.status === "in_progress") {
    return { status: reply.status };
  }
  if (reply.status !== "completed") {
    return { status: "pending" as const };
  }
  const fields: Record<string, unknown> =
    typeof reply.content === "object" && reply.content !== null
      ? { ...reply.content }
      : {};
  const urls: { title?: string; url: string }[] = [
    // Tavily's own sources come last, so their titles win.
    ...texts(fields["sources"]).map((url) => ({ url })),
    ...(reply.sources ?? []),
  ].filter(({ url }) => isWebUrl(url));
  return {
    brief: briefOf(reply.content),
    credits: reply.usage?.credits ?? 0,
    sources: [...new Map(urls.map((source) => [source.url, source])).values()]
      .slice(0, 10)
      .map(({ title, url }) => ({
        ...(title === undefined ? {} : { title: clip(title, 300) }),
        url,
      })),
    status: "completed" as const,
  };
};
