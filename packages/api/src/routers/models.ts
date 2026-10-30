import { modelTrace } from "@wovain/mastra/flow/model-trace";
import { z } from "zod";

import { protectedProcedure } from "../index";

// Which Nemotron model did what in a run (openspec model-routing), behind
// the model-routing flag.
export const modelsRouter = {
  trace: protectedProcedure
    .input(z.object({ runId: z.string().min(1).optional() }))
    .handler(
      async ({ context, input }) => await modelTrace(context, input.runId)
    ),
};
