import { billingCatalog } from "@wovain/billing/catalog";
import { buttonVariants } from "@wovain/ui/components/button";
import { cn } from "@wovain/ui/lib/utils";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { CreditTag } from "@/components/billing/credit-tag";
import { NotifyButton } from "@/components/billing/notify-button";
import { PackCard, PlanCards } from "@/components/billing/plan-cards";
import { JsonLd } from "@/components/json-ld";
import { CtaLink } from "@/components/marketing/cta-link";
import { faqJsonLd, FaqList } from "@/components/marketing/faq-list";
import { container } from "@/components/marketing/section";
import {
  Breadcrumbs,
  CtaBand,
  PageHero,
} from "@/components/marketing/seo-parts";
import type { Faq } from "@/content/types";
import { enterLocale, requireLocale } from "@/i18n/locale";
import { breadcrumbJsonLd, localizedUrl, pageMetadata } from "@/lib/seo";

type Props = PageProps<"/[locale]/pricing">;

export const generateMetadata = async ({
  params,
}: Props): Promise<Metadata> => {
  const locale = await requireLocale(params);
  return pageMetadata({
    descriptionKey: "pricingDescription",
    locale,
    path: "/pricing",
    titleKey: "pricingTitle",
  });
};

// Billed on the merchant's own accounts, not through wovain's credits.
const YOURS = ["fal", "meta", "fourthwall"] as const;
const FAQ_KEYS = ["credit", "yours", "paid", "rollover", "free"] as const;

const ctaClass = "h-11 rounded-lg px-4 sm:h-9";

// Only Free is on sale for now: the paid offers are listed with their
// prices, marked "Coming soon", and record interest instead of checking out.
const AVAILABLE = "https://schema.org/InStock";
const NOT_YET = "https://schema.org/PreOrder";

const PricingPage = async ({ params }: Props) => {
  const locale = await enterLocale(params);
  const seo = await getTranslations("Seo");
  const t = await getTranslations("Pricing");
  const billing = await getTranslations("Billing");
  const { creditPack, plans } = billingCatalog();
  const crumbs = [
    { name: seo("home"), path: "/" },
    { name: t("crumb"), path: "/pricing" },
  ];
  const faq: Faq[] = FAQ_KEYS.map((key) => ({
    answer: t(`faq.${key}.answer`, {
      freeCredits: plans.free.monthlyCredits,
      packCredits: creditPack.credits,
    }),
    question: t(`faq.${key}.question`),
  }));
  const offers = [
    ...Object.values(plans).map((plan) => ({
      "@type": "Offer",
      availability: plan.priceCents === 0 ? AVAILABLE : NOT_YET,
      name: plan.name,
      price: (plan.priceCents / 100).toFixed(2),
      priceCurrency: "USD",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: (plan.priceCents / 100).toFixed(2),
        priceCurrency: "USD",
        referenceQuantity: { "@type": "QuantitativeValue", unitCode: "MON" },
      },
      url: localizedUrl("/pricing", locale),
    })),
    {
      "@type": "Offer",
      availability: NOT_YET,
      name: creditPack.name,
      price: (creditPack.priceCents / 100).toFixed(2),
      priceCurrency: "USD",
      url: localizedUrl("/pricing", locale),
    },
  ];

  return (
    <>
      <JsonLd data={breadcrumbJsonLd(crumbs, locale)} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          applicationCategory: "BusinessApplication",
          name: "wovain",
          offers,
          operatingSystem: "Web",
        }}
      />
      <JsonLd data={faqJsonLd(faq)} />
      <PageHero
        aside={<CreditTag className="mx-auto mt-14 w-full max-w-72 lg:mt-20" />}
        crumbs={<Breadcrumbs items={crumbs} />}
        lead={t("lead", { credits: plans.free.monthlyCredits })}
        title={t("title")}
      />

      <div className={`${container} flex flex-col gap-20 pb-24`}>
        <section aria-labelledby="plans-title" className="flex flex-col gap-6">
          <h2
            className="font-display text-display-3 font-semibold"
            id="plans-title"
          >
            {t("plansTitle")}
          </h2>
          <PlanCards
            actions={{
              free: (
                <CtaLink
                  className={cn(buttonVariants(), ctaClass)}
                  cta="pricing-free"
                  href="/sign-up"
                  prefetch={false}
                >
                  {billing("cta.startFree")}
                </CtaLink>
              ),
              label: <NotifyButton offer="label" surface="pricing" />,
              studio: <NotifyButton offer="studio" surface="pricing" />,
            }}
            comingSoon
          />
          <PackCard
            action={<NotifyButton offer="pack" surface="pricing" />}
            comingSoon
          />
          <p className="text-muted-foreground text-sm">{t("noCut")}</p>
        </section>

        <section
          aria-labelledby="yours-title"
          className="grid gap-8 lg:grid-cols-[5fr_7fr] lg:gap-16"
        >
          <div className="flex max-w-xl flex-col gap-4">
            <h2
              className="font-display text-display-3 font-semibold"
              id="yours-title"
            >
              {t("yoursTitle")}
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              {t("yoursLead")}
            </p>
          </div>
          <dl className="border-border flex flex-col border-t">
            {YOURS.map((key) => (
              <div
                className="border-border flex flex-col gap-1 border-b py-5"
                key={key}
              >
                <dt className="font-display text-xl font-semibold tracking-[-0.02em]">
                  {t(`yours.${key}.name`)}
                </dt>
                <dd className="text-muted-foreground text-sm">
                  {t(`yours.${key}.body`)}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section
          aria-labelledby="pricing-faq-title"
          className="flex flex-col gap-6"
        >
          <h2
            className="font-display text-display-3 font-semibold"
            id="pricing-faq-title"
          >
            {t("faqTitle")}
          </h2>
          <FaqList items={faq} />
        </section>
      </div>
      <CtaBand />
    </>
  );
};

export default PricingPage;
