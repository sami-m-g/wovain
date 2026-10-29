"use client";

import { useQuery } from "@tanstack/react-query";
import { buttonVariants } from "@wovain/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@wovain/ui/components/empty";
import { cn } from "@wovain/ui/lib/utils";
import { useTranslations } from "next-intl";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

import { ProviderLogo } from "@/components/app/provider-logo";
import type { Provider } from "@/lib/flow-client";
import { connectUrl } from "@/lib/flow-client";
import { orpc } from "@/utils/orpc";

/**
 * The page the merchant is on, query included, so connecting brings them
 * back to the same screen (a run's `?run=`, the insights range).
 */
export const useHere = () => {
  const pathname = usePathname();
  const query = useSearchParams().toString();
  return query === "" ? pathname : `${pathname}?${query}`;
};

/**
 * Whether the merchant connects this provider at all: while wovain draws the
 * art on its own key there is no fal account to connect.
 */
export const useConnectable = (provider: Provider) => {
  const { data } = useQuery(orpc.onboarding.status.queryOptions());
  const wovainDraws = data?.enabled === true && data.wovainDraws;
  return !(provider === "fal" && wovainDraws);
};

/**
 * What a screen shows when a provider isn't connected, or its sign-in
 * expired: the provider's mark, one line on what connecting unlocks and the
 * connect button, which comes back here. An expected state, never an error.
 */
export const ConnectState = ({
  provider,
  reconnect = false,
  title,
  body,
  headingId,
  children,
  className,
}: {
  provider: Provider;
  reconnect?: boolean;
  /** Defaults to "Connect <provider>" (or "Reconnect <provider>"). */
  title?: string;
  /** Defaults to what connecting this provider unlocks. */
  body?: string;
  /** Makes the title the section's heading, with this id. */
  headingId?: string;
  /** More actions after the connect button. */
  children?: ReactNode;
  className?: string;
}) => {
  const t = useTranslations("Connections");
  const here = useHere();
  const name = t(`providers.${provider}.name`);
  const action = t(reconnect ? "reconnect" : "connect", { name });
  const shown = title ?? action;
  return (
    <Empty
      className={cn("border-input bg-card border border-dashed", className)}
    >
      <EmptyHeader>
        <EmptyMedia>
          <ProviderLogo className="size-12" service={provider} />
        </EmptyMedia>
        <EmptyTitle className="font-display text-base font-semibold">
          {headingId === undefined ? shown : <h2 id={headingId}>{shown}</h2>}
        </EmptyTitle>
        <EmptyDescription>
          {body ??
            (reconnect
              ? t("expiredBody", { name })
              : t(`providers.${provider}.unlocks`))}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row flex-wrap justify-center">
        <a
          className={cn(buttonVariants(), "h-9 px-4")}
          href={connectUrl(provider, here)}
        >
          {action}
        </a>
        {children}
      </EmptyContent>
    </Empty>
  );
};
