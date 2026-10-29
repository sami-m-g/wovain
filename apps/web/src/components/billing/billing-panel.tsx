"use client";

import { useQuery } from "@tanstack/react-query";
import type { Offer, PlanCode } from "@wovain/billing/plans";
import { OFFERS } from "@wovain/billing/plans";
import { Alert, AlertDescription } from "@wovain/ui/components/alert";
import { Skeleton } from "@wovain/ui/components/skeleton";
import { CircleAlert, CircleCheck } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";

import { FlowProblemNotice } from "@/components/app/flow-problem";
import { useCatalog } from "@/components/billing/catalog-provider";
import {
  CheckoutButton,
  PortalButton,
} from "@/components/billing/checkout-button";
import { CreditTag } from "@/components/billing/credit-tag";
import { NotifyButton } from "@/components/billing/notify-button";
import { PackCard, PlanCards } from "@/components/billing/plan-cards";
import { RedeemCode } from "@/components/billing/redeem-code";
import type { BillingStatus } from "@/lib/flow-client";
import { describeProblem } from "@/lib/flow-client";
import { orpc } from "@/utils/orpc";

// Credits arrive by webhook a few seconds after Polar's checkout returns (or
// a promo code is redeemed), so the page polls the status for about 30
// seconds after either.
const POLL_MS = 2000;
const POLLS = 15;

const isOffer = (value: string | null): value is Offer =>
  value !== null && (OFFERS as readonly string[]).includes(value);

const PAID_STATUSES = new Set(["active", "trialing", "past_due"]);

/** The plan, the credits left and, while paid plans are on sale, a pack. */
const Summary = ({
  status,
  renewal,
}: {
  status: BillingStatus;
  renewal: string | undefined;
}) => {
  const t = useTranslations("Billing");
  const format = useFormatter();
  const { creditPack, plans } = useCatalog();
  const { credits, enabled, paidPlans, plan, subscription } = status;
  const paid = plan !== "free";
  let renewalLine: string | undefined;
  if (renewal !== undefined) {
    renewalLine = subscription?.cancelAtPeriodEnd
      ? t("page.ends", { date: renewal })
      : t("page.renews", { date: renewal });
  }
  return (
    <section
      aria-labelledby="billing-summary"
      className="border-border bg-card grid gap-6 rounded-2xl border p-5 sm:grid-cols-[1fr_auto] sm:p-8"
    >
      <div className="flex flex-col gap-1">
        <h2
          className="text-muted-foreground text-sm font-medium"
          id="billing-summary"
        >
          {t("page.planLabel")}
        </h2>
        <p className="font-display text-3xl font-semibold tracking-[-0.025em]">
          {plans[plan].name}
        </p>
        {renewalLine ? (
          <p className="text-muted-foreground text-sm">{renewalLine}</p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1 sm:items-end">
        <p className="text-muted-foreground text-sm font-medium">
          {t("page.creditsLabel")}
        </p>
        <p className="font-display figures text-3xl font-semibold tracking-[-0.025em]">
          {format.number(credits.available)}
        </p>
        <p className="text-muted-foreground figures text-sm">
          {t("page.creditsSplit", { pack: credits.pack, plan: credits.plan })}
        </p>
      </div>
      {paidPlans ? (
        <div className="flex flex-wrap gap-3 sm:col-span-2">
          <CheckoutButton disabled={!enabled} offer="pack">
            {t("cta.buyPack", { credits: creditPack.credits })}
          </CheckoutButton>
          {paid ? <PortalButton disabled={!enabled} /> : null}
        </div>
      ) : (
        <div className="flex flex-col gap-3 sm:col-span-2">
          <p className="text-muted-foreground text-sm">
            {renewal === undefined
              ? t("page.comingSoon")
              : t("page.comingSoonRenews", { date: renewal })}
          </p>
          {paid ? <PortalButton disabled={!enabled} /> : null}
        </div>
      )}
    </section>
  );
};

/** The merchant's plan, credits and the ways to change them. */
export const BillingPanel = () => {
  const t = useTranslations("Billing");
  const { creditPack, plans } = useCatalog();
  const format = useFormatter();
  const searchParams = useSearchParams();
  const returned = searchParams.get("checkout") === "success";
  const redeemed = searchParams.get("redeemed") === "1";
  const asked = searchParams.get("offer");
  const offer = isOffer(asked) ? asked : undefined;

  const status = useQuery(
    orpc.billing.status.queryOptions({
      refetchInterval: (query) =>
        ((returned || redeemed) && query.state.dataUpdateCount < POLLS) ||
        query.state.data?.freePlan === "retrying"
          ? POLL_MS
          : false,
    })
  );

  if (status.error) {
    return <FlowProblemNotice problem={describeProblem(status.error)} />;
  }
  if (!status.data) {
    return (
      <div aria-busy="true" className="flex flex-col gap-4">
        <span className="sr-only">{t("loading")}</span>
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  const { enabled, paidPlans, plan, subscription } = status.data;
  const paid = plan !== "free";
  const renewal = subscription?.currentPeriodEnd
    ? format.dateTime(new Date(subscription.currentPeriodEnd), {
        dateStyle: "long",
      })
    : undefined;
  const pastDue = subscription?.status === "past_due";
  const setupNote = {
    blocked_email_not_verified: t("page.setupUnverified"),
    blocked_linked_to_other_account: t("page.setupLinked"),
    none: undefined,
    retrying: t("page.setupRetrying"),
    started: undefined,
  }[status.data.freePlan];
  const recommended: PlanCode =
    offer === "label" || plan === "studio" ? "label" : "studio";

  const planAction = (code: PlanCode) => {
    if (code === plan || code === "free") {
      // Going back to Free is a cancellation, done in the portal.
      return paid ? <PortalButton disabled={!enabled} /> : null;
    }
    if (!paidPlans) {
      // Not on sale yet (`billing-paid-plans` is off): interest, no checkout.
      return <NotifyButton offer={code} surface="billing" />;
    }
    if (paid && subscription && PAID_STATUSES.has(subscription.status)) {
      // A paid plan changes plans in the portal, with proration.
      return <PortalButton disabled={!enabled} />;
    }
    return (
      <CheckoutButton
        disabled={!enabled}
        offer={code}
        primary={code === recommended}
      >
        {t("cta.choose", { plan: plans[code].name })}
      </CheckoutButton>
    );
  };

  return (
    <div className="flex flex-col gap-10">
      {returned ? (
        <Alert>
          <CircleCheck aria-hidden="true" />
          <AlertDescription className="text-foreground text-sm">
            {t("page.checkoutSuccess")}
          </AlertDescription>
        </Alert>
      ) : null}
      {redeemed ? (
        <Alert>
          <CircleCheck aria-hidden="true" />
          <AlertDescription className="text-foreground text-sm">
            {t("page.redeemSuccess")}
          </AlertDescription>
        </Alert>
      ) : null}
      {setupNote === undefined ? null : (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertDescription className="text-sm">{setupNote}</AlertDescription>
        </Alert>
      )}
      {pastDue ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertDescription className="text-sm">
            {t("page.pastDue")}
          </AlertDescription>
        </Alert>
      ) : null}
      {enabled || !paidPlans ? null : (
        <p className="text-muted-foreground text-sm">{t("disabledNote")}</p>
      )}

      <Summary renewal={renewal} status={status.data} />

      <div className="grid gap-10 lg:grid-cols-[1fr_17rem] lg:items-start">
        <section
          aria-labelledby="billing-plans"
          className="flex flex-col gap-4"
        >
          <h2
            className="font-display text-xl font-semibold tracking-[-0.02em]"
            id="billing-plans"
          >
            {t("page.plansTitle")}
          </h2>
          <PlanCards
            actions={{
              free: planAction("free"),
              label: planAction("label"),
              studio: planAction("studio"),
            }}
            comingSoon={!paidPlans}
            current={plan}
            recommended={recommended}
          />
          <h2 className="font-display mt-6 text-xl font-semibold tracking-[-0.02em]">
            {t("page.packTitle")}
          </h2>
          <PackCard
            action={
              paidPlans ? (
                <CheckoutButton disabled={!enabled} offer="pack">
                  {t("cta.buyPack", { credits: creditPack.credits })}
                </CheckoutButton>
              ) : (
                <NotifyButton offer="pack" surface="billing" />
              )
            }
            comingSoon={!paidPlans}
          />
        </section>
        <div className="flex flex-col gap-10 lg:mt-12">
          <RedeemCode disabled={!enabled} />
          <CreditTag className="mx-auto w-full max-w-72" />
        </div>
      </div>
    </div>
  );
};
