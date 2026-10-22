import type { McpServer } from "@modelcontextprotocol/server";
import { designBriefSchema, judgeResultSchema } from "@wovain/shared/judge";

import type { DesignJudge } from "../lib/design-judge.ts";
import { notConfigured, text, userSafe } from "../lib/tool-result.ts";

// judge_design: wovain's own model call (Genkit, Nemotron on Nebius). Without
// a Nebius key the judge is undefined and the tool says to skip the check.
export const registerJudgeTools = (
  server: McpServer,
  judge: DesignJudge | undefined
) => {
  server.registerTool(
    "judge_design",
    {
      annotations: {
        destructiveHint: false,
        openWorldHint: true,
        readOnlyHint: true,
      },
      description:
        "Check a design before show_design_widget: NVIDIA Nemotron scores the brief against the print and listing rules and returns a verdict, one check per rule, fixes and a coach line. Pass the blank, placement, colors, artwork, listing and coach you'll show, plus a one-line artworkDescription. Returns configured: false when wovain has no Nebius key; then skip the check.",
      inputSchema: designBriefSchema,
      outputSchema: judgeResultSchema,
      title: "Check a design",
    },
    async (brief) => {
      if (judge === undefined) {
        return notConfigured(
          "The design check isn't set up (NEBIUS_API_KEY). Skip it and show the widget."
        );
      }
      const judgment = await userSafe(
        "judge_design failed:",
        "The design check failed; show the widget without it.",
        async () => await judge(brief)
      );
      return {
        content: text(JSON.stringify(judgment)),
        structuredContent: { configured: true, judgment },
      };
    }
  );
};
