import type { PlanCode } from "@wovain/billing/plans";
import { CREDIT_COST, CREDIT_PACK, PLANS } from "@wovain/billing/plans";
import { Card, CardContent } from "@wovain/ui/components/card";
import { Separator } from "@wovain/ui/components/separator";
import { cn } from "@wovain/ui/lib/utils";
import { Check } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";

// Started from the @shadcn-studio/pricing-component-01 block (a horizontal
// card: name, lead and action, a vertical rule, then the price), re-set in
// wovain's tokens. There is no annual billing yet, so the block's
// monthly/annual switch is gone. The recommended plan gets the heavier
// cochineal line; its action is the one cochineal button (the caller's).

const ORDER: PlanCode[] = ["free", "studio", "label"];

/** Credits for a drop with no autopilot: research, one design and ad copy. */
export const MANUAL_DROP_CREDITS =
  CREDIT_COST.research + CREDIT_COST.design + CREDIT_COST.assist;
/** Autopilot adds its pick and its review. */
export const AUTOPILOT_DROP_CREDITS =
  MANUAL_DROP_CREDITS + 2 * CREDIT_COST.assist;

/** Whole dollars from cents: plan prices are round. */
export const useMoney = () => {
  const format = useFormatter();
  return (cents: number) =>
    format.number(cents / 100, {
      currency: "USD",
      maximumFractionDigits: 0,
      style: "currency",
    });
};

const Feature = ({ children }: { children: ReactNode }) => (
  <li className="flex items-start gap-2">
    <Check
      aria-hidden="true"
      className="text-muted-foreground mt-0.5 size-4 shrink-0"
    />
    <span>{children}</span>
  </li>
);

const PriceDisplay = ({
  amount,
  suffix,
  className,
}: {
  amount: string;
  suffix: string;
  className?: string;
}) => (
  <p className={cn("flex items-baseline gap-1", className)}>
    <span className="font-display figures text-4xl font-semibold tracking-[-0.03em]">
      {amount}
    </span>
    <span className="text-muted-foreground text-sm">{suffix}</span>
  </p>
);

/**
 * The three plans as one stack of horizontal cards. `actions` holds each
 * plan's button or link, so the public page can link to sign-up and the app
 * can open a checkout. `current` marks the merchant's plan.
 */
export const PlanCards = ({
  actions,
  current,
  recommended = "studio",
  headingLevel = 3,
}: {
  actions: Partial<Record<PlanCode, ReactNode>>;
  current?: PlanCode | undefined;
  recommended?: PlanCode;
  headingLevel?: 2 | 3;
}) => {
  const t = useTranslations("Billing");
  const money = useMoney();
  const Heading = headingLevel === 2 ? "h2" : "h3";

  return (
    <ul className="flex flex-col gap-4">
      {ORDER.map((code) => {
        const plan = PLANS[code];
        const highlighted = code === recommended;
        const price = (
          <PriceDisplay
            amount={money(plan.priceCents)}
            suffix={t("perMonth")}
          />
        );
        return (
          <li key={code}>
            <Card
              className={cn(
                "bg-card ring-border rounded-xl shadow-none",
                highlighted && "ring-primary ring-2"
              )}
            >
              <CardContent className="flex justify-between gap-6 px-5 py-1 sm:px-6">
                <div className="flex min-w-0 flex-1 flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Heading className="font-display text-2xl font-semibold tracking-[-0.02em]">
                        {plan.name}
                      </Heading>
                      {highlighted ? (
                        <span className="border-primary text-accent-text rounded-full border px-2 py-0.5 text-xs font-medium">
                          {t("recommended")}
                        </span>
                      ) : null}
                      {current === code ? (
                        <span className="bg-muted rounded-full px-2 py-0.5 text-xs font-medium">
                          {t("currentPlan")}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-muted-foreground text-sm">
                      {t(`plans.${code}`)}
                    </p>
                  </div>
                  <div className="sm:hidden">{price}</div>
                  <ul className="flex flex-col gap-1.5 text-sm">
                    <Feature>
                      <span className="figures">
                        {t("features.credits", {
                          credits: plan.monthlyCredits,
                        })}
                      </span>
                    </Feature>
                    <Feature>
                      <span className="figures">
                        {t("features.drops", {
                          drops: Math.floor(
                            plan.monthlyCredits / MANUAL_DROP_CREDITS
                          ),
                        })}
                      </span>
                    </Feature>
                    <Feature>
                      {plan.autopilot
                        ? t("features.autopilot")
                        : t("features.manualOnly")}
                    </Feature>
                    <Feature>
                      {plan.rollover
                        ? t("features.rollover")
                        : t("features.reset")}
                    </Feature>
                  </ul>
                  {actions[code] ? (
                    <div className="flex flex-wrap items-center gap-3">
                      {actions[code]}
                    </div>
                  ) : null}
                </div>

                <Separator className="max-sm:hidden" orientation="vertical" />

                <div className="flex w-44 shrink-0 items-center justify-end max-sm:hidden">
                  {price}
                </div>
              </CardContent>
            </Card>
          </li>
        );
      })}
    </ul>
  );
};

/** The one-time credit pack, set like a plan card without the emphasis. */
export const PackCard = ({
  action,
  headingLevel = 3,
}: {
  action?: ReactNode;
  headingLevel?: 2 | 3;
}) => {
  const t = useTranslations("Billing");
  const money = useMoney();
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const price = (
    <PriceDisplay
      amount={money(CREDIT_PACK.priceCents)}
      suffix={t("pack.suffix")}
    />
  );
  return (
    <Card className="bg-card ring-border rounded-xl shadow-none">
      <CardContent className="flex justify-between gap-6 px-5 py-1 sm:px-6">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <Heading className="font-display text-xl font-semibold tracking-[-0.02em]">
            {CREDIT_PACK.name}
          </Heading>
          <p className="text-muted-foreground figures text-sm">
            {t("pack.body", { credits: CREDIT_PACK.credits })}
          </p>
          <div className="sm:hidden">{price}</div>
          {action ? (
            <div className="flex flex-wrap items-center gap-3">{action}</div>
          ) : null}
        </div>
        <Separator className="max-sm:hidden" orientation="vertical" />
        <div className="flex w-44 shrink-0 items-center justify-end max-sm:hidden">
          {price}
        </div>
      </CardContent>
    </Card>
  );
};
