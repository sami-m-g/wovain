import { adAccountFor } from "@wovain/core/ads";
import { findSalesPixel } from "@wovain/core/media-buying";
import { readShopFacts } from "@wovain/core/store";
import {
  CONFIRMABLE_STEPS,
  evaluateSetup,
  pixelOnShop,
  readDomain,
} from "@wovain/core/store-setup";
import type {
  ConfirmableStep,
  DomainFacts,
  PixelFacts,
} from "@wovain/core/store-setup";
import { DecisionTrace } from "@wovain/core/trace";
import { log } from "evlog";

import type { Actor } from "./actor";
import { approvalsFor, traceSinkFor } from "./approvals";
import { listConnections, withProvider } from "./connections";
import { graphDatasetFor, isPixelAutomationOn } from "./pixel-setup";
import { requestSiteLive } from "./store";

// Store setup (openspec store-management): the tech checklist that takes
// the connected Fourthwall shop to sell-ready. Reads are polled by the page
// so a step the merchant finishes in Fourthwall ticks off by itself; the
// steps wovain can do go through the approval queue, and each is recorded
// in the decision trace (agent store_setup).

const AGENT = "store_setup";

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

// A part of the checklist that couldn't be read: logged at error level,
// and the step shows as unknown instead of failing the whole checklist.
const optional = async <T>(
  actor: Actor,
  part: string,
  read: () => Promise<T>
): Promise<T | undefined> => {
  try {
    return await read();
  } catch (error) {
    log.error({
      error: {
        message: `Store setup couldn't read ${part}: ${messageOf(error)}`,
        name: "StoreSetupReadFailed",
      },
      storeSetup: { part },
      userId: actor.userId,
    });
    return undefined;
  }
};

// With pixel automation on, an account with several datasets uses the one
// wovain picks (openspec pixel-automation), as set-up did.
const readPixel = async (
  actor: Actor,
  hosts: string[],
  automation: boolean
): Promise<PixelFacts | undefined> =>
  await withProvider(actor, "meta", async (call, accessToken) => {
    const adAccountId = await adAccountFor(call, "store-setup");
    const datasetId =
      (await findSalesPixel(call, adAccountId)) ??
      (automation
        ? await graphDatasetFor(actor, await accessToken(), adAccountId)
        : undefined);
    if (datasetId === undefined) {
      return;
    }
    return await pixelOnShop(call, { datasetId, hosts });
  });

// How many store approvals are read back for the merchant's confirmations.
const CONFIRM_LOOKBACK = 200;
const CONFIRM_STATUSES = ["approved", "executing", "done"] as const;

// The steps the merchant marked done (store.setup.confirm) that weren't
// undone or refused.
const confirmedSteps = async (actor: Actor): Promise<ConfirmableStep[]> => {
  const approvals = await approvalsFor(actor).list({
    domain: "store",
    limit: CONFIRM_LOOKBACK,
    statuses: CONFIRM_STATUSES,
    userId: actor.userId,
  });
  return CONFIRMABLE_STEPS.filter((step) =>
    approvals.some(
      (each) =>
        each.actionType === "store.setup.confirm" && each.payload.step === step
    )
  );
};

export const storeSetup = async (actor: Actor) => {
  const connections = await listConnections(actor);
  const metaConnected = connections.some(
    (each) => each.provider === "meta" && !each.needsReconnect
  );
  const { domain, shop } = await withProvider(
    actor,
    "fourthwall",
    async (call) => {
      const [facts, dns] = await Promise.all([
        readShopFacts(call),
        optional<DomainFacts>(
          actor,
          "the custom domain",
          async () => await readDomain(call)
        ),
      ]);
      return { domain: dns, shop: facts };
    }
  );
  const pixelAutomation = metaConnected && (await isPixelAutomationOn(actor));
  const pixel = metaConnected
    ? await optional(
        actor,
        "the Meta pixel",
        async () => await readPixel(actor, shop.hosts, pixelAutomation)
      )
    : undefined;
  const confirmed = await confirmedSteps(actor);
  const steps = evaluateSetup({
    confirmed,
    domain,
    metaConnected,
    pixel,
    shop,
  });
  return {
    domain: domain ?? null,
    metaConnected,
    pixel: pixel ?? null,
    // wovain can find or create the dataset and send a test event.
    pixelAutomation,
    shop: {
      baseUrl: shop.baseUrl ?? null,
      hosts: shop.hosts,
      name: shop.name ?? null,
      // INACTIVE (not started) or IN_PROGRESS (Stripe still needs details).
      payoutStatus: shop.payoutStatus ?? null,
      siteStatus: shop.siteStatus ?? null,
    },
    steps,
  };
};

// "Do it for me": the steps wovain performs, each through the approval
// queue and recorded in the decision trace. Only taking the shop live can
// be done through Fourthwall's MCP today; the rest are deep links.
export const doSetupStep = async (actor: Actor, step: "site_live") => {
  const trace = new DecisionTrace(
    { userId: actor.userId },
    traceSinkFor(actor)
  );
  try {
    const approval = await requestSiteLive(actor);
    trace.add({
      agent: AGENT,
      inputSummary: "The merchant asked wovain to take the shop live.",
      output: { approvalId: approval.id, status: approval.status },
      sources: [{ provider: "fourthwall", title: "update-shop-site-status" }],
      step,
    });
    return approval;
  } catch (error) {
    trace.add({
      agent: AGENT,
      inputSummary: "The merchant asked wovain to take the shop live.",
      ok: false,
      output: { error: messageOf(error) },
      step,
    });
    throw error;
  } finally {
    await trace.flush().catch((error: unknown) => {
      log.error({
        error: {
          message: `Store setup trace not saved: ${messageOf(error)}`,
          name: "DecisionTraceNotSaved",
        },
        userId: actor.userId,
      });
    });
  }
};
