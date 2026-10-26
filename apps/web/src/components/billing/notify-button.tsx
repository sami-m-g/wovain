"use client";

import type { Offer } from "@wovain/billing/plans";
import { Button } from "@wovain/ui/components/button";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { posthog } from "posthog-js";
import { useState } from "react";

export type InterestSurface = "billing" | "paywall" | "pricing";

/**
 * While only Free is on sale, a paid offer shows this instead of a checkout:
 * it records `paid_plan_interest` in PostHog (no email, no form) so we know
 * which offer to open first, then says thanks in place.
 */
export const NotifyButton = ({
  offer,
  surface,
}: {
  offer: Offer;
  surface: InterestSurface;
}) => {
  const t = useTranslations("Billing.notify");
  const [noted, setNoted] = useState(false);

  return (
    <div aria-live="polite" className="flex items-center">
      {noted ? (
        <p className="text-muted-foreground inline-flex min-h-11 items-center gap-1.5 text-sm sm:min-h-9">
          <Check aria-hidden="true" className="size-4" />
          {t("thanks")}
        </p>
      ) : (
        <Button
          className="h-11 rounded-lg px-4 sm:h-9"
          onClick={() => {
            posthog.capture("paid_plan_interest", { offer, surface });
            setNoted(true);
          }}
          variant="outline"
        >
          {t("button")}
        </Button>
      )}
    </div>
  );
};

/** The badge on an offer that isn't on sale yet. */
export const ComingSoonBadge = () => {
  const t = useTranslations("Billing.notify");
  return (
    <span className="bg-muted rounded-full px-2 py-0.5 text-xs font-medium">
      {t("comingSoon")}
    </span>
  );
};
