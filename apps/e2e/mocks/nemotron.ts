import { HttpResponse, http } from "msw";

// Nemotron on Nebius (OpenAI-compatible chat completions). Every agent asks
// for structured output with a JSON schema (response_format json_schema), so
// the mock answers each call with a plain valid value for its schema: the
// same request always gets the same reply. Mastra's schema compat moves the
// string limits and patterns into each field's description ("minimum length
// 8, maximum length 60", "input must match this regex ^#[\da-f]{6}$") and
// drops array limits, so strings honour the description and every array has
// ARRAY_ITEMS items.

interface Schema {
  anyOf?: Schema[];
  const?: unknown;
  description?: string;
  enum?: unknown[];
  items?: Schema;
  minimum?: number;
  properties?: Record<string, Schema>;
  type?: string | string[];
}

const TEXT = "Fern study in moss green ink";
const ARRAY_ITEMS = 3;
// Values tried, in turn, against a field's regex.
const PATTERNED = ["#2f4f2f", "fern-study", "Fern study"];
const MIN_LENGTH = /minimum length (?<min>\d+)/u;
const MAX_LENGTH = /maximum length (?<max>\d+)/u;
const REGEX = /must match this regex (?<source>\S+)/u;
const DEFAULT_MAX = 200;

const textFor = (description = "") => {
  const source = REGEX.exec(description)?.groups?.["source"];
  if (source !== undefined) {
    const pattern = new RegExp(source, "iu");
    const value = PATTERNED.find((candidate) => pattern.test(candidate));
    if (value === undefined) {
      throw new Error(`No e2e value matches ${source}`);
    }
    return value;
  }
  const min = Number(MIN_LENGTH.exec(description)?.groups?.["min"] ?? 0);
  const max = Number(
    MAX_LENGTH.exec(description)?.groups?.["max"] ?? DEFAULT_MAX
  );
  return TEXT.padEnd(min, ".").slice(0, max);
};

const valueOf = (schema: Schema): unknown => {
  if (schema.const !== undefined) {
    return schema.const;
  }
  if (schema.enum !== undefined) {
    return schema.enum[0];
  }
  if (schema.anyOf?.[0] !== undefined) {
    return valueOf(schema.anyOf[0]);
  }
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  switch (type) {
    case "object": {
      return Object.fromEntries(
        Object.entries(schema.properties ?? {}).map(([key, value]) => [
          key,
          valueOf(value),
        ])
      );
    }
    case "array": {
      return Array.from({ length: ARRAY_ITEMS }, () =>
        valueOf(schema.items ?? {})
      );
    }
    case "number":
    case "integer": {
      return schema.minimum ?? 1;
    }
    case "boolean": {
      return true;
    }
    case "null": {
      return null;
    }
    default: {
      return textFor(schema.description);
    }
  }
};

interface ChatRequest {
  model: string;
  response_format?: { json_schema?: { schema?: Schema } };
  stream?: boolean;
}

const USAGE = { completion_tokens: 1, prompt_tokens: 1, total_tokens: 2 };

// A streamed answer: the whole reply in one chunk, then [DONE].
const streamed = (model: string, content: string) => {
  const chunk = {
    choices: [
      {
        delta: { content, role: "assistant" },
        finish_reason: "stop",
        index: 0,
      },
    ],
    created: Math.floor(Date.now() / 1000),
    id: "chatcmpl-e2e",
    model,
    object: "chat.completion.chunk",
    usage: USAGE,
  };
  return new HttpResponse(
    `data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`,
    {
      headers: { "Content-Type": "text/event-stream" },
    }
  );
};

export const nemotron = http.post(
  "https://api.tokenfactory.nebius.com/v1/chat/completions",
  async ({ request }) => {
    const body = (await request.json()) as ChatRequest;
    const schema = body.response_format?.json_schema?.schema;
    const content =
      schema === undefined ? TEXT : JSON.stringify(valueOf(schema));
    if (body.stream === true) {
      return streamed(body.model, content);
    }
    return HttpResponse.json({
      choices: [
        {
          finish_reason: "stop",
          index: 0,
          message: { content, role: "assistant" },
        },
      ],
      created: Math.floor(Date.now() / 1000),
      id: "chatcmpl-e2e",
      model: body.model,
      object: "chat.completion",
      usage: USAGE,
    });
  }
);
