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

// The verify-email screen a merchant sees after an email sign-up, or after
// signing in before confirming their email.
const VERIFY_EMAIL_KEYS = [
  "checkYourEmail",
  "resend",
  "resendIn",
  "verificationEmailSent",
] as const;

it.each(routing.locales.filter((locale) => locale !== "en"))(
  "gives a %s merchant the verify-email screen in their language",
  (locale) => {
    const { auth } = authLocaleFor(locale).localization;
    const { auth: english } = authLocaleFor("en").localization;
    for (const key of VERIFY_EMAIL_KEYS) {
      expect(auth[key]).not.toBe(english[key]);
    }
  }
);
