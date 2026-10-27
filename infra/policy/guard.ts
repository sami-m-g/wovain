// Reads `pulumi preview --json` on stdin and writes the plan as Markdown for
// the pull request. Fails when the plan deletes or replaces a stateful
// resource that isn't retainOnDelete: a policy never sees deletes, and the
// engine's protect only covers what's already protected in the state.
// Usage: node infra/policy/guard.ts < preview.json > preview.md
import { readFileSync } from "node:fs";

import { STATEFUL } from "./types.ts";

interface Step {
  op: string;
  urn: string;
  oldState?: { type: string; retainOnDelete?: boolean };
}
interface Preview {
  steps?: Step[];
  diagnostics?: { message: string; severity: string }[];
  changeSummary?: Record<string, number>;
}

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Pulumi's preview JSON
const preview = JSON.parse(readFileSync(0, "utf-8")) as Preview;
const changes = (preview.steps ?? []).filter((step) => step.op !== "same");
const LOSES_DATA = new Set(["delete", "delete-replaced", "replace"]);
const lost = changes.filter(
  ({ oldState, op }) =>
    LOSES_DATA.has(op) &&
    oldState !== undefined &&
    STATEFUL.has(oldState.type) &&
    oldState.retainOnDelete !== true
);
const errors = (preview.diagnostics ?? []).filter(
  (d) => d.severity === "error"
);
// type::name, without the stack and project.
const name = (urn: string) => urn.split("::").slice(2).join("::");

const summary = Object.entries(preview.changeSummary ?? {})
  .map(([op, count]) => `${count} ${op}`)
  .join(", ");
const lines = [
  "## Infrastructure preview",
  "",
  summary === "" ? "The preview didn't finish." : summary,
  "",
  ...(changes.length === 0
    ? []
    : [
        "| Change | Resource |",
        "| --- | --- |",
        ...changes.map((step) => `| ${step.op} | \`${name(step.urn)}\` |`),
        "",
      ]),
  ...lost.map((step) => `- **Blocked:** ${step.op} of \`${name(step.urn)}\``),
  ...errors.map((d) => `- **Error:** ${d.message.trim()}`),
];
process.stdout.write(`${lines.join("\n")}\n`);
if (lost.length > 0) {
  process.stderr.write(
    `Blocked: the plan deletes or replaces ${lost.map((step) => name(step.urn)).join(", ")}. Give it retainOnDelete to release it instead.\n`
  );
  process.exitCode = 1;
}
