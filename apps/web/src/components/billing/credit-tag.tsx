"use client";

import { useTranslations } from "next-intl";

import { dropCredits, useCatalog } from "@/components/billing/catalog-provider";
import { HangTag } from "@/components/product/hang-tag";

/** What a credit buys, as the hang tag's ruled spec lines. */
export const CreditTag = ({ className = "" }: { className?: string }) => {
  const t = useTranslations("Billing.creditTag");
  const credits = (count: number) => t("credits", { count });
  const catalog = useCatalog();
  const { creditCost } = catalog;
  const drop = dropCredits(catalog);
  return (
    <HangTag
      className={className}
      footer={t("footer")}
      lines={[
        { label: t("research"), value: credits(creditCost.research) },
        { label: t("design"), value: credits(creditCost.design) },
        { label: t("assist"), value: credits(creditCost.assist) },
        ...(creditCost.video === undefined
          ? []
          : [{ label: t("video"), value: credits(creditCost.video) }]),
        ...(creditCost.adVideo === undefined
          ? []
          : [{ label: t("adVideo"), value: credits(creditCost.adVideo) }]),
        { label: t("manualDrop"), value: credits(drop.manual) },
        {
          emphasis: true,
          label: t("autopilotDrop"),
          value: credits(drop.autopilot),
        },
      ]}
      string
      subtitle={t("subtitle")}
      title={t("title")}
    />
  );
};
