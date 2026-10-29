import { EVENTS, eventSchemas } from "@wovain/core/events";
import { log } from "evlog";
import type { Inngest } from "inngest";
import { z } from "zod";

import { refreshDirections } from "../flow/drop-directions";
import type { RunServices } from "./run";

// The new-drop suggestions, found again in the background (openspec
// drop-directions): a stale or missing kept answer sends
// wovain/directions.refresh, and this keeps the new one, so the step opens
// at once next time. One refresh per merchant at a time; a burst of the
// same request runs once. A refresh that fails after its retries is logged
// at error level; the merchant still sees the kept answer.

const RETRIES = 2;
// Several refreshes for the same request within this window run once.
const DEBOUNCE = "30s";

const failedRefresh = z.object({
  event: z.object({ data: eventSchemas[EVENTS.directionsRefresh] }),
});

export const createDirectionFunctions = (
  inngest: Inngest,
  services: RunServices
) => {
  const refresh = inngest.createFunction(
    {
      concurrency: { key: "event.data.userId", limit: 1 },
      debounce: {
        key: "event.data.userId + '-' + string(event.data.round) + '-' + string(event.data.ignoreBrand)",
        period: DEBOUNCE,
      },
      id: "directions-refresh",
      onFailure: ({ error, event }) => {
        const failed = failedRefresh.safeParse(event.data);
        log.error({
          directions: {
            user_id: failed.success ? failed.data.event.data.userId : null,
          },
          error: {
            code: "DIRECTIONS_REFRESH_FAILED",
            message: error.message,
            name: "DirectionsRefreshError",
            ...(error.stack === undefined ? {} : { stack: error.stack }),
          },
        });
      },
      retries: RETRIES,
      triggers: { event: EVENTS.directionsRefresh },
    },
    async ({ event, step }) => {
      const { ignoreBrand, round, userId } = eventSchemas[
        EVENTS.directionsRefresh
      ].parse(event.data);
      await step.run("find", async () => {
        await refreshDirections(
          { ...services, userId },
          { ignoreBrand, round }
        );
      });
      return { refreshed: true };
    }
  );
  return [refresh];
};
