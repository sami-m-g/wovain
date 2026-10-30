import { EVENTS, eventSchemas } from "@wovain/core/events";
import type { Inngest } from "inngest";
import { NonRetriableError } from "inngest";

import type { Actor } from "../flow/actor";
import { createDropCampaign, failCampaignStaging } from "../flow/campaigns";
import type { RunServices } from "./run";

// "Make the ads" (../flow/campaigns requestDropCampaign) on Inngest. The
// staging is one step: each Meta write in it is keyed (../flow/once), so a
// retry, after a crash or a step cut off by Cloud Run's request timeout
// while Meta processes a video, resumes where it stopped and never makes a
// second campaign. One staging per campaign key runs at a time. A refusal
// (a 4xx: Meta setup, Qloo, a product not live) isn't retried; once the
// retries are spent the failure is kept for the page and logged.

const RETRIES = 3;
const CLIENT_ERROR = 400;
const SERVER_ERROR = 500;

const isRefusal = (error: unknown) => {
  const { status } = (error ?? {}) as { status?: unknown };
  return (
    typeof status === "number" &&
    status >= CLIENT_ERROR &&
    status < SERVER_ERROR
  );
};

export const createCampaignFunctions = (
  inngest: Inngest,
  services: RunServices
) => [
  inngest.createFunction(
    {
      concurrency: { key: "event.data.key", limit: 1 },
      id: "campaign-stage",
      onFailure: async ({ error, event }) => {
        const parsed = eventSchemas[EVENTS.campaignStage].safeParse(
          event.data.event.data
        );
        if (!parsed.success) {
          return;
        }
        const { key, userId } = parsed.data;
        // A refusal was kept by the step with its code; this keeps a crash
        // or a timeout.
        await failCampaignStaging({ ...services, userId }, key, error);
      },
      retries: RETRIES,
      triggers: { event: EVENTS.campaignStage },
    },
    async ({ event, step }) => {
      const parsed = eventSchemas[EVENTS.campaignStage].safeParse(event.data);
      if (!parsed.success) {
        throw new NonRetriableError("A campaign event without its input");
      }
      const { input, key, userId } = parsed.data;
      const actor: Actor = { ...services, userId };
      return await step.run("stage", async () => {
        try {
          const staged = await createDropCampaign(actor, input);
          return { campaignId: staged.id };
        } catch (error) {
          if (isRefusal(error)) {
            await failCampaignStaging(actor, key, error);
            throw new NonRetriableError(
              error instanceof Error ? error.message : String(error),
              { cause: error }
            );
          }
          throw error;
        }
      });
    }
  ),
];
