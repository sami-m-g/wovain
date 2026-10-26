"use client";

import { useQuery } from "@tanstack/react-query";
import { buttonVariants } from "@wovain/ui/components/button";
import { cn } from "@wovain/ui/lib/utils";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { orpc } from "@/utils/orpc";

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
    connections.data.some((item) => item.provider === provider);
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

  return (
    <section
      aria-labelledby="setup-title"
      className="border-border bg-card rounded-2xl border p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          className="font-display text-lg font-semibold tracking-[-0.015em]"
          id="setup-title"
        >
          {t("title")}
        </h2>
        <p className="text-muted-foreground figures text-sm">
          {t("progress", {
            done: items.length - remaining,
            total: items.length,
          })}
        </p>
      </div>
      <ol className="divide-border border-border mt-4 flex flex-col divide-y border-t">
        {items.map((item, index) => (
          <li
            className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:gap-4"
            key={item.key}
          >
            <span
              aria-hidden="true"
              className={cn(
                "figures grid size-6 shrink-0 place-items-center rounded-full text-xs font-medium",
                item.done ? "bg-success text-white" : "border-input border"
              )}
            >
              {item.done ? <Check className="size-3.5" /> : index + 1}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span
                className={cn(
                  "font-medium",
                  item.done && "text-muted-foreground line-through"
                )}
              >
                {t(`${item.key}.title`)}
                {item.done ? (
                  <span className="sr-only"> ({t("done")})</span>
                ) : null}
              </span>
              <span className="text-muted-foreground text-sm">
                {t(`${item.key}.body`)}
              </span>
            </div>
            {item.done ? null : (
              <Link
                className={cn(
                  buttonVariants({
                    variant: index === firstOpen ? "default" : "outline",
                  }),
                  "h-9 w-fit shrink-0 rounded-lg px-4"
                )}
                href={item.href}
              >
                {t(`${item.key}.title`)}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
};
