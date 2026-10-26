import { getAuthResultMessage, parseAuthResult } from "@better-auth-ui/core";
import { expect, it } from "vitest";

import { routing } from "@/i18n/routing";
import { authLocaleFor } from "@/lib/auth-locale";

// The page Google sends a merchant to when Better Auth won't join Google to
// their existing account (/auth-error?error=account_not_linked).
it.each(routing.locales)(
  "tells a %s merchant to sign in with their password, then connect Google",
  (locale) => {
    const { localization } = authLocaleFor(locale);
    const message = getAuthResultMessage(
      parseAuthResult("?error=account_not_linked", "danger"),
      localization
    );
    expect(message.title).toBe(
      localization.auth.callbackAccountLinkConflictTitle
    );
    expect(message.description).toContain("Google");
    expect(message.description).not.toContain("different user");
  }
);
