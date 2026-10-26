import type { FlagContext } from "@wovain/core/flags";
import { user } from "@wovain/db/schema/auth";
import { eq } from "drizzle-orm";

import type { Actor } from "./actor";

// Who a flag is evaluated for, derived on the server: the merchant's user
// ID and plan, and whether they're on the team (the WOVAIN_ALLOWED_EMAILS
// allowlist, core.team), which GitLab's `internal-only`
// list matches (packages/core/src/flags.ts).
export const flagContextOf = async (actor: Actor): Promise<FlagContext> => {
  const [merchant] = await actor.db
    .select({ email: user.email, emailVerified: user.emailVerified })
    .from(user)
    .where(eq(user.id, actor.userId));
  return {
    internal:
      merchant !== undefined &&
      // Only a verified address proves the merchant owns a team email.
      merchant.emailVerified &&
      actor.core.team.has(merchant.email.trim().toLowerCase()),
    plan: actor.plan,
    userId: actor.userId,
  };
};
