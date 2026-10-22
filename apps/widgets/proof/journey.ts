import { readFile } from "node:fs/promises";
import path from "node:path";

import { widgetNames } from "@wovain/shared/widgets";
import { z } from "zod";

// The journey the server's e2e test writes (apps/server/test/e2e): each
// step's tool call with redacted input and output, its timing, the checks
// that passed and the widget its result opens. The report and the demo are
// both drawn from it, so a new step shows up in both.
export const reportDir =
  process.env["E2E_REPORT_DIR"] ??
  path.join(import.meta.dirname, "..", "..", "..", "e2e-report");

const toolResultSchema = z.looseObject({
  content: z.array(z.looseObject({ type: z.string() })),
  isError: z.boolean().optional(),
  structuredContent: z.record(z.string(), z.unknown()).optional(),
});

const stepSchema = z.object({
  checks: z.array(z.string()),
  input: z.record(z.string(), z.unknown()),
  ms: z.number(),
  // A page the merchant sees in the browser (the confirm page), as HTML.
  page: z.string().optional(),
  result: toolResultSchema.optional(),
  say: z.string(),
  title: z.string(),
  tool: z.string(),
  widget: z.enum(widgetNames).optional(),
});
export type Step = z.infer<typeof stepSchema>;

const journeySchema = z.object({
  live: z.array(z.string()),
  replies: z.record(z.string(), toolResultSchema),
  startedAt: z.string(),
  steps: z.array(stepSchema),
});
export type Journey = z.infer<typeof journeySchema>;

export const readJourney = async () =>
  journeySchema.parse(
    JSON.parse(await readFile(path.join(reportDir, "journey.json"), "utf-8"))
  );

// Where each step's screenshot lands, relative to the report.
export const shotOf = (index: number) =>
  `shots/${String(index + 1).padStart(2, "0")}.png`;
