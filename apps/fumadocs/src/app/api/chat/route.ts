import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { withTracing } from "@posthog/ai/vercel";
import type { InferToolOutput } from "ai";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  tool,
  toUIMessageStream,
} from "ai";
import type { DocumentData } from "flexsearch";
import { Document } from "flexsearch";
import { after } from "next/server";
import { PostHog } from "posthog-node";
import { RateLimiterMemory } from "rate-limiter-flexible";
import { z } from "zod";

import type { ChatUIMessage, SearchTool } from "@/components/ai/search";
import { ENV } from "@/env";
import { source } from "@/lib/source";

interface CustomDocument extends DocumentData {
  url: string;
  title: string;
  description: string;
  content: string;
}

const createSearchServer = async () => {
  const search = new Document<CustomDocument>({
    document: {
      id: "url",
      index: ["title", "description", "content"],
      store: true,
    },
  });

  const docs = await Promise.all(
    source.getPages().map(async (page) => {
      if (!("getText" in page.data)) {
        return null;
      }

      return {
        content: await page.data.getText("processed"),
        description: page.data.description,
        title: page.data.title,
        url: page.url,
      } as CustomDocument;
    })
  );

  for (const doc of docs) {
    if (doc) {
      search.add(doc);
    }
  }

  return search;
};

const searchServer = createSearchServer();

// The docs chat is kept cheap: the smallest Nemotron on Token Factory
// ($0.06 in / $0.24 out per 1M tokens), a short prompt, capped output, three
// short search results, four messages of history and per-visitor limits.
const MAX_OUTPUT_TOKENS = 400;
const MAX_HISTORY_MESSAGES = 4;
const MAX_SEARCH_RESULTS = 3;
const MAX_SNIPPET_CHARS = 700;
const MIN_PROMPT_CHARS = 3;
const MAX_PROMPT_CHARS = 500;
// USD per token.
const MODEL_PRICE = { inputCost: 0.06e-6, outputCost: 0.24e-6 } as const;
const TEN_MINUTES = 10 * 60;
const ONE_DAY = 24 * 60 * 60;
const BURST_PER_IP = 10;
const DAILY_PER_IP = 50;
const DAILY_GLOBAL = 2000;

// Counted in memory per Cloud Run instance (the docs service runs at most two),
// so the real caps are at most twice these numbers.
const perIpBurst = new RateLimiterMemory({
  duration: TEN_MINUTES,
  points: BURST_PER_IP,
});
const perIpDaily = new RateLimiterMemory({
  duration: ONE_DAY,
  points: DAILY_PER_IP,
});
const globalDaily = new RateLimiterMemory({
  duration: ONE_DAY,
  points: DAILY_GLOBAL,
});

const posthog = new PostHog(ENV.POSTHOG_KEY ?? "off", {
  disabled: !ENV.POSTHOG_KEY,
  flushAt: 1,
  host: ENV.POSTHOG_HOST,
});

const nebius = ENV.NEBIUS_API_KEY
  ? createOpenAICompatible({
      apiKey: ENV.NEBIUS_API_KEY,
      baseURL: ENV.NEBIUS_BASE_URL,
      name: "nebius",
    })
  : undefined;

const systemPrompt = [
  "You answer questions about the wovain docs only. Be brief.",
  "Call `search` first, then answer from its results in a few sentences, citing sources as markdown links to their `url`.",
  "A message may start with [Client Context], the page being read.",
  "If the results don't answer it, or the question isn't about wovain, say so in one sentence.",
].join("\n");

const OFF_TOPIC =
  /\b(?:ignore (?:all |any )?(?:previous|prior) instructions|write (?:me )?(?:a |an )?(?:poem|essay|story|song)|tell me a joke|system prompt)\b/iu;

const reply = (error: string, status: number) =>
  Response.json({ error }, { status });

const clientIp = (req: Request) =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

const lastUserText = (messages: ChatUIMessage[]) => {
  const last = messages.findLast((message) => message.role === "user");
  return (
    last?.parts
      .map((part) => (part.type === "text" ? part.text : ""))
      .join(" ")
      .trim() ?? ""
  );
};

// The last few messages, starting on a user turn, with earlier answers reduced
// to their text so old search results aren't sent again.
const recentMessages = (messages: ChatUIMessage[]) => {
  const recent = messages.slice(-MAX_HISTORY_MESSAGES);
  const start = Math.max(
    recent.findIndex((message) => message.role === "user"),
    0
  );
  return recent.slice(start).map((message, index, all) =>
    message.role === "assistant" && index < all.length - 1
      ? {
          ...message,
          parts: message.parts.filter((part) => part.type === "text"),
        }
      : message
  );
};

const overLimit = async (ip: string) => {
  try {
    await Promise.all([
      perIpBurst.consume(ip),
      perIpDaily.consume(ip),
      globalDaily.consume("all"),
    ]);
    return false;
  } catch {
    return true;
  }
};

const searchTool = tool({
  description: "Search the docs content and return raw JSON results.",
  async execute({ query, limit }): Promise<InferToolOutput<SearchTool>> {
    const search = await searchServer;
    const results = await search.searchAsync(query, {
      enrich: true,
      limit,
      merge: true,
    });
    // The model needs a snippet, not the whole page.
    return results.slice(0, MAX_SEARCH_RESULTS).map((result) => ({
      ...result,
      doc: result.doc
        ? {
            description: result.doc.description,
            snippet: result.doc.content.slice(0, MAX_SNIPPET_CHARS),
            title: result.doc.title,
            url: result.doc.url,
          }
        : null,
    }));
  },
  inputSchema: z.object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_SEARCH_RESULTS)
      .default(MAX_SEARCH_RESULTS),
    query: z.string(),
  }),
}) satisfies SearchTool;

export const POST = async (req: Request, _ctx: RouteContext<"/api/chat">) => {
  if (!nebius) {
    return new Response("AI chat is not configured", { status: 503 });
  }

  const reqJson = await req.json();
  const messages: ChatUIMessage[] = reqJson.messages ?? [];
  const prompt = lastUserText(messages);

  if (prompt.length < MIN_PROMPT_CHARS) {
    return reply("Ask a question about wovain.", 400);
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    return reply("Please keep your question under 500 characters.", 400);
  }
  if (OFF_TOPIC.test(prompt)) {
    return reply("I can only answer questions about the wovain docs.", 400);
  }
  if (await overLimit(clientIp(req))) {
    return reply(
      "The docs assistant is busy right now. Please try again tomorrow, or search the docs.",
      429
    );
  }

  // Each model call is a PostHog $ai_generation event: tokens and cost, no text.
  const model = withTracing(nebius.chatModel(ENV.NEBIUS_MODEL), posthog, {
    posthogCaptureImmediate: true,
    posthogCostOverride: MODEL_PRICE,
    posthogDistinctId: "docs-chat",
    posthogPrivacyMode: true,
    posthogProperties: { $ai_span_name: "docs-chat" },
  });

  const result = streamText({
    instructions: systemPrompt,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    messages: await convertToModelMessages<ChatUIMessage>(
      recentMessages(messages),
      {
        convertDataPart(part) {
          if (part.type === "data-client") {
            return {
              text: `[Client Context: ${JSON.stringify(part.data)}]`,
              type: "text",
            };
          }
        },
      }
    ),
    model,
    stopWhen: stepCountIs(3),
    toolChoice: "auto",
    tools: {
      search: searchTool,
    },
  });
  after(() => posthog.flush());

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
};
