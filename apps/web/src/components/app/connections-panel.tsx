"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@wovain/ui/components/badge";
import { Button, buttonVariants } from "@wovain/ui/components/button";
import { Skeleton } from "@wovain/ui/components/skeleton";
import { cn } from "@wovain/ui/lib/utils";
import { Loader2 } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { FlowProblemNotice } from "@/components/app/flow-problem";
import type { Ink } from "@/components/brand/swatch";
import { inkField } from "@/components/brand/swatch";
import { getPathname, Link } from "@/i18n/navigation";
import type { Connection, Provider } from "@/lib/flow-client";
import {
  connectUrl,
  describeProblem,
  flowClient,
  PROVIDERS,
} from "@/lib/flow-client";

const PROVIDER_INK: Record<Provider, Ink> = {
  fourthwall: "green",
  meta: "indigo",
};

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
  const actionClass = "h-10 min-w-40 px-4 text-sm font-semibold";

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
    <li className="border-border bg-card grid grid-cols-[4.5rem_1fr] border sm:grid-cols-[6rem_1fr]">
      <div
        aria-hidden="true"
        className={cn(
          connected
            ? inkField[PROVIDER_INK[provider]]
            : "border-input border-e border-dashed"
        )}
      />
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
        <div className="flex flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semi-expanded text-lg font-extrabold">
              {name}
            </h2>
            <Badge variant={connected ? "default" : "outline"}>
              {connected ? t("connected") : t("disconnected")}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            {t(`providers.${provider}.body`)}
          </p>
          {connected ? (
            <p className="text-sm font-medium">
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
            <Skeleton className="h-28 w-full" />
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
    return <Skeleton className="h-36 w-full" />;
  }

  const missing = PROVIDERS.filter(
    (provider) => !data?.some((item) => item.provider === provider)
  );

  return (
    <div className="flex flex-col gap-4">
      <ul className="divide-border border-border flex flex-col divide-y border-y">
        {PROVIDERS.map((provider) => {
          const connected = !missing.includes(provider);
          return (
            <li className="flex items-center gap-3 py-3" key={provider}>
              <span
                aria-hidden="true"
                className={cn(
                  "size-4 shrink-0",
                  connected
                    ? inkField[PROVIDER_INK[provider]]
                    : "border-input border border-dashed"
                )}
              />
              <span className="flex-1 font-semibold">
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
          className="text-primary font-semibold underline"
          href="/dashboard/connections"
        >
          {dashboard("manage")}
        </Link>
      </p>
    </div>
  );
};
