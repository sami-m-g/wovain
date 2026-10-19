import { z } from "zod";

// In-progress edits and open sections, kept with the message by the host.
export const widgetSchema = z.object({
  draft: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
  open: z.array(z.string()),
});

export type WidgetState = z.infer<typeof widgetSchema>;
export type Draft = Record<string, Record<string, unknown>>;
