"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@wovain/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@wovain/ui/components/dialog";
import { Skeleton } from "@wovain/ui/components/skeleton";
import { CircleCheck, CircleDashed } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useState } from "react";
import { toast } from "sonner";

import { usePendingStoreApprovals } from "@/components/store/store-approvals";
import type { Tone } from "@/components/store/store-shared";
import {
  AdminLink,
  DASH,
  StatusDot,
  useMoney,
  useRefresh,
} from "@/components/store/store-shared";
import type { StoreReadiness } from "@/lib/flow-client";
import { orpc } from "@/utils/orpc";

type CheckId = StoreReadiness["checks"][number]["id"];

const SITE_TONE = {
  COMING_SOON: "warning",
  INACTIVE: "danger",
  LIVE: "success",
  PASSWORD_PROTECTED: "warning",
  unknown: "muted",
} as const satisfies Record<string, Tone>;

const PAYOUT_TONE = {
  ACTIVE: "success",
  INACTIVE: "danger",
  IN_PROGRESS: "warning",
  unknown: "muted",
} as const satisfies Record<string, Tone>;

// A status Fourthwall sent that wovain has words for, else "unknown".
const known = <T extends Record<string, Tone>>(
  tones: T,
  value: string | null
): keyof T & string =>
  value !== null && Object.hasOwn(tones, value) ? value : "unknown";

/** Takes a coming-soon shop live: the impact, then one confirm (R3). */
export const GoLive = ({ name }: { name: string | null }) => {
  const t = useTranslations("Store.summary");
  const refresh = useRefresh();
  const [open, setOpen] = useState(false);
  const request = useMutation(orpc.store.setupStep.mutationOptions());
  const decide = useMutation(orpc.approvals.decide.mutationOptions());
  const busy = request.isPending || decide.isPending;
  const confirm = async () => {
    try {
      const approval = await request.mutateAsync({ step: "site_live" });
      // This dialog, with its impact, is the explicit confirm R3 needs.
      if (approval.status === "pending") {
        await decide.mutateAsync({ approvalId: approval.id, approve: true });
      }
      toast.success(t("goingLive"));
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
    await refresh();
  };
  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm">
        {t("goLive")}
      </Button>
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {name === null
                ? t("goLiveTitleFallback")
                : t("goLiveTitle", { name })}
            </DialogTitle>
            <DialogDescription>{t("goLiveBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => setOpen(false)}
              type="button"
              variant="outline"
            >
              {t("back")}
            </Button>
            <Button disabled={busy} onClick={confirm} type="button">
              {t("goLive")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

/** The fix for one failing check: an action here, else a Fourthwall link. */
const FixIt = ({ id, shopName }: { id: CheckId; shopName: string | null }) => {
  const t = useTranslations("Store.summary");
  if (id === "site_live") {
    return <GoLive name={shopName} />;
  }
  return <AdminLink page="settings">{t("fixIt")}</AdminLink>;
};

const Figure = ({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: ReactNode;
}) => (
  <div className="flex flex-col gap-1 px-4 py-3 sm:px-5">
    <dt className="text-muted-foreground text-xs font-medium">{label}</dt>
    <dd className="font-display figures text-xl font-semibold tracking-[-0.02em]">
      {children}
    </dd>
    {hint ? <dd className="text-muted-foreground text-xs">{hint}</dd> : null}
  </div>
);

/**
 * One strip over the tabs: the shop's status and readiness as one line
 * with its fix, then the week's numbers, what waits for the merchant and
 * whether payouts reach them.
 */
export const StoreSummary = ({
  readiness,
  onApprovals,
}: {
  readiness: StoreReadiness;
  onApprovals: () => void;
}) => {
  const t = useTranslations("Store.summary");
  const checks = useTranslations("Store.readiness");
  const format = useFormatter();
  const money = useMoney();
  const sales = useQuery(
    orpc.store.sales.queryOptions({ input: { range: "28d" } })
  );
  const pending = usePendingStoreApprovals();
  const { shop } = readiness;
  const failing = readiness.checks.filter((check) => !check.ok);
  const fix = failing.find((check) => check.blocking) ?? failing[0];
  const site = known(SITE_TONE, shop.siteStatus);
  const payout = known(PAYOUT_TONE, shop.payoutStatus);
  const waiting = pending.data?.length ?? 0;
  const salesValue = (value: ReactNode) => {
    if (sales.isPending) {
      return <Skeleton className="h-7 w-20" />;
    }
    return sales.isError ? DASH : value;
  };

  return (
    <section
      aria-label={t("label")}
      className="border-border bg-card rounded-xl border"
    >
      <div className="border-border flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="font-display text-base font-semibold">
            {shop.name ?? t("yourShop")}
          </span>
          <StatusDot tone={SITE_TONE[site]}>{t(`site.${site}`)}</StatusDot>
        </p>
        <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-2 text-sm sm:justify-end">
          {fix === undefined ? (
            <span className="text-success inline-flex items-center gap-1.5">
              <CircleCheck aria-hidden="true" className="size-4" />
              {t("ready")}
            </span>
          ) : (
            <>
              <span className="inline-flex items-center gap-1.5">
                <CircleDashed
                  aria-hidden="true"
                  className="text-warning size-4 shrink-0"
                />
                <span>
                  <span className="font-medium">
                    {checks(`${fix.id}.label`)}
                  </span>
                  <span className="sr-only">{checks("failed")}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    {t("passing", {
                      done: readiness.checks.length - failing.length,
                      total: readiness.checks.length,
                    })}
                  </span>
                </span>
              </span>
              <FixIt id={fix.id} shopName={shop.name} />
            </>
          )}
        </div>
      </div>
      {fix === undefined ? null : (
        <details className="border-border border-b px-4 py-2 sm:px-5">
          <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-xs">
            {t("allChecks")}
          </summary>
          <ul className="flex flex-col gap-2 py-2">
            {readiness.checks.map((check) => (
              <li className="flex items-start gap-2 text-sm" key={check.id}>
                {check.ok ? (
                  <CircleCheck
                    aria-hidden="true"
                    className="text-success mt-0.5 size-4 shrink-0"
                  />
                ) : (
                  <CircleDashed
                    aria-hidden="true"
                    className="text-muted-foreground mt-0.5 size-4 shrink-0"
                  />
                )}
                <span>
                  {checks(`${check.id}.label`)}
                  <span className="sr-only">
                    {check.ok ? checks("passed") : checks("failed")}
                  </span>
                  {check.ok ? null : (
                    <span className="text-muted-foreground block text-xs">
                      {checks(`${check.id}.fix`)}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <dl className="divide-border [&>*:nth-child(odd)]:max-sm:border-border grid grid-cols-2 divide-y sm:grid-cols-4 sm:divide-x sm:divide-y-0 [&>*:nth-child(odd)]:max-sm:border-e">
        <Figure hint={t("last28")} label={t("sales")}>
          {salesValue(money.dollars(sales.data?.totals.revenue))}
        </Figure>
        <Figure hint={t("last28")} label={t("orders")}>
          {salesValue(format.number(sales.data?.totals.orders ?? 0))}
        </Figure>
        <Figure
          hint={
            waiting > 0 ? (
              <button
                className="text-foreground underline underline-offset-4"
                onClick={onApprovals}
                type="button"
              >
                {t("review")}
              </button>
            ) : (
              t("nothingWaiting")
            )
          }
          label={t("waiting")}
        >
          {pending.isPending ? (
            <Skeleton className="h-7 w-8" />
          ) : (
            format.number(waiting)
          )}
        </Figure>
        <Figure
          hint={
            payout === "ACTIVE" ? null : (
              <AdminLink page="settings">{t("payoutFix")}</AdminLink>
            )
          }
          label={t("payouts")}
        >
          <StatusDot className="text-base" tone={PAYOUT_TONE[payout]}>
            {t(`payout.${payout}`)}
          </StatusDot>
        </Figure>
      </dl>
    </section>
  );
};
