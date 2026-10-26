import type { FlagContext } from "@wovain/core/flags";

import type { Actor } from "./actor";

// Who a flag is evaluated for, derived on the server: the merchant's user
// ID, which GitLab's user lists (team members on `internal-only`) and
// "Percent of users" match, and plan.
export const flagContextOf = (actor: Actor): FlagContext => ({
  plan: actor.plan,
  userId: actor.userId,
});
