import type { RouterClient } from "@orpc/server";

import { publicProcedure } from "../index";
import { approvalsRouter, autonomyRouter } from "./approvals";
import { targetingRouter } from "./audiences";
import { autopilotRouter } from "./autopilot";
import { billingRouter } from "./billing";
import { connectionsRouter } from "./connections";
import { dropsRouter } from "./drops";
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
import { storeRouter } from "./store";
import { voiceRouter } from "./voice";

export const appRouter = {
  approvals: approvalsRouter,
  autonomy: autonomyRouter,
  autopilot: autopilotRouter,
  billing: billingRouter,
  campaigns: { ...campaignsRouter, ...mediaCampaignsRouter },
  connections: connectionsRouter,
  designs: designsRouter,
  drops: dropsRouter,
  feedback: feedbackRouter,
  healthCheck: publicProcedure.handler(() => "OK"),
  ideas: ideasRouter,
  insights: insightsRouter,
  models: modelsRouter,
  onboarding: onboardingRouter,
  products: productsRouter,
  runs: runsRouter,
  store: storeRouter,
  targeting: targetingRouter,
  voice: voiceRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
