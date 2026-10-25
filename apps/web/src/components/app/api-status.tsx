"use client";

import { useQuery } from "@tanstack/react-query";
import { cn } from "@wovain/ui/lib/utils";
import { useTranslations } from "next-intl";

import { orpc } from "@/utils/orpc";

export const ApiStatus = () => {
  const t = useTranslations("Shell");
  const health = useQuery(orpc.healthCheck.queryOptions());

  let label = t("apiChecking");
  if (!health.isLoading) {
    label = health.data ? t("apiOnline") : t("apiOffline");
  }

  return (
    <p className="text-sidebar-foreground/80 flex items-center gap-2 text-xs">
      <span
        aria-hidden="true"
        className={cn(
          "size-2 rounded-full",
          health.isLoading && "bg-sidebar-foreground/40",
          !health.isLoading && health.data && "bg-ink-green",
          !health.isLoading && !health.data && "bg-ink-rhodamine"
        )}
      />
      {t("apiStatus")}: {label}
    </p>
  );
};
