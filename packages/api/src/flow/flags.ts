import type { FlagContext } from "@wovain/core/flags";
import { isAllowlisted } from "@wovain/core/spend";
import { user } from "@wovain/db/schema/auth";
import { eq } from "drizzle-orm";

import type { Actor } from "./actor";

// Who a flag is evaluated for, derived on the server: the merchant's user
// ID and plan, and whether they're on the team (the WOVAIN_ALLOWED_EMAILS
// allowlist, the same one spend limits use), which GitLab's `internal-only`
// list matches (packages/core/src/flags.ts).
export const flagContextOf = async (actor: Actor): Promise<FlagContext> => {
  const [merchant] = await actor.db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, actor.userId));
  return {
    internal:
      merchant !== undefined && isAllowlisted(actor.core.spend, merchant.email),
    plan: actor.plan,
    userId: actor.userId,
  };
};
