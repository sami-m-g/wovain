"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge } from "@wovain/ui/components/badge";
import { buttonVariants } from "@wovain/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wovain/ui/components/card";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@wovain/ui/components/item";
import { Progress } from "@wovain/ui/components/progress";
import { cn } from "@wovain/ui/lib/utils";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { orpc } from "@/utils/orpc";

const PERCENT = 100;

/**
 * First-run checklist on the overview: connect Fourthwall, connect Meta, run
 * a first drop. Hidden once all three are done.
 */
export const SetupChecklist = () => {
  const t = useTranslations("Dashboard.setup");
  const connections = useQuery(orpc.connections.list.queryOptions());
  const runs = useQuery(orpc.runs.list.queryOptions());

  if (
    connections.isPending ||
    runs.isPending ||
    connections.error ||
    runs.error
  ) {
    return null;
  }
  const connected = (provider: string) =>
    connections.data.some(
      (item) => item.provider === provider && !item.needsReconnect
    );
  // What a drop needs that isn't connected yet, in the order the run uses it.
  const missing = (["fal", "fourthwall", "meta"] as const).filter(
    (provider) => !connected(provider)
  );
  const items = [
    {
      done: connected("fourthwall"),
      href: "/dashboard/connections",
      key: "fourthwall",
    },
    { done: connected("meta"), href: "/dashboard/connections", key: "meta" },
    { done: runs.data.length > 0, href: "/dashboard/new", key: "drop" },
  ] as const;
  const remaining = items.filter((item) => !item.done).length;
  const firstOpen = items.findIndex((item) => !item.done);
  if (remaining === 0) {
    return null;
  }
  const done = items.length - remaining;

  return (
    <section aria-labelledby="setup-title">
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg font-semibold tracking-[-0.015em]">
            <h2 id="setup-title">{t("title")}</h2>
          </CardTitle>
          <CardDescription>{t("lead")}</CardDescription>
          <CardAction className="text-muted-foreground figures text-sm">
            {t("progress", { done, total: items.length })}
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Progress
            aria-label={t("title")}
            value={Math.round((done / items.length) * PERCENT)}
          />
          <ol className="flex w-full flex-col">
            {items.map((item, index) => {
              const next = index === firstOpen;
              return (
                <Item className="px-0" key={item.key} render={<li />}>
                  <ItemMedia
                    aria-hidden="true"
                    className={cn(
                      "figures size-7 rounded-full text-xs font-medium",
                      item.done
                        ? "bg-success text-white"
                        : "border-input border",
                      next && "border-foreground border-2"
                    )}
                  >
                    {item.done ? <Check className="size-3.5" /> : index + 1}
                  </ItemMedia>
                  <ItemContent className="max-sm:basis-[calc(100%-2.5rem)]">
                    <ItemTitle
                      className={cn(
                        item.done && "text-muted-foreground line-through"
                      )}
                    >
                      {t(`${item.key}.title`)}
                      {item.done ? (
                        <span className="sr-only"> ({t("done")})</span>
                      ) : null}
                      {next ? (
                        <Badge variant="secondary">{t("next")}</Badge>
                      ) : null}
                    </ItemTitle>
                    <ItemDescription className="line-clamp-none">
                      {t(`${item.key}.body`)}
                    </ItemDescription>
                    {item.key === "drop" && missing.length > 0 ? (
                      <p className="text-muted-foreground text-sm">
                        {t("missing")}{" "}
                        {missing.map((provider, position) => (
                          <span key={provider}>
                            {position > 0 ? ", " : null}
                            <Link
                              className="text-foreground font-medium underline underline-offset-3"
                              href="/dashboard/connections"
                            >
                              {t(`needs.${provider}`)}
                            </Link>
                          </span>
                        ))}
                      </p>
                    ) : null}
                  </ItemContent>
                  {item.done ? null : (
                    <ItemActions className="max-sm:ms-10">
                      <Link
                        className={cn(
                          buttonVariants({ variant: "outline" }),
                          "h-9 px-4"
                        )}
                        href={item.href}
                      >
                        {t(`${item.key}.action`)}
                      </Link>
                    </ItemActions>
                  )}
                </Item>
              );
            })}
          </ol>
        </CardContent>
      </Card>
    </section>
  );
};
