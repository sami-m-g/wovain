import {
  pickBlank,
  previewDesign,
  uploadArtwork,
} from "@wovain/core/fourthwall";
import { connection, design } from "@wovain/db/schema/seller";
import { and, eq } from "drizzle-orm";
import { log } from "evlog";

import type { Actor } from "./actor";
import { withProvider } from "./connections";
import { once } from "./once";
import { previewKey, variantsFor } from "./variants";

// Fourthwall's placement preview of a design: the art on the blank its
// product will use (the same pick as ./products), so the merchant approves
// what the shop will sell. A preview that fails never fails the design: it is
// logged at error level and the card shows the flat art with a notice.

type DesignRow = typeof design.$inferSelect;

// A shop to render on: connected, with a grant that still works. Without
// one there is nothing to log; the card asks the merchant to connect.
const hasFourthwall = async ({ db, userId }: Actor) => {
  const [row] = await db
    .select({ needsReconnect: connection.needsReconnect })
    .from(connection)
    .where(
      and(eq(connection.userId, userId), eq(connection.provider, "fourthwall"))
    );
  return row !== undefined && !row.needsReconnect;
};

// Uploads the art and renders it on the blank's front print. Each write is
// keyed on the design, so a retried step uploads and renders once.
const renderMockups = async (actor: Actor, row: DesignRow) =>
  await withProvider(actor, "fourthwall", async (call) => {
    const key = `placement:${row.id}`;
    const write = { provider: "fourthwall" as const, runId: row.runId };
    const blank = await pickBlank(call, {
      defaultProductId: actor.core.defaultCatalogProductId,
    });
    const mediaUri = await once(actor, {
      ...write,
      key: `${key}:media`,
      operation: "upload_artwork",
      perform: async () =>
        await uploadArtwork(call, {
          height: row.artworkHeight,
          url: row.artworkUrl,
          width: row.artworkWidth,
        }),
    });
    const variants = await variantsFor(actor, call, {
      garmentColors: row.brief.garmentColors,
      slug: blank.slug,
    });
    const preview = await once(actor, {
      ...write,
      key: previewKey(`${key}:preview:${blank.id}`, variants),
      operation: "preview_design",
      perform: async () =>
        await previewDesign(call, {
          catalogProductId: blank.id,
          mediaUri,
          region: blank.region,
          ...variants,
        }),
    });
    if (preview.mockups.length === 0) {
      throw new Error("Fourthwall's design preview returned no mockups");
    }
    return preview.mockups;
  });

const save = async (
  actor: Actor,
  row: DesignRow,
  patch: Pick<DesignRow, "mockupStatus" | "mockups">
) => {
  const [saved] = await actor.db
    .update(design)
    .set(patch)
    .where(and(eq(design.id, row.id), eq(design.userId, actor.userId)))
    .returning();
  return saved ?? { ...row, ...patch };
};

// Renders the design's placement preview once; a design that has one (or
// whose preview already failed) comes back as it is.
export const previewPlacement = async (
  actor: Actor,
  row: DesignRow
): Promise<DesignRow> => {
  if (row.mockupStatus === "ready" || row.mockupStatus === "failed") {
    return row;
  }
  if (!(await hasFourthwall(actor))) {
    return await save(actor, row, {
      mockupStatus: "not_connected",
      mockups: [],
    });
  }
  try {
    const mockups = await renderMockups(actor, row);
    return await save(actor, row, { mockupStatus: "ready", mockups });
  } catch (error) {
    log.error({
      design: { id: row.id, run_id: row.runId },
      error: {
        code: "PLACEMENT_PREVIEW_FAILED",
        message: `Fourthwall placement preview failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        name: "PlacementPreviewFailed",
        ...(error instanceof Error && error.stack !== undefined
          ? { stack: error.stack }
          : {}),
      },
      userId: actor.userId,
    });
    return await save(actor, row, { mockupStatus: "failed", mockups: [] });
  }
};
