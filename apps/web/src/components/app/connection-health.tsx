"use client";

import { Badge } from "@wovain/ui/components/badge";
import { buttonVariants } from "@wovain/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@wovain/ui/components/item";
import { cn } from "@wovain/ui/lib/utils";
import { useLocale, useTranslations } from "next-intl";

import { ProviderLogo } from "@/components/app/provider-logo";
import { getPathname } from "@/i18n/navigation";
import type { ProviderHealth } from "@/lib/flow-client";
import { connectUrl } from "@/lib/flow-client";

const DOT = {
  connected: "bg-success",
  expired: "bg-destructive",
  missing: "border-muted-foreground border",
} as const;

/**
 * What each account a drop uses is doing now: connected, expired or
 * missing, what wovain needs it for, and one button to fix it. Connecting
 * comes back to `returnPath` (plus `returnQuery`, e.g. `?step=connect`).
 */
export const ConnectionHealth = ({
  connections,
  returnPath,
  returnQuery = "",
}: {
  connections: readonly ProviderHealth[];
  returnPath: "/dashboard/connections" | "/dashboard/onboarding";
  returnQuery?: string;
}) => {
  const t = useTranslations("Onboarding.health");
  const names = useTranslations("Connections");
  const locale = useLocale();
  const firstOpen = connections.find((each) => each.state !== "connected");
  const returnTo = `${getPathname({ href: returnPath, locale })}${returnQuery}`;

  return (
    <ul className="flex w-full flex-col gap-3">
      {connections.map((health) => {
        const name = names(`providers.${health.provider}.name`);
        const primary = health.provider === firstOpen?.provider;
        return (
          <Item
            className="bg-card p-4"
            key={health.provider}
            render={<li />}
            variant="outline"
          >
            <ProviderLogo service={health.provider} />
            <ItemContent className="min-w-40">
              <ItemTitle className="font-display flex-wrap text-base font-semibold">
                <h3>{name}</h3>
                <Badge className="gap-1.5" variant="outline">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      DOT[health.state]
                    )}
                  />
                  {t(`state.${health.state}`)}
                </Badge>
              </ItemTitle>
              <ItemDescription>
                {t(`neededFor.${health.neededFor}`)}
                {health.required ? null : ` ${t("optional")}`}
              </ItemDescription>
            </ItemContent>
            {health.state === "connected" ? null : (
              <ItemActions className="w-full sm:w-auto">
                <a
                  className={cn(
                    buttonVariants({
                      variant: primary ? "default" : "outline",
                    }),
                    "h-10 w-full sm:h-9 sm:w-auto"
                  )}
                  href={connectUrl(health.provider, returnTo)}
                >
                  {names(health.state === "expired" ? "reconnect" : "connect", {
                    name,
                  })}
                </a>
              </ItemActions>
            )}
          </Item>
        );
      })}
    </ul>
  );
};
