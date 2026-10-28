import type { RouterClient } from "@orpc/server";

import { publicProcedure } from "../index";
import { approvalsRouter, autonomyRouter } from "./approvals";
import { targetingRouter } from "./audiences";
import { autopilotRouter } from "./autopilot";
import { billingRouter } from "./billing";
import { connectionsRouter } from "./connections";
import { insightsRouter } from "./insights";
import { modelsRouter } from "./models";
import { onboardingRouter } from "./onboarding";
import { mediaCampaignsRouter } from "./media";
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
  healthCheck: publicProcedure.handler(() => "OK"),
  ideas: ideasRouter,
  insights: insightsRouter,
  models: modelsRouter,
  onboarding: onboardingRouter,
  products: productsRouter,
  runs: runsRouter,
  targeting: targetingRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
