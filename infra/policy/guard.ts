// Reads `pulumi preview --json` on stdin and writes the plan as Markdown for
// the pull request. Fails when the plan deletes or replaces a stateful
// resource that isn't retainOnDelete or retired (retired.ts): a policy never
// sees deletes, and the engine's protect only covers what's already
// protected in the state. Also fails when the plan changes a resource that
// is frozen: wovain-web or wovain-docs while `wovain:freezeProduction` is
// on in Pulumi.prod.yaml (on unless set to false; infra/index.ts holds them).
// Usage: node infra/policy/guard.ts < preview.json > preview.md
import { readFileSync } from "node:fs";

import { parse } from "yaml";

import { RETIRED } from "./retired.ts";
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

// Empty when the preview failed before Pulumi wrote its JSON: the reason is
// in the log (scripts/pulumi.ts writes it to stderr).
const input = readFileSync(0, "utf-8");
if (input.trim() === "") {
  process.stdout.write(
    "## Infrastructure preview\n\nThe preview didn't run; see the job log.\n"
  );
  process.exit(1);
}
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Pulumi's preview JSON
const preview = JSON.parse(input) as Preview;
const changes = (preview.steps ?? []).filter((step) => step.op !== "same");
// project::type::name, without the stack.
const key = (urn: string) => urn.split("::").slice(1).join("::");
const LOSES_DATA = new Set(["delete", "delete-replaced", "replace"]);
const lost = changes.filter(
  ({ oldState, op, urn }) =>
    LOSES_DATA.has(op) &&
    oldState !== undefined &&
    STATEFUL.has(oldState.type) &&
    oldState.retainOnDelete !== true &&
    !(key(urn) in RETIRED)
);
// Production's services while it is frozen (`wovain:freezeProduction`, on
// unless the stack sets it to false). infra/index.ts makes Pulumi leave
// their templates as they are live; this catches any change that still
// gets through.
const FROZEN = new Set([
  "wovain::gcp:cloudrunv2/service:Service::web",
  "wovain::gcp:cloudrunv2/service:Service::docs",
]);
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Pulumi's stack file
const { config: stackConfig } = parse(
  readFileSync(new URL("../Pulumi.prod.yaml", import.meta.url), "utf-8")
) as { config?: Record<string, unknown> };
const productionFrozen =
  String(stackConfig?.["wovain:freezeProduction"] ?? "true") !== "false";
const frozen = productionFrozen
  ? changes.filter(({ urn }) => FROZEN.has(key(urn)))
  : [];
// Node's warnings on the program's stderr, not errors.
const NODE_NOISE = /ExperimentalWarning|--trace-warnings|^\s*$/u;
// The engine's errors, and the program's stderr (`info#err`), where a
// program that throws reports why.
const errors = (preview.diagnostics ?? []).filter(
  (d) =>
    d.severity === "error" ||
    (d.severity === "info#err" && !NODE_NOISE.test(d.message))
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
  ...frozen.map(
    (step) =>
      `- **Frozen (wovain:freezeProduction):** ${step.op} of \`${name(step.urn)}\``
  ),
  ...errors.map((d) => `- **Error:** ${d.message.trim()}`),
];
process.stdout.write(`${lines.join("\n")}\n`);
if (lost.length > 0) {
  process.stderr.write(
    `Blocked: the plan deletes or replaces ${lost.map((step) => name(step.urn)).join(", ")}. Give it retainOnDelete to release it instead.\n`
  );
  process.exitCode = 1;
}
if (frozen.length > 0) {
  process.stderr.write(
    `Frozen: the plan changes ${frozen.map((step) => name(step.urn)).join(", ")} while wovain:freezeProduction is on.\n`
  );
  process.exitCode = 1;
}
