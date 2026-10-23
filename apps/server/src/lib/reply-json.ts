// The data in an upstream tool reply: its structured content plus any JSON
// its text blocks carry (some servers put the JSON only in text). Replies are
// untrusted data; callers keep only fields with the right shape.

export interface Reply {
  content?: unknown;
  structuredContent?: unknown;
}

// JSON from untrusted text, or undefined when it isn't JSON.
export const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

export const replyRoots = ({
  content,
  structuredContent,
}: Reply): unknown[] => [
  structuredContent,
  ...(Array.isArray(content) ? content : []).map((block: unknown) =>
    typeof block === "object" &&
    block !== null &&
    "text" in block &&
    typeof block.text === "string"
      ? parseJson(block.text)
      : undefined
  ),
];
