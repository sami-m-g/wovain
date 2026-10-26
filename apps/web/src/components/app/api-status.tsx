"use client";

import { useQuery } from "@tanstack/react-query";
import { cn } from "@wovain/ui/lib/utils";
import { useTranslations } from "next-intl";

import { orpc } from "@/utils/orpc";

/** The API's health as a status dot plus text, never colour alone. */
export const ApiStatus = () => {
  const t = useTranslations("Shell");
  const health = useQuery(orpc.healthCheck.queryOptions());

  let label = t("apiChecking");
  if (!health.isLoading) {
    label = health.data ? t("apiOnline") : t("apiOffline");
  }

  return (
    <p className="text-sidebar-foreground/75 flex items-center gap-2 px-2 text-xs group-data-[collapsible=icon]:hidden">
      <span
        aria-hidden="true"
        className={cn(
          "size-2 rounded-full",
          health.isLoading && "bg-sidebar-foreground/40",
          !health.isLoading && health.data && "bg-success",
          !health.isLoading && !health.data && "bg-destructive"
        )}
      />
      {t("apiStatus")}: {label}
    </p>
  );
};
