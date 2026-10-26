import { PLANS } from "@wovain/billing/plans";
import { BlurFade } from "@wovain/ui/components/blur-fade";
import { Button, buttonVariants } from "@wovain/ui/components/button";
import { cn } from "@wovain/ui/lib/utils";
import { ArrowRight } from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { ConnectBeams } from "@/components/marketing/connect-beams";
import {
  AdPreview,
  BLANK_COLOURS,
  PausedBadge,
  ProductListing,
} from "@/components/marketing/demo-pieces";
import { FernStudyArt } from "@/components/marketing/example-art";
import { ExampleInsights } from "@/components/marketing/example-insights";
import { PartnerLogo } from "@/components/marketing/partner-logo";
import { container, displayTitle } from "@/components/marketing/section";
import CTASection from "@/components/shadcn-studio/blocks/cta-section-10/cta-section-10";
import FaqSection from "@/components/shadcn-studio/blocks/faq-component-01/faq-component-01";
import type { Faq } from "@/content/types";
import { ENV } from "@/env.server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { priceBreakdown } from "@/lib/pricing";

/** A page on the docs site, in the visitor's language (English has no prefix). */
const docsHref = async (path: string) => {
  const locale = await getLocale();
  const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;
  return new URL(`${prefix}/docs/${path}`, ENV.DOCS_URL).toString();
};

/** A typical tee's base cost (core's DEFAULT_BASE_COST). */
const EXAMPLE_BASE_COST = 12;
const SIZES = ["S", "M", "L", "XL"] as const;
const PICKED_SIZE = "M";
const REVEAL_STAGGER = 0.12;

/** A section's headline and its one supporting line. */
const SectionHead = ({
  id,
  title,
  lead,
  children,
}: {
  id: string;
  title: string;
  lead: string;
  children?: ReactNode;
}) => (
  <div className="flex max-w-2xl flex-col gap-3">
    <h2 className={displayTitle} id={`${id}-title`}>
      {title}
    </h2>
    <p className="text-muted-foreground text-lg leading-relaxed">{lead}</p>
    {children}
  </div>
);

/** One output of a drop, labelled, revealed as it scrolls in. */
const Result = ({
  label,
  index,
  children,
  className,
}: {
  label: string;
  index: number;
  children: ReactNode;
  className?: string;
}) => (
  <BlurFade
    className={cn("flex min-w-0 flex-col gap-3", className)}
    delay={index * REVEAL_STAGGER}
    direction="up"
    inView
    offset={16}
  >
    <p className="text-muted-foreground text-xs font-medium tracking-[0.14em] uppercase">
      {label}
    </p>
    {children}
  </BlurFade>
);

/** What one approved design becomes: the product page, the ad and the numbers. */
export const Results = async () => {
  const t = await getTranslations("Home");
  const format = await getFormatter();
  const money = (value: number) =>
    format.number(value, { currency: "USD", style: "currency" });
  const tag = priceBreakdown(EXAMPLE_BASE_COST);
  const art = <FernStudyArt className="size-full" />;
  return (
    <section
      aria-labelledby="results-title"
      className="scroll-mt-20 py-16 sm:py-24"
      id="results"
    >
      <div className={cn(container, "flex flex-col gap-10 sm:gap-14")}>
        <SectionHead
          id="results"
          lead={t("results.lead")}
          title={t("results.title")}
        />
        <div className="grid grid-cols-2 items-start gap-x-4 gap-y-8 sm:gap-8 lg:grid-cols-[1fr_1fr_1.35fr]">
          <Result index={0} label={t("results.product")}>
            <div inert>
              <ProductListing
                art={art}
                colour={BLANK_COLOURS.bone}
                detail={
                  <div className="flex flex-col gap-3 pt-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-muted-foreground me-1 text-xs max-sm:hidden">
                        {t("results.sizes")}
                      </span>
                      {SIZES.map((size) => (
                        <span
                          className={cn(
                            "grid h-7 min-w-8 place-items-center rounded-md border px-1.5 text-xs font-medium",
                            size === PICKED_SIZE
                              ? "border-foreground"
                              : "border-border text-muted-foreground"
                          )}
                          key={size}
                        >
                          {size}
                        </span>
                      ))}
                    </div>
                    <Button className="w-full" tabIndex={-1}>
                      {t("results.addToCart")}
                    </Button>
                  </div>
                }
                price={money(tag.price)}
                title={t("demo.product")}
              />
            </div>
          </Result>
          <Result index={1} label={t("results.ad")}>
            <div inert>
              <AdPreview
                photoAlt={t("results.photoAlt")}
                body={t("demo.ad.body")}
                brand={t("demo.ad.brand")}
                cta={t("demo.ad.cta")}
                footer={
                  <div className="border-border flex flex-wrap items-center gap-2 border-t p-3">
                    <PausedBadge>{t("demo.paused")}</PausedBadge>
                    <span className="text-muted-foreground text-xs max-sm:hidden">
                      {t("results.paused")}
                    </span>
                  </div>
                }
                headline={t("demo.product")}
                sponsored={t("demo.ad.sponsored")}
              />
            </div>
          </Result>
          <Result
            className="col-span-2 lg:col-span-1"
            index={2}
            label={t("results.insights")}
          >
            <ExampleInsights />
          </Result>
        </div>
      </div>
    </section>
  );
};

export const Connectors = async () => {
  const t = await getTranslations("Home");
  return (
    <section
      aria-labelledby="connectors-title"
      className="bg-card border-border scroll-mt-20 border-y py-16 sm:py-24"
      id="connectors"
    >
      <div
        className={cn(
          container,
          "grid items-center gap-12 md:grid-cols-2 md:gap-16"
        )}
      >
        <SectionHead
          id="connectors"
          lead={t("connectors.lead")}
          title={t("connectors.title")}
        >
          <a
            className="text-accent-text inline-flex w-fit items-center gap-1 text-sm font-medium hover:underline"
            href={await docsHref("connecting-accounts")}
          >
            {t("connectors.link")}
            <ArrowRight aria-hidden="true" className="size-4 rtl:rotate-180" />
          </a>
        </SectionHead>
        <ConnectBeams
          services={[
            {
              key: "fourthwall",
              logo: <PartnerLogo name="fourthwall" />,
              name: "Fourthwall",
              role: t("connectors.fourthwall.role"),
            },
            {
              key: "fal",
              logo: <PartnerLogo name="fal" />,
              name: "fal",
              role: t("connectors.fal.role"),
            },
            {
              key: "meta",
              logo: <PartnerLogo name="meta" />,
              name: "Meta",
              role: t("connectors.meta.role"),
            },
          ]}
        />
      </div>
    </section>
  );
};

export const FreeToStart = async () => {
  const t = await getTranslations("Home");
  return (
    <section aria-labelledby="free-title" className="py-16 sm:py-20">
      <div
        className={cn(
          container,
          "flex flex-col items-start justify-between gap-6 md:flex-row md:items-end"
        )}
      >
        <SectionHead
          id="free"
          lead={t("free.body", { credits: PLANS.free.monthlyCredits })}
          title={t("free.title")}
        />
        <Link
          className={cn(
            buttonVariants({ variant: "outline" }),
            "h-11 shrink-0 rounded-xl px-5"
          )}
          href="/pricing"
        >
          {t("free.link")}
          <ArrowRight
            aria-hidden="true"
            className="rtl:rotate-180"
            data-icon="inline-end"
          />
        </Link>
      </div>
    </section>
  );
};

export const HomeFaq = async ({ items }: { items: Faq[] }) => {
  const t = await getTranslations("Home");
  return (
    <FaqSection
      id="faq"
      items={items}
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
