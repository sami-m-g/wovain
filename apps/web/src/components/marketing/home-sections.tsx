import { getLocale, getTranslations } from "next-intl/server";

import { PartnerLogo } from "@/components/marketing/partner-logo";
import AppIntegration from "@/components/shadcn-studio/blocks/app-integration-01/app-integration-01";
import CTASection from "@/components/shadcn-studio/blocks/cta-section-10/cta-section-10";
import FaqSection from "@/components/shadcn-studio/blocks/faq-component-01/faq-component-01";
import Features from "@/components/shadcn-studio/blocks/features-section-01/features-section-01";
import type { Outcome } from "@/components/shadcn-studio/blocks/features-section-01/features-section-01";
import Process from "@/components/shadcn-studio/blocks/timeline-component-07/timeline-component-07";
import type { Faq } from "@/content/types";
import { ENV } from "@/env.server";
import { routing } from "@/i18n/routing";

/** A page on the docs site, in the visitor's language (English has no prefix). */
const docsHref = async (path: string) => {
  const locale = await getLocale();
  const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;
  return new URL(`${prefix}/docs/${path}`, ENV.DOCS_URL).toString();
};

/** Steps where the designer acts; the others are wovain's. */
const YOUR_STEPS = new Set([0, 2]);

interface StepCopy {
  title: string;
  body: string;
  detail: string;
}

export const HowItWorks = async () => {
  const t = await getTranslations("Home");
  const steps = t.raw("how.steps") as StepCopy[];
  return (
    <Process
      eyebrow={t("how.eyebrow")}
      id="how"
      lead={t("how.lead")}
      steps={steps.map((step, index) => {
        const yours = YOUR_STEPS.has(index);
        return {
          ...step,
          actor: yours ? t("how.you") : t("how.wovain"),
          yours,
        };
      })}
      title={t("how.title")}
    />
  );
};

const CONNECTORS = [
  { key: "fourthwall", name: "Fourthwall" },
  { key: "fal", name: "fal" },
  { key: "meta", name: "Meta" },
] as const;

export const Connectors = async () => {
  const t = await getTranslations("Home");
  return (
    <AppIntegration
      connectors={CONNECTORS.map(({ key, name }) => ({
        body: t(`connectors.${key}.body`),
        key,
        logo: <PartnerLogo name={key} />,
        name,
        role: t(`connectors.${key}.role`),
      }))}
      eyebrow={t("connectors.eyebrow")}
      id="connectors"
      lead={t("connectors.lead")}
      link={{
        href: await docsHref("connecting-accounts"),
        label: t("connectors.link"),
      }}
      title={t("connectors.title")}
    />
  );
};

export const Outcomes = async () => {
  const t = await getTranslations("Home");
  return (
    <Features
      eyebrow={t("outcomes.eyebrow")}
      id="outcomes"
      lead={t("outcomes.lead")}
      outcomes={t.raw("outcomes.items") as Outcome[]}
      title={t("outcomes.title")}
    />
  );
};

export const HomeFaq = async ({ items }: { items: Faq[] }) => {
  const t = await getTranslations("Home");
  return (
    <FaqSection
      eyebrow={t("faqSection.eyebrow")}
      id="faq"
      items={items}
      lead={t("faqSection.lead")}
      more={{ href: await docsHref("faq"), label: t("faqSection.more") }}
      title={t("faqSection.title")}
    />
  );
};

export const ClosingCta = async () => {
  const t = await getTranslations("Home");
  return (
    <CTASection
      body={t("cta.body")}
      id="cta"
      primary={{ href: "/sign-up", label: t("cta.button") }}
      secondary={{ href: "/pricing", label: t("cta.secondary") }}
      title={t("cta.title")}
    />
  );
};
