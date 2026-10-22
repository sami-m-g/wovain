import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import {
  ART_USD_PER_PIECE,
  artPieceSchema,
  artRequest,
} from "../lib/art-plan.ts";
import type { ArtPiece } from "../lib/art-plan.ts";
import { chargeRun, isRunning, recordArt } from "../lib/autopilot.ts";
import { jobHandles } from "../lib/fal-media.ts";
import { upstreamReply } from "../lib/upstream.ts";
import type { Upstream } from "../lib/upstream.ts";
import type { Store } from "../store.ts";

// A drop's art, one piece per placement, on the merchant's own fal account.
// During an autopilot run, the request counts against the run's cap first,
// every piece must declare its printed words, and each piece is its own job
// so the run records which words each image should carry.
export const registerArtTools = (
  server: McpServer,
  store: Store,
  {
    autopilotOn,
    upstream,
  }: { autopilotOn: boolean; upstream?: Upstream | undefined }
) => {
  const submit = async (pieces: ArtPiece[]) =>
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
    });

  const submitInRun = async (pieces: ArtPiece[]) => {
    const replies = await Promise.all(
      pieces.map(async (piece) => ({ piece, reply: await submit([piece]) }))
    );
    const stopped = replies.find(
      ({ reply }) =>
        ("isError" in reply && reply.isError) || jobHandles(reply).length === 0
    );
    const jobs = replies.flatMap(({ piece, reply }) =>
      jobHandles(reply).map((job) => ({ ...job, text: piece.text ?? [] }))
    );
    await recordArt(store, (art) => [...art, ...jobs]);
    return (
      stopped?.reply ?? {
        content: replies.flatMap(({ reply }) => reply.content),
      }
    );
  };

  server.registerTool(
    "generate_art",
    {
      annotations: {
        destructiveHint: false,
        openWorldHint: true,
        readOnlyHint: false,
      },
      description:
        "Generate a drop's print art on the merchant's own fal account (fal submit_jobs), one job per piece: the hero print, a back print, a sleeve mark, a pocket-size logo, a mug wrap. Each comes back as a transparent PNG at print size: square 2880 px, portrait 2400×3200, wide 3840×1920. Pass referenceUrls (earlier art from this drop) so marks and variants match the hero, and text with every word a piece prints ([] for none; required in autopilot). Spends the merchant's fal credits: check with the fal tool's estimate_cost and say the total first. Returns job handles; wait with the fal tool's wait_for_jobs, then stage each result with stage_artwork. If the merchant hasn't connected fal, the result has needsConnection and a link to show them.",
      inputSchema: z.object({
        pieces: z.array(artPieceSchema).min(1).max(8),
      }),
      title: "Generate drop art",
    },
    async ({ pieces }) => {
      await chargeRun(store, {
        declared: pieces.every((piece) => piece.text !== undefined),
        on: autopilotOn,
        usd: pieces.length * ART_USD_PER_PIECE,
        what: "art",
      });
      return (await isRunning(store))
        ? await submitInRun(pieces)
        : await submit(pieces);
    }
  );
};
