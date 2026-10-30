import { adAccountFor } from "@wovain/core/ads";
import {
  chooseDataset,
  datasetNameFor,
  newTestEventCode,
} from "@wovain/core/pixel-setup";
import { readShopFacts } from "@wovain/core/store";
import { auditEvent } from "@wovain/db/schema/autonomy";
import { createError } from "evlog";

import type { Actor } from "./actor";
import { withProvider } from "./connections";
import { flagContextOf } from "./flags";

// Pixel automation (openspec pixel-automation): with the merchant's single
// Meta grant, wovain finds the ad account's dataset or creates one, shares
// it with the ad account, and sends a Conversions API test event. Pasting
// the ID into Fourthwall stays the merchant's step (Fourthwall has no API
// for it); the store checklist ticks off when Meta reports events from the
// shop's domain. Behind the meta-pixel-automation flag.

export const isPixelAutomationOn = async (actor: Actor) =>
  await actor.core.flags.isOn("meta-pixel-automation", flagContextOf(actor));

const pixelAutomationOff = () =>
  createError({
    fix: "Turn on the meta-pixel-automation flag for this environment.",
    message: "Pixel set-up isn't available yet",
    status: 404,
    why: "The meta-pixel-automation flag is off.",
  });

/**
 * The dataset the shop should use, through Graph: the one chooseDataset
 * picks among those the ad account can use. Undefined when it has none.
 */
export const graphDatasetFor = async (
  actor: Actor,
  token: string,
  adAccountId: string
) =>
  chooseDataset(
    await actor.core.metaGraph.datasets(token, adAccountId, actor.log)
  )?.id;

export interface PixelSetupResult {
  // wovain created the dataset (and shared it with the ad account).
  created: boolean;
  datasetId: string;
  // The test event, or null when the shop has no address to send it from.
  testEvent: { code: string; received: number } | null;
}

export const setupPixel = async (actor: Actor): Promise<PixelSetupResult> => {
  if (!(await isPixelAutomationOn(actor))) {
    throw pixelAutomationOff();
  }
  const shop = await withProvider(
    actor,
    "fourthwall",
    async (call) => await readShopFacts(call)
  );
  const result = await withProvider(
    actor,
    "meta",
    async (call, accessToken) => {
      const adAccountId = await adAccountFor(call, "pixel-setup");
      const token = await accessToken();
      const graph = actor.core.metaGraph;
      const found = await graphDatasetFor(actor, token, adAccountId);
      let datasetId = found;
      if (datasetId === undefined) {
        const made = await graph.createDataset(
          token,
          adAccountId,
          datasetNameFor(shop.name),
          actor.log
        );
        datasetId = made.id;
      }
      if (shop.baseUrl === undefined) {
        return { created: found === undefined, datasetId, testEvent: null };
      }
      const code = newTestEventCode();
      const received = await graph.sendTestEvent(
        token,
        datasetId,
        { sourceUrl: shop.baseUrl, testEventCode: code },
        actor.log
      );
      return {
        created: found === undefined,
        datasetId,
        testEvent: { code, received },
      };
    }
  );
  await actor.db.insert(auditEvent).values({
    actor: actor.userId,
    after: { ...result },
    approvalId: null,
    before: null,
    event: "settings_changed",
    note: result.created ? "Meta dataset created" : "Meta dataset found",
    userId: actor.userId,
  });
  return result;
};
