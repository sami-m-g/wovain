import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { artPieceSchema, artRequest } from "../lib/art-plan.ts";
import { upstreamReply } from "../lib/upstream.ts";
import type { Upstream } from "../lib/upstream.ts";
import type { Store } from "../store.ts";

// A drop's art, one piece per placement, on the merchant's own fal account.
export const registerArtTools = (
  server: McpServer,
  store: Store,
  upstream: Upstream | undefined
) => {
  server.registerTool(
    "generate_art",
    {
      annotations: {
        destructiveHint: false,
        openWorldHint: true,
        readOnlyHint: false,
      },
      description:
        "Generate a drop's print art on the merchant's own fal account (fal submit_jobs), one job per piece: the hero print, a back print, a sleeve mark, a pocket-size logo, a mug wrap. Each comes back as a transparent PNG at print size: square 2880 px, portrait 2400×3200, wide 3840×1920. Pass referenceUrls (earlier art from this drop) so marks and variants match the hero. Spends the merchant's fal credits: check with the fal tool's estimate_cost and say the total first. Returns job handles; wait with the fal tool's wait_for_jobs, then stage each result with stage_artwork. If the merchant hasn't connected fal, the result has needsConnection and a link to show them.",
      inputSchema: z.object({
        pieces: z.array(artPieceSchema).min(1).max(8),
      }),
      title: "Generate drop art",
    },
    async ({ pieces }) =>
      await upstreamReply(upstream, {
        args: {
          requests: pieces.map((piece, index) => ({
            ...artRequest(piece),
            index,
          })),
        },
        id: "fal",
        tool: "submit_jobs",
        userId: store.userId,
      })
  );
};
