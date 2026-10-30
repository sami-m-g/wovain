import { billingCatalog } from "@wovain/billing/catalog";
import { buttonVariants } from "@wovain/ui/components/button";
import { cn } from "@wovain/ui/lib/utils";
import { ArrowRight, Check, ShieldCheck, TrendingUp } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { NotifyButton } from "@/components/billing/notify-button";
import { PlanCards } from "@/components/billing/plan-cards";
import { ConnectBeams } from "@/components/marketing/connect-beams";
import { CtaLink } from "@/components/marketing/cta-link";
import { PartnerLogo } from "@/components/marketing/partner-logo";
import { container, displayTitle } from "@/components/marketing/section";
import CTASection from "@/components/shadcn-studio/blocks/cta-section-10/cta-section-10";
import FaqSection from "@/components/shadcn-studio/blocks/faq-component-01/faq-component-01";
import type { Faq } from "@/content/types";
import { ENV } from "@/env.server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

/** A page on the docs site, in the visitor's language (English has no prefix). */
const docsHref = async (path: string) => {
  const locale = await getLocale();
  const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;
  return new URL(`${prefix}/docs/${path}`, ENV.DOCS_URL).toString();
};

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

/** The steps of today's flow, in the order the app runs them. */
const HOW_STEPS = ["pick", "review", "design", "publish", "campaign"] as const;

/** Home pick to paused campaign, in five steps. */
export const HowItWorks = async () => {
  const t = await getTranslations("Home");
  const guide = await docsHref("getting-started");
  return (
    <section
      aria-labelledby="how-it-works-title"
      className="scroll-mt-20 py-16 sm:py-24"
      id="how-it-works"
    >
      <div className={cn(container, "flex flex-col gap-10 sm:gap-12")}>
        <SectionHead
          id="how-it-works"
          lead={t("how.lead")}
          title={t("how.title")}
        >
          <a
            className="text-foreground inline-flex min-h-11 w-fit items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
            href={guide}
          >
            {t("how.guide")}
            <ArrowRight
              aria-hidden="true"
              className="size-3.5 rtl:rotate-180"
            />
          </a>
        </SectionHead>
        <ol className="grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-5">
          {HOW_STEPS.map((step, index) => (
            <li
              className="border-border flex flex-col gap-3 border-t pt-5"
              key={step}
            >
              <span
                aria-hidden="true"
                className="font-display figures text-primary text-sm font-semibold"
              >
                {index + 1}
              </span>
              <h3 className="font-display text-lg leading-snug font-semibold tracking-[-0.015em] text-balance">
                {t(`how.steps.${step}.title`)}
              </h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {t(`how.steps.${step}.body`)}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
};

/** One column of the proof section: a heading and its list of facts. */
const ProofList = ({
  icon,
  title,
  items,
  children,
}: {
  icon: ReactNode;
  title: string;
  items: string[];
  children?: ReactNode;
}) => (
  <div className="bg-card border-border flex flex-col gap-5 rounded-2xl border p-6 sm:p-8">
    <h3 className="font-display flex items-center gap-2.5 text-xl font-semibold tracking-[-0.02em]">
      {icon}
      {title}
    </h3>
    <ul className="flex flex-col gap-3.5">
      {items.map((item) => (
        <li
          className="flex items-start gap-3 text-[0.95rem] leading-relaxed"
          key={item}
        >
          <Check
            aria-hidden="true"
            className="text-success mt-1 size-4 shrink-0"
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
    {children}
  </div>
);

/** Why an idea should sell, and what keeps the ad spend safe. */
export const Proof = async () => {
  const t = await getTranslations("Home");
  return (
    <section
      aria-labelledby="proof-title"
      className="bg-muted/40 border-border scroll-mt-20 border-y py-16 sm:py-24"
      id="proof"
    >
      <div className={cn(container, "flex flex-col gap-10 sm:gap-12")}>
        <SectionHead
          id="proof"
          lead={t("proof.lead")}
          title={t("proof.title")}
        />
        <div className="grid gap-6 md:grid-cols-2">
          <ProofList
            icon={
              <TrendingUp aria-hidden="true" className="text-primary size-5" />
            }
            items={t.raw("proof.evidence.items") as string[]}
            title={t("proof.evidence.title")}
          />
          <ProofList
            icon={
              <ShieldCheck aria-hidden="true" className="text-success size-5" />
            }
            items={t.raw("proof.spend.items") as string[]}
            title={t("proof.spend.title")}
          >
            <p className="text-muted-foreground border-border border-t pt-4 text-sm">
              {t("proof.spend.note")}
            </p>
          </ProofList>
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
      className="scroll-mt-20 py-16 sm:py-24"
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
            className="text-accent-text inline-flex min-h-11 w-fit items-center gap-1 text-sm font-medium hover:underline"
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

const planAction = "h-11 rounded-lg px-4 sm:h-9";

/** The plans, from the billing catalog: Free now, the paid plans soon. */
export const HomePricing = async () => {
  const t = await getTranslations("Home");
  const billing = await getTranslations("Billing");
  return (
    <section
      aria-labelledby="pricing-title"
      className="scroll-mt-20 py-16 sm:py-24"
      id="pricing"
    >
      <div className={cn(container, "flex flex-col gap-10")}>
        <SectionHead
          id="pricing"
          lead={t("pricing.lead", {
            credits: billingCatalog().plans.free.monthlyCredits,
          })}
          title={t("pricing.title")}
        >
          <Link
            className="text-foreground inline-flex min-h-11 w-fit items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
            href="/pricing"
          >
            {t("pricing.link")}
            <ArrowRight
              aria-hidden="true"
              className="size-3.5 rtl:rotate-180"
            />
          </Link>
        </SectionHead>
        <PlanCards
          actions={{
            free: (
              <CtaLink
                className={cn(buttonVariants(), planAction)}
                cta="home-pricing-free"
                href="/sign-up"
                prefetch={false}
              >
                {billing("cta.startFree")}
              </CtaLink>
            ),
            label: <NotifyButton offer="label" surface="home" />,
            studio: <NotifyButton offer="studio" surface="home" />,
          }}
          comingSoon
        />
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
