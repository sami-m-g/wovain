"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { getPathname } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";

/** Google's "G" mark, in its brand colors (the buttons keep it on any theme). */
const GoogleMark = () => (
  <svg
    aria-hidden="true"
    className="size-5 shrink-0"
    focusable="false"
    viewBox="0 0 48 48"
  >
    <path
      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      fill="#EA4335"
    />
    <path
      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      fill="#4285F4"
    />
    <path
      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      fill="#FBBC05"
    />
    <path
      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      fill="#34A853"
    />
  </svg>
);

interface GoogleButtonProps {
  /** Where an existing merchant lands after signing in. */
  next: string;
  /** Shows the error above the form. */
  onError: (message: string) => void;
}

/**
 * "Continue with Google", styled to Google's branding guidelines: the
 * light (white) and dark themes, the multicolor G, a 40px minimum height and
 * Roboto Medium 14px. oauthProviderClient adds the signed oauth_query to the
 * request, so a pending ChatGPT authorization resumes after the Google
 * round-trip.
 */
export const GoogleButton = ({ next, onError }: GoogleButtonProps) => {
  const t = useTranslations("Auth");
  const locale = useLocale();
  const [pending, setPending] = useState(false);

  const start = async () => {
    setPending(true);
    const { error } = await authClient.signIn.social({
      callbackURL: getPathname({ href: next, locale }),
      errorCallbackURL: getPathname({ href: "/login", locale }),
      newUserCallbackURL: getPathname({
        href: "/dashboard/connections",
        locale,
      }),
      provider: "google",
    });
    // On success the browser is already leaving for Google.
    if (error) {
      setPending(false);
      onError(t("googleError"));
    }
  };

  return (
    <button
      className="flex h-11 w-full items-center justify-center gap-2.5 rounded-md border border-[#747775] bg-white px-3 font-[Roboto,Arial,sans-serif] text-sm font-medium text-[#1f1f1f] transition-colors hover:bg-[#f0f1f1] focus-visible:ring-3 focus-visible:ring-[#4285f4]/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-[#8e918f] dark:bg-[#131314] dark:text-[#e3e3e3] dark:hover:bg-[#232324]"
      disabled={pending}
      onClick={start}
      type="button"
    >
      <GoogleMark />
      {t("google")}
    </button>
  );
};
