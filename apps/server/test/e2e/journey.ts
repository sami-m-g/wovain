import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { CallToolResult, Client } from "@modelcontextprotocol/client";

// Records the journey for the proof report and the demo video
// (apps/widgets/proof): each step's tool call, redacted, with its timing,
// the checks that passed and the widget its result opens.
const reportDir =
  process.env["E2E_REPORT_DIR"] ??
  path.join(import.meta.dirname, "..", "..", "..", "..", "e2e-report");

const secretKey =
  /token|secret|password|authorization|cookie|verifier|api_?key|nonce/iu;
const secretParam =
  /(?<name>ticket|state|code|secret|token|sig|signature)=[^&\s"]+/gu;

// Credentials never reach the report: secret-looking fields are blanked and
// one-time URL parameters masked.
const redact = (value: unknown): unknown => {
  if (typeof value === "string") {
    return value.replaceAll(secretParam, "$<name>=[redacted]");
  }
  if (Array.isArray(value)) {
    return value.map(redact);
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        secretKey.test(key) ? "[redacted]" : redact(child),
      ])
    );
  }
  return value;
};

interface StepInfo {
  // The narration line for the demo and the report's heading.
  say: string;
  title: string;
  // false for a call the widget makes whose result it doesn't draw.
  widget?: false;
}

interface Step extends Omit<StepInfo, "widget"> {
  checks: string[];
  input: unknown;
  ms: number;
  page?: string;
  result?: unknown;
  tool: string;
  widget?: string;
}

export const createJourney = async (client: Client, live: string[]) => {
  // Which widget each tool's result opens, from its ui:// resource.
  const { tools } = await client.listTools();
  const widgets = new Map(
    tools.flatMap((tool) => {
      const uri = JSON.stringify(tool._meta ?? {});
      const name = /ui:\/\/wovain\/(?<name>[a-z]+)-v\d+\.html/u.exec(uri)
        ?.groups?.["name"];
      return name === undefined ? [] : [[tool.name, name] as const];
    })
  );
  const steps: Step[] = [];
  const replies: Record<string, unknown> = {};
  const startedAt = new Date().toISOString();

  return {
    // Calls `tool` as the agent would; `check` asserts on the result and
    // names what it checked.
    call: async (
      info: StepInfo,
      tool: string,
      input: Record<string, unknown>,
      check: (result: CallToolResult) => string[]
    ) => {
      const start = performance.now();
      const result = await client.callTool({
        arguments: input,
        name: tool,
      });
      const ms = performance.now() - start;
      const checks = check(result);
      replies[tool] = redact(result);
      const widget = info.widget === false ? undefined : widgets.get(tool);
      steps.push({
        checks,
        input: redact(input),
        ms,
        result: redact(result),
        say: info.say,
        title: info.title,
        tool,
        ...(widget === undefined ? {} : { widget }),
      });
      return result;
    },
    // A step outside MCP: the merchant in the browser.
    record: (step: Omit<Step, "page"> & { page?: string }) => {
      steps.push({
        ...step,
        input: redact(step.input),
        ...(step.page === undefined ? {} : { page: String(redact(step.page)) }),
      });
    },
    save: async () => {
      await mkdir(reportDir, { recursive: true });
      await writeFile(
        path.join(reportDir, "journey.json"),
        JSON.stringify({ live, replies, startedAt, steps }, null, 2)
      );
    },
  };
};
