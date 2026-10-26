import { cn } from "@wovain/ui/lib/utils";
import { ArrowRight, ArrowUpRight, Check, X } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { MossFernArt } from "@/components/marketing/example-art";
import { PriceTable } from "@/components/marketing/price-table";
import {
  container,
  displayTitle,
  Section,
} from "@/components/marketing/section";
import type {
  IntegrationSlug,
  SiteContent,
  UseCaseSlug,
} from "@/content/types";
import { INTEGRATION_SLUGS, USE_CASE_SLUGS } from "@/content/types";
import { Link } from "@/i18n/navigation";

const STEPS = [
  "brief",
  "trends",
  "designs",
  "approve",
  "fourthwall",
  "meta",
] as const;
/** The tape's own stage names; "approve" is the stop inside Designs. */
const STAGE_OF = {
  brief: "brief",
  designs: "designs",
  fourthwall: "products",
  meta: "campaign",
  trends: "trends",
} as const;

/** Steps where the creator acts: the only passages dyed cochineal. */
const YOUR_STEPS = new Set<(typeof STEPS)[number]>(["brief", "approve"]);

/** How a drop gets made: one continuous ribbon, a passage per step. */
export const HowItWorks = async () => {
  const t = await getTranslations("Home");
  const stages = await getTranslations("Stages");
  const stepName = (key: (typeof STEPS)[number]) =>
    key === "approve" ? t("steps.approve.name") : stages(STAGE_OF[key]);
  return (
    <section
      aria-labelledby="how-title"
      className="border-border scroll-mt-20 border-t py-20 sm:py-28"
      id="how"
    >
      <div
        className={cn(
          container,
          "grid gap-10 md:grid-cols-[5fr_7fr] md:gap-16"
        )}
      >
        <div>
          <div className="flex flex-col gap-4 md:sticky md:top-28">
            <h2 className={displayTitle} id="how-title">
              {t("howTitle")}
            </h2>
            <p className="text-muted-foreground text-lg leading-relaxed">
              {t("howLead")}
            </p>
          </div>
        </div>
        <ol className="flex flex-col">
          {STEPS.map((key, index) => {
            const yours = YOUR_STEPS.has(key);
            return (
              <li
                className="grid grid-cols-[1.25rem_1fr] gap-x-5 sm:gap-x-8"
                key={key}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "justify-self-center",
                    yours ? "bg-primary w-[3px]" : "bg-foreground/40 w-px",
                    index === 0 && "rounded-t-full",
                    index === STEPS.length - 1 && "rounded-b-full"
                  )}
                />
                <div className="border-border flex flex-col gap-3 border-b py-8 first:pt-0">
                  <h3 className="font-display text-display-3 font-semibold">
                    {stepName(key)}
                  </h3>
                  <p className="text-muted-foreground max-w-[60ch] leading-relaxed">
                    {t(`steps.${key}.body`)}
                  </p>
                  <dl className="grid gap-x-8 gap-y-2 pt-1 text-sm sm:grid-cols-[1fr_auto]">
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-muted-foreground text-xs">
                        {t("seeLabel")}
                      </dt>
                      <dd>{t(`steps.${key}.see`)}</dd>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-muted-foreground text-xs">
                        {t("byLabel")}
                      </dt>
                      <dd
                        className={cn(
                          "font-medium",
                          yours && "text-accent-text"
                        )}
                      >
                        {t(`steps.${key}.by`)}
                      </dd>
                    </div>
                  </dl>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
};

/** Autopilot: the same tape twice, the approval passage marked. */
export const Autopilot = async () => {
  const t = await getTranslations("Home");
  const stages = await getTranslations("Stages");
  const stepName = (key: (typeof STEPS)[number]) =>
    key === "approve" ? t("steps.approve.name") : stages(STAGE_OF[key]);
  const rows = [
    { auto: false, label: t("autopilotManual") },
    { auto: true, label: t("autopilotAuto") },
  ];
  return (
    <Section
      className="bg-card border-border border-y"
      id="autopilot"
      lead={t("autopilotLead")}
      title={t("autopilotTitle")}
    >
      <div className="mt-12 flex flex-col gap-8">
        {rows.map(({ auto, label }) => (
          <div className="flex flex-col gap-3" key={label}>
            <h3 className="text-sm font-semibold">{label}</h3>
            <ol className="grid grid-cols-3 gap-px overflow-hidden rounded-xl sm:grid-cols-6">
              {STEPS.map((key) => {
                const stop = key === "approve";
                return (
                  <li
                    className={cn(
                      "flex min-h-12 flex-col justify-center gap-0.5 px-3 py-2 text-sm",
                      stop && !auto && "bg-primary text-primary-foreground",
                      stop &&
                        auto &&
                        "text-muted-foreground border-input rounded-sm border border-dashed",
                      !stop && "bg-foreground text-background"
                    )}
                    key={key}
                  >
                    <span className="font-medium">{stepName(key)}</span>
                    {stop ? (
                      <span className="text-xs leading-snug">
                        {auto ? t("autopilotSkip") : t("autopilotStop")}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>
    </Section>
  );
};

/** The ChatGPT app: how to add it, and what a conversation looks like. */
export const ChatGptApp = async ({
  copyField,
}: {
  copyField: React.ReactNode;
}) => {
  const t = await getTranslations("Home");
  const steps = t.raw("chatgptSteps") as string[];
  return (
    <Section id="chatgpt" lead={t("chatgptLead")} title={t("chatgptTitle")}>
      <div className="mt-12 grid items-start gap-12 lg:grid-cols-2">
        <div className="flex flex-col gap-8">
          <ol className="flex flex-col gap-4">
            {steps.map((step, index) => (
              <li className="flex items-start gap-4" key={step}>
                <span className="border-border figures grid size-7 shrink-0 place-items-center rounded-full border text-sm font-medium">
                  {index + 1}
                </span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
          {copyField}
        </div>
        <figure>
          <div
            aria-label={t("chatLabel")}
            className="border-border bg-background shadow-raised flex flex-col gap-4 rounded-2xl border p-5 sm:p-6"
            inert
          >
            <p className="bg-muted ms-auto max-w-[85%] rounded-2xl rounded-ee-md px-4 py-3 text-sm">
              {t("chatUser")}
            </p>
            <p className="max-w-[92%] text-sm leading-relaxed">
              {t("chatAssistant")}
            </p>
            <div className="border-border bg-card flex max-w-sm gap-3 rounded-xl border p-3">
              <MossFernArt className="size-20 shrink-0 rounded-lg" />
              <div className="flex min-w-0 flex-col justify-between gap-2">
                <span className="text-sm font-medium">{t("chatCard")}</span>
                <span className="flex gap-2">
                  <span className="bg-primary text-primary-foreground inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-xs font-medium">
                    <Check aria-hidden="true" className="size-3" />
                    {t("chatApprove")}
                  </span>
                  <span className="border-input inline-flex h-7 items-center gap-1 rounded-md border px-2.5 text-xs font-medium">
                    <X aria-hidden="true" className="size-3" />
                    {t("chatChange")}
                  </span>
                </span>
              </div>
            </div>
          </div>
          <figcaption className="text-muted-foreground mt-3 flex items-center gap-2 text-xs">
            <span className="border-border rounded-full border px-2 py-0.5 font-medium">
              {t("example")}
            </span>
            {t("chatLabel")}
          </figcaption>
        </figure>
      </div>
    </Section>
  );
};

/** Integrations as a care label: name, what it is, who connects it. */
export const IntegrationsList = async ({
  integrations,
}: {
  integrations: SiteContent["integrations"];
}) => {
  const t = await getTranslations("Home");
  return (
    <Section
      aside={
        <Link
          className="text-accent-text inline-flex shrink-0 items-center gap-1 text-sm font-medium hover:underline"
          href="/integrations"
        >
          {t("integrationsAll")}
          <ArrowRight aria-hidden="true" className="size-4 rtl:rotate-180" />
        </Link>
      }
      className="border-border border-t"
      id="integrations"
      lead={t("integrationsLead")}
      title={t("integrationsTitle")}
    >
      <ul className="border-border mt-12 grid border-t md:grid-cols-2 md:gap-x-10">
        {INTEGRATION_SLUGS.map((slug: IntegrationSlug) => {
          const item = integrations[slug];
          return (
            <li className="border-border border-b" key={slug}>
              <Link
                className="group flex min-h-20 items-center justify-between gap-4 py-4"
                href={`/integrations/${slug}`}
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-medium group-hover:underline">
                    {item.name}
                  </span>
                  <span className="text-muted-foreground truncate text-sm">
                    {item.category}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-medium",
                      item.connection === "yours"
                        ? "bg-accent-soft text-accent-text"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {t(`connection.${item.connection}`)}
                  </span>
                  <ArrowUpRight
                    aria-hidden="true"
                    className="text-muted-foreground size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 rtl:-scale-x-100"
                  />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Section>
  );
};

const COSTS = ["wovain", "products", "ads"] as const;

/** What it costs: three honest lines and the price table from the real rule. */
export const Pricing = async () => {
  const t = await getTranslations("Home");
  return (
    <Section
      className="border-border border-t"
      id="pricing"
      lead={t("pricingLead")}
      title={t("pricingTitle")}
    >
      <div className="mt-12 grid gap-12 lg:grid-cols-[5fr_7fr] lg:gap-16">
        <dl className="border-border flex flex-col border-t">
          {COSTS.map((key) => (
            <div
              className="border-border flex flex-col gap-1 border-b py-5"
              key={key}
            >
              <dt className="font-display text-2xl font-semibold tracking-[-0.02em]">
                {t(`costs.${key}.name`)}
              </dt>
              <dd className="flex flex-col gap-1">
                <span className="text-lg font-medium">
                  {t(`costs.${key}.value`)}
                </span>
                <span className="text-muted-foreground text-sm">
                  {t(`costs.${key}.body`)}
                </span>
              </dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-col gap-4">
          <PriceTable caption={t("tableCaption")} />
          <p className="text-muted-foreground text-xs leading-relaxed">
            {t("tableNote")}
          </p>
          <Link
            className="text-accent-text inline-flex w-fit items-center gap-1 text-sm font-medium hover:underline"
            href="/pricing"
          >
            {t("pricingPlans")}
            <ArrowRight aria-hidden="true" className="size-4 rtl:rotate-180" />
          </Link>
          <Link
            className="text-accent-text inline-flex w-fit items-center gap-1 text-sm font-medium hover:underline"
            href="/guides/price-print-on-demand-merch"
          >
            {t("pricingGuide")}
            <ArrowRight aria-hidden="true" className="size-4 rtl:rotate-180" />
          </Link>
        </div>
      </div>
    </Section>
  );
};

/** Use cases: one ruled list, linked to each page. */
export const UseCaseLinks = async ({
  cases,
}: {
  cases: SiteContent["cases"];
}) => {
  const t = await getTranslations("Home");
  return (
    <Section
      className="border-border border-t"
      id="use-cases"
      lead={t("useCasesLead")}
      title={t("useCasesTitle")}
    >
      <ul className="border-border mt-12 grid border-t sm:grid-cols-2 sm:gap-x-10">
        {USE_CASE_SLUGS.map((slug: UseCaseSlug) => (
          <li className="border-border border-b" key={slug}>
            <Link
              className="group flex items-start justify-between gap-6 py-6"
              href={`/use-cases/${slug}`}
            >
              <span className="flex flex-col gap-1">
                <span className="font-display text-xl font-semibold tracking-[-0.02em] group-hover:underline">
                  {cases[slug].name}
                </span>
                <span className="text-muted-foreground text-sm leading-relaxed">
                  {cases[slug].lead}
                </span>
              </span>
              <ArrowRight
                aria-hidden="true"
                className="text-muted-foreground mt-1.5 size-4 shrink-0 transition-transform group-hover:translate-x-1 rtl:rotate-180"
              />
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
};
