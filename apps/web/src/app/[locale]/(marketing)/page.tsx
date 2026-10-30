import { billingCatalog } from "@wovain/billing/catalog";
import { buttonVariants } from "@wovain/ui/components/button";
import { cn } from "@wovain/ui/lib/utils";
import { ArrowDown, ArrowRight, Check } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { JsonLd } from "@/components/json-ld";
import { CtaLink } from "@/components/marketing/cta-link";
import { faqJsonLd } from "@/components/marketing/faq-list";
import { HeroDemo } from "@/components/marketing/hero-demo";
import {
  ClosingCta,
  Connectors,
  HomeFaq,
  HomePricing,
  HowItWorks,
  Proof,
} from "@/components/marketing/home-sections";
import type { Faq } from "@/content/types";
import { ENV } from "@/env.server";
import { enterLocale, requireLocale } from "@/i18n/locale";
import { Link } from "@/i18n/navigation";
import { exampleTee } from "@/lib/pricing";
import { localizedUrl, pageMetadata, siteUrl } from "@/lib/seo";

export const generateMetadata = async ({
  params,
}: PageProps<"/[locale]">): Promise<Metadata> => {
  const locale = await requireLocale(params);
  return pageMetadata({ locale, path: "/", titleKey: "defaultTitle" });
};

const HomePage = async ({ params }: PageProps<"/[locale]">) => {
  const locale = await enterLocale(params);
  const t = await getTranslations("Home");
  const meta = await getTranslations("Metadata");
  const faq = t.raw("faq") as Faq[];
  const points = t.raw("heroPoints") as string[];

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      logo: new URL("/brand/app-icon.svg", siteUrl).toString(),
      name: meta("siteName"),
      sameAs: [ENV.DOCS_URL],
      url: localizedUrl("/", locale),
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      applicationCategory: "BusinessApplication",
      description: meta("defaultDescription"),
      inLanguage: locale,
      name: meta("siteName"),
      operatingSystem: "Web, ChatGPT",
      url: localizedUrl("/", locale),
    },
    faqJsonLd(faq),
  ];

  return (
    <>
      <JsonLd data={jsonLd} />

      <section
        aria-labelledby="hero-title"
        className="overflow-x-clip pt-6 pb-12 sm:pt-12 sm:pb-20"
      >
        <div className="mx-auto grid w-full max-w-7xl items-center gap-6 px-4 sm:gap-10 sm:px-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-14">
          <div className="flex flex-col gap-4 sm:gap-6">
            <h1
              className="font-display text-display-1 font-semibold text-balance lg:text-[clamp(2.5rem,0.9rem+2.6vw,3.75rem)]"
              id="hero-title"
            >
              {t("heroTitle")}
            </h1>
            <p className="text-muted-foreground max-w-[46ch] text-base leading-relaxed sm:text-lg">
              {t("heroLead")}
            </p>
            <ul className="flex flex-col gap-2 text-[0.95rem]">
              {points.map((point) => (
                <li className="flex items-start gap-2.5" key={point}>
                  <Check
                    aria-hidden="true"
                    className="text-success mt-1 size-4 shrink-0"
                  />
                  {point}
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                <CtaLink
                  className={cn(
                    buttonVariants(),
                    "h-12 rounded-xl px-6 text-[0.95rem]"
                  )}
                  cta="hero-sign-up"
                  href="/sign-up"
                  prefetch={false}
                >
                  {t("heroCta")}
                  <ArrowRight
                    aria-hidden="true"
                    className="rtl:rotate-180"
                    data-icon="inline-end"
                  />
                </CtaLink>
                <Link
                  className="text-foreground inline-flex min-h-11 items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
                  href={{ hash: "how-it-works", pathname: "/" }}
                >
                  {t("heroSecondary")}
                  <ArrowDown aria-hidden="true" className="size-3.5" />
                </Link>
              </div>
              <p className="text-muted-foreground text-sm">
                {t("heroNote", {
                  credits: billingCatalog().plans.free.monthlyCredits,
                })}
              </p>
            </div>
          </div>
          <HeroDemo
            className="lg:-me-[max(1.5rem,calc((100vw-80rem)/2+1.5rem))]"
            tag={exampleTee()}
          />
        </div>
      </section>

      <HowItWorks />
      <Proof />
      <Connectors />
      <HomePricing />
      <HomeFaq items={faq} />
      <ClosingCta />
    </>
  );
};

export default HomePage;
