import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const schema = readFileSync(
  fileURLToPath(new URL("../.env.schema", import.meta.url)),
  "utf-8"
);

// The decorator comment lines (`# @required=false ...`) directly above an item.
const decoratorsOf = (key: string) => {
  const lines = schema.split("\n");
  const at = lines.findIndex((line) => line.startsWith(`${key}=`));
  const decorators: string[] = [];
  for (let i = at - 1; i >= 0 && lines[i]?.startsWith("#"); i -= 1) {
    decorators.push(lines[i] ?? "");
  }
  return decorators.join("\n");
};

describe("env schema", () => {
  // Varlock's leak detection throws on any response that contains a sensitive
  // value. A team member's own email is a substring of this list, so while it
  // is sensitive, /api/auth/sign-in/email and /api/auth/get-session answer 500
  // ("DETECTED LEAKED SENSITIVE CONFIG - WOVAIN_ALLOWED_EMAILS").
  it("keeps WOVAIN_ALLOWED_EMAILS out of varlock's leak detection", () => {
    expect(decoratorsOf("WOVAIN_ALLOWED_EMAILS")).toContain("@sensitive=false");
  });

  // Varlock inlines non-sensitive values at build time, and the image is built
  // without the team's emails.
  it("reads WOVAIN_ALLOWED_EMAILS at runtime", () => {
    expect(decoratorsOf("WOVAIN_ALLOWED_EMAILS")).toContain("@dynamic");
  });
});
