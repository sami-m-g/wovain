"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@wovain/ui/components/badge";
import { Button, buttonVariants } from "@wovain/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@wovain/ui/components/item";
import { Skeleton } from "@wovain/ui/components/skeleton";
import { Spinner } from "@wovain/ui/components/spinner";
import { cn } from "@wovain/ui/lib/utils";
import { ChevronRight } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { FlowProblemNotice } from "@/components/app/flow-problem";
import { ProviderLogo } from "@/components/app/provider-logo";
import { getPathname, Link } from "@/i18n/navigation";
import type { Connection, Provider } from "@/lib/flow-client";
import { connectUrl, describeProblem, PROVIDERS } from "@/lib/flow-client";
import { orpc } from "@/utils/orpc";

/**
 * Connected: a filled green dot; not connected: a hollow ring; a sign-in
 * that expired and couldn't be refreshed: a filled red dot.
 */
const ConnectionBadge = ({
  connected,
  expired = false,
}: {
  connected: boolean;
  expired?: boolean;
}) => {
  const t = useTranslations("Connections");
  let dot = "border-muted-foreground border";
  let label = t("disconnected");
  if (expired) {
    dot = "bg-destructive";
    label = t("expired");
  } else if (connected) {
    dot = "bg-success";
    label = t("connected");
  }
  return (
    <Badge className="gap-1.5" variant="outline">
      <span
        aria-hidden="true"
        className={cn("size-2 shrink-0 rounded-full", dot)}
      />
      {label}
    </Badge>
  );
};

const ProviderItem = ({
  connection,
  provider,
  primary,
}: {
  connection?: Connection | undefined;
  provider: Provider;
  /** The next provider to connect gets the page's one primary action. */
  primary: boolean;
}) => {
  const t = useTranslations("Connections");
  const format = useFormatter();
  const problems = useTranslations("Wizard.problem");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const name = t(`providers.${provider}.name`);
  const expired = connection?.needsReconnect === true;
  const connected = connection !== undefined && !expired;

  const disconnect = useMutation(
    orpc.connections.disconnect.mutationOptions({
      onError: (error) => {
        toast.error(problems("other", { message: error.message }));
      },
      onSuccess: async () => {
        toast.success(t("disconnectedToast", { name }));
        await queryClient.invalidateQueries({
          queryKey: orpc.connections.key(),
        });
      },
    })
  );

  return (
    <Item className="bg-card p-4 sm:p-5" render={<li />} variant="outline">
      <ProviderLogo service={provider} />
      <ItemContent className="min-w-48">
        <ItemTitle className="font-display flex-wrap text-base font-semibold">
          <h2>{name}</h2>
          <ConnectionBadge connected={connected} expired={expired} />
        </ItemTitle>
        <ItemDescription>{t(`providers.${provider}.body`)}</ItemDescription>
        {connected ? (
          <p className="text-muted-foreground text-xs">
            {t("since", {
              date: format.dateTime(new Date(connection.connectedAt), {
                dateStyle: "medium",
              }),
            })}
          </p>
        ) : null}
      </ItemContent>
      <ItemActions className="w-full sm:w-auto">
        {connected ? (
          <Button
            className="h-9 w-full sm:w-auto"
            disabled={disconnect.isPending}
            onClick={() => disconnect.mutate({ provider })}
            variant="outline"
          >
            {disconnect.isPending ? (
              <Spinner aria-hidden="true" data-icon="inline-start" />
            ) : null}
            {t("disconnect", { name })}
          </Button>
        ) : (
          <a
            className={cn(
              buttonVariants({
                variant: primary || expired ? "default" : "outline",
              }),
              "h-9 w-full sm:w-auto"
            )}
            href={connectUrl(
              provider,
              getPathname({ href: "/dashboard/connections", locale })
            )}
          >
            {t(expired ? "reconnect" : "connect", { name })}
          </a>
        )}
      </ItemActions>
    </Item>
  );
};

export const ConnectionsPanel = () => {
  const { data, error, isPending } = useQuery(
    orpc.connections.list.queryOptions()
  );

  if (isPending) {
    return (
      <ul className="flex flex-col gap-3">
        {PROVIDERS.map((provider) => (
          <li key={provider}>
            <Skeleton className="h-24 w-full rounded-xl" />
          </li>
        ))}
      </ul>
    );
  }

  if (error) {
    return <FlowProblemNotice problem={describeProblem(error)} />;
  }

  const firstMissing = PROVIDERS.find(
    (provider) =>
      !data.some((item) => item.provider === provider && !item.needsReconnect)
  );

  return (
    <div className="flex flex-col">
      <ul className="flex w-full flex-col gap-3">
        {PROVIDERS.map((provider) => (
          <ProviderItem
            connection={data.find((item) => item.provider === provider)}
            key={provider}
            primary={provider === firstMissing}
            provider={provider}
          />
        ))}
      </ul>
    </div>
  );
};

/** Compact status list for the overview page. */
export const ConnectionsSummary = () => {
  const t = useTranslations("Connections");
  const dashboard = useTranslations("Dashboard");
  const { data, isPending } = useQuery(orpc.connections.list.queryOptions());

  if (isPending) {
    return <Skeleton className="h-36 w-full rounded-xl" />;
  }

  return (
    <ul className="border-border bg-card divide-border flex w-full flex-col divide-y rounded-xl border">
      {PROVIDERS.map((provider) => {
        const found = data?.find((item) => item.provider === provider);
        const expired = found?.needsReconnect === true;
        return (
          <Item
            className="rounded-none first:rounded-t-xl last:rounded-b-xl"
            key={provider}
            render={<li />}
          >
            <ProviderLogo className="size-8" service={provider} />
            <ItemContent>
              <ItemTitle>{t(`providers.${provider}.name`)}</ItemTitle>
            </ItemContent>
            <ConnectionBadge
              connected={found !== undefined && !expired}
              expired={expired}
            />
          </Item>
        );
      })}
      <Item
        className="text-accent-text rounded-none rounded-b-xl font-medium"
        render={<Link href="/dashboard/connections" />}
        size="sm"
      >
        <ItemContent>{dashboard("manage")}</ItemContent>
        <ChevronRight aria-hidden="true" className="size-4 rtl:rotate-180" />
      </Item>
    </ul>
  );
};
