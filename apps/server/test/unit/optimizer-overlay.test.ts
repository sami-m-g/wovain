import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { opsRuleIds } from "@wovain/shared/optimizer/ops";
import { podRuleIds } from "@wovain/shared/optimizer/pod";
import { reconcileRuleIds } from "@wovain/shared/optimizer/reconcile";
import { expect, test } from "vitest";

// The wovain-pod-ads overlay, the code and the model's guidance stay in step:
// every rule ID the overlay names has code (or a guidance line), and code
// names no rule the overlay lacks.
const references = path.join(
  import.meta.dirname,
  "../../../../.agents/skills/wovain-pod-ads/references"
);

const overlayIds = () =>
  readdirSync(references)
    .filter((name) => name.endsWith(".md"))
    .flatMap((name) =>
      [
        ...readFileSync(path.join(references, name), "utf-8").matchAll(
          /^#{2,4} (?<id>POD-[A-Z]\d+|R\d+)\b/gmu
        ),
      ].map((match) => match.groups?.["id"] ?? "")
    );

const codeIds: Record<string, string> = {
  ...podRuleIds,
  ...opsRuleIds,
  ...reconcileRuleIds,
};

test("every overlay rule has code or guidance, and no code rule is missing from the overlay", () => {
  const overlay = overlayIds();
  expect(overlay.length).toBeGreaterThanOrEqual(30);
  expect(new Set(overlay).size).toBe(overlay.length);
  expect(Object.keys(codeIds).toSorted()).toEqual(overlay.toSorted());
  for (const where of Object.values(codeIds)) {
    expect(where).toMatch(/^(?:code|guidance): \S/u);
  }
});
