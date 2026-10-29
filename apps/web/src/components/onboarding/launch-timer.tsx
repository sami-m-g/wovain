"use client";

import { Badge } from "@wovain/ui/components/badge";
import { TimerIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { clockOf, TARGET_MINUTES, withinTarget } from "./launch-steps";

const TICK_MS = 1000;

/**
 * Time since sign-up, counting toward the 10-minute target; it stops at the
 * moment the first campaign was created.
 */
export const LaunchTimer = ({
  startedAt,
  stoppedAt,
}: {
  startedAt: string;
  stoppedAt?: Date | undefined;
}) => {
  const t = useTranslations("Launch.timer");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (stoppedAt !== undefined) {
      return;
    }
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, [stoppedAt]);

  const end = stoppedAt?.getTime() ?? now;
  const elapsed = end - new Date(startedAt).getTime();
  const onTime = withinTarget(elapsed);
  return (
    <div className="flex items-center gap-2" data-tour="timer">
      <TimerIcon aria-hidden="true" className="size-4" />
      {/* The server's clock and the browser's differ by the render time. */}
      <span
        className="figures font-display text-lg font-semibold tabular-nums"
        suppressHydrationWarning
      >
        <span className="sr-only">{t("elapsed")} </span>
        {clockOf(elapsed)}
      </span>
      <span className="text-muted-foreground text-sm">
        {t("target", { minutes: TARGET_MINUTES })}
      </span>
      {stoppedAt === undefined ? null : (
        <Badge variant={onTime ? "default" : "secondary"}>
          {onTime ? t("onTime") : t("live")}
        </Badge>
      )}
    </div>
  );
};
