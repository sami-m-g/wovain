import { billingCatalog } from "@wovain/billing/catalog";
import { BlurFade } from "@wovain/ui/components/blur-fade";
import { Button, buttonVariants } from "@wovain/ui/components/button";
import { cn } from "@wovain/ui/lib/utils";
import { ArrowRight } from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { ConnectBeams } from "@/components/marketing/connect-beams";
import {
  AdPreview,
  MOCKUPS,
  PausedBadge,
  ProductListing,
} from "@/components/marketing/demo-pieces";
import { ExampleInsights } from "@/components/marketing/example-insights";
import { PartnerLogo } from "@/components/marketing/partner-logo";
import { container, displayTitle } from "@/components/marketing/section";
import CTASection from "@/components/shadcn-studio/blocks/cta-section-10/cta-section-10";
import FaqSection from "@/components/shadcn-studio/blocks/faq-component-01/faq-component-01";
import type { Faq } from "@/content/types";
import { ENV } from "@/env.server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { exampleTee } from "@/lib/pricing";

/** A page on the docs site, in the visitor's language (English has no prefix). */
const docsHref = async (path: string) => {
  const locale = await getLocale();
  const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;
  return new URL(`${prefix}/docs/${path}`, ENV.DOCS_URL).toString();
};

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
  const tag = exampleTee();
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
                image={MOCKUPS.fern}
                imageAlt={t("results.mockupAlt")}
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
            <ExampleInsights tee={tag} />
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
          lead={t("free.body", {
            credits: billingCatalog().plans.free.monthlyCredits,
          })}
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

const HOW_STEPS = [
  "sell",
  "store",
  "meta",
  "design",
  "ads",
  "campaign",
] as const;

/** The one guided flow: sign-in to a running campaign in about 10 minutes. */
export const HowItWorks = async () => {
  const t = await getTranslations("Home");
  const guide = await docsHref("getting-started");
  return (
    <section
      aria-labelledby="how-it-works-title"
      className="scroll-mt-20 py-16 sm:py-20"
      id="how-it-works"
    >
      <div className={cn(container, "flex flex-col gap-10")}>
        <SectionHead
          id="how-it-works"
          lead={t("how.lead")}
          title={t("how.title")}
        >
          <a
            className="text-foreground inline-flex min-h-11 items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
            href={guide}
          >
            {t("how.guide")}
            <ArrowRight
              aria-hidden="true"
              className="size-3.5 rtl:rotate-180"
            />
          </a>
        </SectionHead>
        <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {HOW_STEPS.map((step, index) => (
            <li className="flex gap-4" key={step}>
              <span
                aria-hidden="true"
                className="font-display figures bg-muted flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
              >
                {index + 1}
              </span>
              <div className="flex flex-col gap-1">
                <h3 className="font-display text-base font-semibold">
                  {t(`how.steps.${step}.title`)}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {t(`how.steps.${step}.body`)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
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
