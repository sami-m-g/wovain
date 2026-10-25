import { buttonVariants } from "@wovain/ui/components/button";
import { cn } from "@wovain/ui/lib/utils";
import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { JsonLd } from "@/components/json-ld";
import { BriefForm } from "@/components/marketing/brief-form";
import { CopyField } from "@/components/marketing/copy-field";
import { CtaLink } from "@/components/marketing/cta-link";
import { FaqList, faqJsonLd } from "@/components/marketing/faq-list";
import {
  Autopilot,
  ChatGptApp,
  HowItWorks,
  IntegrationsList,
  Pricing,
  UseCaseLinks,
} from "@/components/marketing/home-sections";
import { ProductWindow } from "@/components/marketing/product-window";
import { container, displayTitle } from "@/components/marketing/section";
import { getContent } from "@/content/load";
import type { Faq } from "@/content/types";
import { ENV } from "@/env.server";
import { routing } from "@/i18n/routing";
import { localizedUrl, mcpUrl, pageMetadata, siteUrl } from "@/lib/seo";

export const generateMetadata = async ({
  params,
}: PageProps<"/[locale]">): Promise<Metadata> => {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    return {};
  }
  return pageMetadata({ locale, path: "/", titleKey: "defaultTitle" });
};

const HomePage = async ({ params }: PageProps<"/[locale]">) => {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const t = await getTranslations("Home");
  const meta = await getTranslations("Metadata");
  const content = await getContent(locale);
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
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
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
        className="overflow-x-clip pt-10 pb-20 sm:pt-14"
      >
        <div className={container}>
          <div className="flex max-w-3xl flex-col gap-5">
            <h1
              className="font-display text-display-1 font-semibold text-balance"
              id="hero-title"
            >
              {t("heroTitle")}
            </h1>
            <p className="text-muted-foreground max-w-[58ch] text-lg leading-relaxed sm:text-xl">
              {t("heroLead")}
            </p>
            <BriefForm />
            <p className="text-muted-foreground text-sm">{t("noCard")}</p>
          </div>
          <div className="mt-10 sm:mt-12">
            <ProductWindow />
          </div>
        </div>
      </section>

      <HowItWorks />
      <Autopilot />
      <ChatGptApp copyField={<CopyField value={mcpUrl} />} />
      <IntegrationsList integrations={content.integrations} />
      <Pricing />
      <UseCaseLinks cases={content.cases} />

      <section
        aria-labelledby="faq-title"
        className="border-border scroll-mt-20 border-t py-20 sm:py-28"
        id="faq"
      >
        <div
          className={`${container} grid gap-10 md:grid-cols-[5fr_7fr] md:gap-16`}
        >
          <h2 className={displayTitle} id="faq-title">
            {t("faqTitle")}
          </h2>
          <FaqList items={faq} />
        </div>
      </section>

      <section
        aria-labelledby="cta-title"
        className="bg-foreground text-background"
      >
        <div className={`${container} flex flex-col gap-8 py-20 sm:py-28`}>
          <h2 className={`${displayTitle} max-w-3xl`} id="cta-title">
            {t("ctaTitle")}
          </h2>
          <p className="max-w-[55ch] text-lg opacity-80">{t("ctaBody")}</p>
          <div className="flex flex-wrap items-center gap-3">
            <CtaLink
              cta="closing-sign-up"
              className={cn(
                buttonVariants(),
                "bg-background text-foreground hover:bg-background/90 h-12 rounded-xl px-6 text-[0.95rem]"
              )}
              href="/sign-up"
              prefetch={false}
            >
              {t("ctaButton")}
            </CtaLink>
            <CtaLink
              cta="closing-login"
              className={cn(
                buttonVariants({ variant: "ghost" }),
                "text-background hover:bg-background/10 hover:text-background h-12 rounded-xl px-5 text-[0.95rem] underline-offset-4 hover:underline"
              )}
              href="/login"
              prefetch={false}
            >
              {t("ctaSecondary")}
            </CtaLink>
          </div>
        </div>
      </section>
    </>
  );
};

export default HomePage;
