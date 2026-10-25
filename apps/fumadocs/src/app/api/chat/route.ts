import { createOpenRouter } from "@openrouter/ai-sdk-provider";
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

const openrouter = ENV.OPENROUTER_API_KEY
  ? createOpenRouter({ apiKey: ENV.OPENROUTER_API_KEY })
  : undefined;

/** System prompt, you can update it to provide more specific information */
const systemPrompt = [
  "You are an AI assistant for a documentation site.",
  "Use the `search` tool to retrieve relevant docs context before answering when needed.",
  'A user message may begin with [Client Context], the page they are reading. For questions about "this page", search its title.',
  "The `search` tool returns raw JSON results from documentation. Use those results to ground your answer and cite sources as markdown links using the document `url` field when available.",
  "If you cannot find the answer in search results, say you do not know and suggest a better search query.",
].join("\n");

const searchTool = tool({
  description: "Search the docs content and return raw JSON results.",
  async execute({ query, limit }): Promise<InferToolOutput<SearchTool>> {
    const search = await searchServer;
    return await search.searchAsync(query, {
      enrich: true,
      limit,
      merge: true,
    });
  },
  inputSchema: z.object({
    limit: z.number().int().min(1).max(100).default(10),
    query: z.string(),
  }),
}) satisfies SearchTool;

export const POST = async (req: Request, _ctx: RouteContext<"/api/chat">) => {
  if (!openrouter) {
    return new Response("AI chat is not configured", { status: 503 });
  }

  const reqJson = await req.json();

  const result = streamText({
    instructions: systemPrompt,
    messages: await convertToModelMessages<ChatUIMessage>(
      reqJson.messages ?? [],
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
    model: openrouter.chat(ENV.OPENROUTER_MODEL),
    stopWhen: stepCountIs(5),
    toolChoice: "auto",
    tools: {
      search: searchTool,
    },
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
};
