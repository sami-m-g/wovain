"use client";

import { useQuery } from "@tanstack/react-query";
import { cn } from "@wovain/ui/lib/utils";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { flowClient } from "@/lib/flow-client";

/**
 * First-run checklist on the overview: connect Fourthwall, connect Meta, run
 * a first drop. Hidden once all three are done.
 */
export const SetupChecklist = () => {
  const t = useTranslations("Dashboard.setup");
  const connections = useQuery({
    queryFn: () => flowClient.connections.list(),
    queryKey: ["connections"],
  });
  const runs = useQuery({
    queryFn: () => flowClient.runs.list(),
    queryKey: ["runs"],
  });

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
      <ol className="mt-4 grid gap-3 md:grid-cols-3">
        {items.map((item, index) => (
          <li key={item.key}>
            <Link
              className={cn(
                "group flex h-full flex-col gap-2 rounded-xl border p-4 transition-colors",
                item.done
                  ? "border-border text-muted-foreground"
                  : "border-input hover:border-primary hover:bg-accent-soft/40"
              )}
              href={item.href}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "figures grid size-6 place-items-center rounded-full text-xs font-medium",
                  item.done ? "bg-success text-white" : "border-input border"
                )}
              >
                {item.done ? <Check className="size-3.5" /> : index + 1}
              </span>
              <span
                className={cn(
                  "font-medium",
                  item.done ? "line-through" : "text-foreground"
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
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
};
