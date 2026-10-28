import { randomUUID } from "node:crypto";

import type { StyleFamily } from "@wovain/core/drops";
import { z } from "zod";

import {
  dropItems,
  dropStateOf,
  getDrop,
  itemStateOf,
  regionsOf,
  listDrops,
  planDrop,
  publishDrop,
  requireDesignDrops,
} from "../flow/drops";
import { protectedProcedure } from "../index";

// Drops (openspec design-drops), behind the design-drops flag: plan a
// capsule from an idea, watch it build, and ask to publish it.

export const dropsRouter = {
  get: protectedProcedure
    .input(z.object({ dropId: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      await requireDesignDrops(context);
      const [row, items] = await Promise.all([
        getDrop(context, input.dropId),
        dropItems(context, input.dropId),
      ]);
      const state = dropStateOf(row);
      return {
        drop: {
          checks: state.checks ?? [],
          collectionSlug: state.collectionSlug,
          createdAt: row.createdAt,
          description: state.brief.description,
          id: row.id,
          matched: state.matched,
          name: row.name,
          palette: row.palette,
          qlooTags: row.qlooTags,
          skipped: state.skipped,
          status: row.status,
          styleFamily: (row.styleFamily ?? "streetwear") as StyleFamily,
        },
        items: items.map((item) => ({
          ...itemStateOf(item),
          colors: item.colors,
          id: item.id,
          placements: regionsOf(item).map(([region, piece]) => ({
            ...piece,
            region,
          })),
          position: item.position,
          priceCents: item.priceCents,
          status: item.status,
        })),
      };
    }),
  list: protectedProcedure.handler(async ({ context }) => {
    await requireDesignDrops(context);
    const rows = await listDrops(context);
    return rows.map((row) => ({
      createdAt: row.createdAt,
      id: row.id,
      name: row.name,
      palette: row.palette,
      status: row.status,
      styleFamily: (row.styleFamily ?? "streetwear") as StyleFamily,
    }));
  }),
  plan: protectedProcedure
    .input(
      z.object({
        ideaId: z.string().min(1),
        // The caller's ID for this request: a retry gets the same drop.
        requestId: z.string().min(1).max(100).optional(),
      })
    )
    .handler(
      async ({ context, input }) =>
        await planDrop(context, {
          ideaId: input.ideaId,
          requestId: input.requestId ?? randomUUID(),
        })
    ),
  publish: protectedProcedure
    .input(z.object({ dropId: z.string().min(1) }))
    .handler(
      async ({ context, input }) => await publishDrop(context, input.dropId)
    ),
};
