import { CREDIT_COST } from "@wovain/billing/plans";
import { useTranslations } from "next-intl";

import {
  AUTOPILOT_DROP_CREDITS,
  MANUAL_DROP_CREDITS,
} from "@/components/billing/plan-cards";
import { HangTag } from "@/components/product/hang-tag";

/** What a credit buys, as the hang tag's ruled spec lines. */
export const CreditTag = ({ className = "" }: { className?: string }) => {
  const t = useTranslations("Billing.creditTag");
  const credits = (count: number) => t("credits", { count });
  return (
    <HangTag
      className={className}
      footer={t("footer")}
      lines={[
        { label: t("research"), value: credits(CREDIT_COST.research) },
        { label: t("design"), value: credits(CREDIT_COST.design) },
        { label: t("assist"), value: credits(CREDIT_COST.assist) },
        { label: t("manualDrop"), value: credits(MANUAL_DROP_CREDITS) },
        {
          emphasis: true,
          label: t("autopilotDrop"),
          value: credits(AUTOPILOT_DROP_CREDITS),
        },
      ]}
      string
      subtitle={t("subtitle")}
      title={t("title")}
    />
  );
};
