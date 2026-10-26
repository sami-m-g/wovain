"use client";

import { useQuery } from "@tanstack/react-query";
import { CREDIT_PACK, PLANS } from "@wovain/billing/plans";
import { Button } from "@wovain/ui/components/button";
import { Bot, Coins } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { CheckoutButton } from "@/components/billing/checkout-button";
import { NotifyButton } from "@/components/billing/notify-button";
import { useMoney } from "@/components/billing/plan-cards";
import { Link } from "@/i18n/navigation";
import { orpc } from "@/utils/orpc";

type Kind = "credits" | "plan";

/** While paid plans are on sale: what Studio (or a pack) gives, and a checkout. */
const Offers = ({ kind }: { kind: Kind }) => {
  const t = useTranslations("Billing.paywall");
  const billing = useTranslations("Billing");
  const money = useMoney();
  const { studio } = PLANS;
  return (
    <>
      <p className="figures text-sm">
        {t("studioGain", {
          credits: studio.monthlyCredits,
          price: money(studio.priceCents),
        })}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <CheckoutButton offer="studio" primary>
          {billing("cta.choose", { plan: studio.name })}
        </CheckoutButton>
        {kind === "credits" ? (
          <CheckoutButton offer="pack">
            {t("pack", {
              credits: CREDIT_PACK.credits,
              price: money(CREDIT_PACK.priceCents),
            })}
          </CheckoutButton>
        ) : null}
      </div>
    </>
  );
};

/**
 * The limit-reached screen, shown where the step stopped: what happened, the
 * way forward and a plain "Not now". While only Free is on sale it sells
 * nothing: it says when Free credits refresh and offers "Notify me". Nothing
 * is lost by closing it; the run waits where it stopped.
 */
export const Paywall = ({
  kind,
  message,
  fix,
  needed,
  available,
  onDismiss,
}: {
  kind: Kind;
  message: string;
  fix?: string | undefined;
  needed?: number | undefined;
  available?: number | undefined;
  onDismiss?: (() => void) | undefined;
}) => {
  const t = useTranslations("Billing.paywall");
  const format = useFormatter();
  const status = useQuery(orpc.billing.status.queryOptions());
  const selling = status.data?.paidPlans === true;
  const refresh = status.data?.subscription?.currentPeriodEnd;
  const Icon = kind === "plan" ? Bot : Coins;
  const short =
    needed !== undefined && available !== undefined
      ? t("shortBy", { available, needed })
      : undefined;
  const soonTitle =
    kind === "plan" ? t("planSoonTitle") : t("creditsSoonTitle");
  const sellTitle = kind === "plan" ? t("planTitle") : t("creditsTitle");

  return (
    <section
      aria-labelledby="paywall-title"
      className="border-border bg-card flex flex-col gap-5 rounded-2xl border p-5 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <span className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-lg">
          <Icon aria-hidden="true" className="size-4" />
        </span>
        <div className="flex flex-col gap-1">
          <h2
            className="font-display text-lg font-semibold tracking-[-0.02em]"
            id="paywall-title"
          >
            {selling ? sellTitle : soonTitle}
          </h2>
          <p className="text-muted-foreground text-sm">
            {[message, fix].filter(Boolean).join(". ")}
          </p>
          {short ? (
            <p className="text-muted-foreground figures text-sm">{short}</p>
          ) : null}
          {!selling && kind === "credits" ? (
            <p className="text-muted-foreground text-sm">
              {refresh
                ? t("freeRefreshOn", {
                    date: format.dateTime(new Date(refresh), {
                      dateStyle: "long",
                    }),
                  })
                : t("freeRefresh")}
            </p>
          ) : null}
        </div>
      </div>

      {selling ? <Offers kind={kind} /> : null}

      <div className="flex flex-wrap items-center gap-3">
        {selling ? null : (
          <NotifyButton
            offer={kind === "plan" ? "studio" : "pack"}
            surface="paywall"
          />
        )}
        <Link
          className="text-accent-text inline-flex min-h-11 items-center text-sm font-medium hover:underline sm:min-h-9"
          href="/dashboard/billing"
        >
          {t("comparePlans")}
        </Link>
        {onDismiss ? (
          <Button
            className="text-muted-foreground h-11 px-3 sm:ms-auto sm:h-9"
            onClick={onDismiss}
            variant="ghost"
          >
            {t("notNow")}
          </Button>
        ) : null}
      </div>
    </section>
  );
};
