"use client";

import { useQuery } from "@tanstack/react-query";
import { Label } from "@wovain/ui/components/label";
import { Switch } from "@wovain/ui/components/switch";
import { Bot, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";

import { NotifyButton } from "@/components/billing/notify-button";
import { Link } from "@/i18n/navigation";
import { orpc } from "@/utils/orpc";

/**
 * The autopilot switch. Autopilot comes with a paid plan, so on Free the
 * switch is locked with a way to upgrade, rather than letting the run fail.
 */
export const AutopilotToggle = ({
  checked,
  disabled,
  onCheckedChange,
}: {
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
}) => {
  const t = useTranslations("Wizard");
  const switchId = useId();
  const billing = useQuery(orpc.billing.status.queryOptions());
  const locked = billing.data?.autopilot === false;
  // While paid plans aren't on sale, the lock says "coming soon" and records
  // interest instead of linking to an upgrade.
  const selling = billing.data?.paidPlans === true;
  let hint = t("autopilotHint");
  if (locked) {
    hint = selling ? t("autopilotLocked") : t("autopilotSoon");
  }
  const Icon = locked ? Lock : Bot;

  return (
    <div className="border-border bg-card flex max-w-sm items-start gap-3 rounded-xl border p-4">
      <Switch
        aria-describedby={`${switchId}-hint`}
        checked={checked && !locked}
        className="mt-0.5"
        disabled={disabled || locked}
        id={switchId}
        onCheckedChange={onCheckedChange}
      />
      <div className="flex flex-col gap-1">
        <Label className="text-sm font-medium" htmlFor={switchId}>
          <Icon aria-hidden="true" className="size-4" />
          {t("autopilot")}
        </Label>
        <p className="text-muted-foreground text-xs" id={`${switchId}-hint`}>
          {hint}
        </p>
        {locked && !selling ? (
          <NotifyButton offer="studio" surface="paywall" />
        ) : null}
        {locked && selling ? (
          <Link
            className="text-accent-text inline-flex min-h-11 w-fit items-center text-xs font-medium hover:underline sm:min-h-0"
            href={{
              pathname: "/dashboard/billing",
              query: { offer: "studio" },
            }}
          >
            {t("autopilotUpgrade")}
          </Link>
        ) : null}
      </div>
    </div>
  );
};
