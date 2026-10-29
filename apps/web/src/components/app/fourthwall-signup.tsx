"use client";

import { cn } from "@wovain/ui/lib/utils";
import { useTranslations } from "next-intl";
import { posthog } from "posthog-js";

export type SignupSurface = "connect_state" | "connections" | "onboarding";

// Fourthwall's own sign-up: the shop is created there, not in wovain.
const FOURTHWALL_SIGNUP_URL = "https://fourthwall.com/get-started";

/**
 * For a merchant with no Fourthwall shop yet: one short line, a quiet link to
 * Fourthwall's sign-up (a new tab) and a hint to come back and connect. A
 * secondary path, never a second call to action. Records
 * `fourthwall_signup_clicked` with the surface.
 */
export const FourthwallSignup = ({
  surface,
  className,
}: {
  surface: SignupSurface;
  className?: string;
}) => {
  const t = useTranslations("Connections.signup");
  return (
    <p
      className={cn(
        "text-muted-foreground max-w-prose text-center text-xs",
        className
      )}
    >
      {t("prompt")}{" "}
      <a
        className="text-foreground underline underline-offset-4"
        href={FOURTHWALL_SIGNUP_URL}
        onClick={() =>
          posthog.capture("fourthwall_signup_clicked", { surface })
        }
        rel="noopener noreferrer"
        target="_blank"
      >
        {t("link")}
      </a>
      {". "}
      {t("hint")}
    </p>
  );
};
