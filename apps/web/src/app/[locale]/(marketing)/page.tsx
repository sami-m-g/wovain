import { BlurFade } from "@wovain/ui/components/blur-fade";
import { ArrowDown } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { JsonLd } from "@/components/json-ld";
import { BriefForm } from "@/components/marketing/brief-form";
import { faqJsonLd } from "@/components/marketing/faq-list";
import {
  ClosingCta,
  Connectors,
  HomeFaq,
  HowItWorks,
  Outcomes,
} from "@/components/marketing/home-sections";
import { ProductWindow } from "@/components/marketing/product-window";
import { container, Eyebrow } from "@/components/marketing/section";
import type { Faq } from "@/content/types";
import { ENV } from "@/env.server";
import { enterLocale, requireLocale } from "@/i18n/locale";
import { Link } from "@/i18n/navigation";
import { localizedUrl, pageMetadata, siteUrl } from "@/lib/seo";

/** Seconds before the product picture settles in under the headline. */
const PRODUCT_DELAY = 0.15;

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
        className="overflow-x-clip pt-12 pb-20 sm:pt-20"
      >
        <div className={container}>
          <div className="flex max-w-3xl flex-col gap-6">
            <Eyebrow>{t("eyebrow")}</Eyebrow>
            <h1
              className="font-display text-display-1 font-semibold text-balance"
              id="hero-title"
            >
              {t("heroTitle")}
            </h1>
            <p className="text-muted-foreground max-w-[58ch] text-lg leading-relaxed sm:text-xl">
              {t("heroLead")}
            </p>
            <div>
              <BriefForm />
              <div className="text-muted-foreground mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                <span>{t("heroNote")}</span>
                <Link
                  className="text-foreground inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
                  href={{ hash: "how", pathname: "/" }}
                >
                  {t("heroSecondary")}
                  <ArrowDown aria-hidden="true" className="size-3.5" />
                </Link>
              </div>
            </div>
          </div>
          <BlurFade
            className="mt-12 sm:mt-16"
            delay={PRODUCT_DELAY}
            direction="up"
            offset={16}
          >
            <ProductWindow />
          </BlurFade>
        </div>
      </section>

      <HowItWorks />
      <Connectors />
      <Outcomes />
      <HomeFaq items={faq} />
      <ClosingCta />
    </>
  );
};

export default HomePage;
