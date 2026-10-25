"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@wovain/ui/components/badge";
import { Button, buttonVariants } from "@wovain/ui/components/button";
import { Skeleton } from "@wovain/ui/components/skeleton";
import { cn } from "@wovain/ui/lib/utils";
import { Loader2, Megaphone, Store } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { FlowProblemNotice } from "@/components/app/flow-problem";
import { getPathname, Link } from "@/i18n/navigation";
import type { Connection, Provider } from "@/lib/flow-client";
import {
  connectUrl,
  describeProblem,
  flowClient,
  PROVIDERS,
} from "@/lib/flow-client";

const PROVIDER_ICON: Record<Provider, LucideIcon> = {
  fourthwall: Store,
  meta: Megaphone,
};

/** Connected: a filled green dot; not connected: a hollow ring. */
const StatusDot = ({ connected }: { connected: boolean }) => (
  <span
    aria-hidden="true"
    className={cn(
      "size-2 shrink-0 rounded-full",
      connected ? "bg-success" : "border-muted-foreground border"
    )}
  />
);

const connectionsQuery = {
  queryFn: () => flowClient.connections.list(),
  queryKey: ["connections"],
} as const;

const ProviderRow = ({
  connection,
  provider,
}: {
  connection?: Connection | undefined;
  provider: Provider;
}) => {
  const t = useTranslations("Connections");
  const format = useFormatter();
  const problems = useTranslations("Wizard.problem");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const name = t(`providers.${provider}.name`);
  const connected = connection !== undefined;
  const actionClass = "h-9 min-w-36 rounded-lg px-4";
  const Icon = PROVIDER_ICON[provider];

  const disconnect = useMutation({
    mutationFn: () => flowClient.connections.disconnect(provider),
    onError: (error) => {
      toast.error(problems("other", { message: error.message }));
    },
    onSuccess: async () => {
      toast.success(t("disconnectedToast", { name }));
      await queryClient.invalidateQueries({ queryKey: ["connections"] });
    },
  });

  return (
    <li className="border-border bg-card flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center sm:p-5">
      <span
        aria-hidden="true"
        className="bg-muted text-foreground grid size-11 shrink-0 place-items-center rounded-lg"
      >
        <Icon className="size-5" />
      </span>
      <div className="flex flex-1 flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-base font-semibold">{name}</h2>
            <Badge className="gap-1.5" variant="outline">
              <StatusDot connected={connected} />
              {connected ? t("connected") : t("disconnected")}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            {t(`providers.${provider}.body`)}
          </p>
          {connected ? (
            <p className="text-muted-foreground text-xs">
              {t("since", {
                date: format.dateTime(new Date(connection.connectedAt), {
                  dateStyle: "medium",
                }),
              })}
            </p>
          ) : null}
        </div>
        {connected ? (
          <Button
            className={actionClass}
            disabled={disconnect.isPending}
            onClick={() => disconnect.mutate()}
            variant="outline"
          >
            {disconnect.isPending ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : null}
            {t("disconnect", { name })}
          </Button>
        ) : (
          <a
            className={cn(buttonVariants(), actionClass)}
            href={connectUrl(
              provider,
              getPathname({ href: "/dashboard/connections", locale })
            )}
          >
            {t("connect", { name })}
          </a>
        )}
      </div>
    </li>
  );
};

export const ConnectionsPanel = () => {
  const t = useTranslations("Connections");
  const { data, error, isPending } = useQuery(connectionsQuery);

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

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {PROVIDERS.map((provider) => (
          <ProviderRow
            connection={data.find((item) => item.provider === provider)}
            key={provider}
            provider={provider}
          />
        ))}
      </ul>
      <p className="text-muted-foreground text-sm">{t("serverKeys")}</p>
    </div>
  );
};

/** Compact status list for the overview page. */
export const ConnectionsSummary = () => {
  const t = useTranslations("Connections");
  const dashboard = useTranslations("Dashboard");
  const { data, isPending } = useQuery(connectionsQuery);

  if (isPending) {
    return <Skeleton className="h-36 w-full rounded-xl" />;
  }

  const missing = PROVIDERS.filter(
    (provider) => !data?.some((item) => item.provider === provider)
  );

  return (
    <div className="flex flex-col gap-4">
      <ul className="divide-border border-border bg-card flex flex-col divide-y rounded-xl border px-4">
        {PROVIDERS.map((provider) => {
          const connected = !missing.includes(provider);
          return (
            <li className="flex items-center gap-3 py-3" key={provider}>
              <StatusDot connected={connected} />
              <span className="flex-1 text-sm font-medium">
                {t(`providers.${provider}.name`)}
              </span>
              <span className="text-muted-foreground text-sm">
                {connected ? t("connected") : t("disconnected")}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-muted-foreground text-sm">
        {missing.length > 0
          ? dashboard("setupBody", { count: missing.length })
          : dashboard("allConnected")}{" "}
        <Link
          className="text-accent-text font-medium hover:underline"
          href="/dashboard/connections"
        >
          {dashboard("manage")}
        </Link>
      </p>
    </div>
  );
};
