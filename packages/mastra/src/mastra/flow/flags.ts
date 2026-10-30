import type { FlagContext } from "@wovain/core/flags";

import type { Actor } from "./actor";

// Who a flag is evaluated for, derived on the server: the merchant's user
// ID, which PostHog's team condition and percentages match, and plan.
export const flagContextOf = (actor: Actor): FlagContext => ({
  plan: actor.plan,
  userId: actor.userId,
});
