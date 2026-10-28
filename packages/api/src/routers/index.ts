import type { RouterClient } from "@orpc/server";

import { publicProcedure } from "../index";
import { approvalsRouter, autonomyRouter } from "./approvals";
import { targetingRouter } from "./audiences";
import { autopilotRouter } from "./autopilot";
import { billingRouter } from "./billing";
import { connectionsRouter } from "./connections";
import { devicesRouter, inboxRouter } from "./devices";
import { feedbackRouter } from "./feedback";
import { insightsRouter } from "./insights";
import { mediaCampaignsRouter } from "./media";
import { modelsRouter } from "./models";
import { onboardingRouter } from "./onboarding";
import {
  campaignsRouter,
  designsRouter,
  ideasRouter,
  productsRouter,
  runsRouter,
} from "./seller";

export const appRouter = {
  approvals: approvalsRouter,
  autonomy: autonomyRouter,
  autopilot: autopilotRouter,
  billing: billingRouter,
  campaigns: { ...campaignsRouter, ...mediaCampaignsRouter },
  connections: connectionsRouter,
  designs: designsRouter,
  devices: devicesRouter,
  feedback: feedbackRouter,
  healthCheck: publicProcedure.handler(() => "OK"),
  ideas: ideasRouter,
  inbox: inboxRouter,
  insights: insightsRouter,
  models: modelsRouter,
  onboarding: onboardingRouter,
  products: productsRouter,
  runs: runsRouter,
  targeting: targetingRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
