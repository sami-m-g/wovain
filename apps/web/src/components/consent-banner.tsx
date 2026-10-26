"use client";

import { Button } from "@wovain/ui/components/button";
import { useTranslations } from "next-intl";
import { useId, useSyncExternalStore } from "react";

import { Link } from "@/i18n/navigation";
import {
  acceptAnalytics,
  consentBannerOpen,
  consentBannerOpenOnServer,
  openConsentSettings,
  rejectAnalytics,
  subscribeConsent,
} from "@/lib/consent-store";

// A non-modal notice at the bottom of the page: the site stays usable, and
// until a choice is made PostHog stays cookieless (lib/consent.ts). Both
// choices are the same size, one tap away.
export const ConsentBanner = () => {
  const t = useTranslations("AnalyticsConsent");
  const titleId = useId();
  const open = useSyncExternalStore(
    subscribeConsent,
    consentBannerOpen,
    consentBannerOpenOnServer
  );
  if (!open) {
    return null;
  }
  return (
    <section
      aria-labelledby={titleId}
      className="bg-card text-card-foreground border-border fixed inset-x-4 bottom-4 z-50 flex flex-col gap-3 rounded-xl border p-4 shadow-lg sm:end-auto sm:max-w-sm"
    >
      <h2 className="text-sm font-semibold" id={titleId}>
        {t("title")}
      </h2>
      <p className="text-muted-foreground text-sm leading-relaxed">
        {t("body")}{" "}
        <Link className="text-foreground underline" href="/privacy">
          {t("privacy")}
        </Link>
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={rejectAnalytics} size="lg" variant="outline">
          {t("reject")}
        </Button>
        <Button onClick={acceptAnalytics} size="lg">
          {t("accept")}
        </Button>
      </div>
    </section>
  );
};

/** Reopens the banner so a visitor can change their choice. */
export const ConsentSettingsButton = ({
  className,
}: {
  className?: string;
}) => {
  const t = useTranslations("AnalyticsConsent");
  return (
    <button className={className} onClick={openConsentSettings} type="button">
      {t("settings")}
    </button>
  );
};
