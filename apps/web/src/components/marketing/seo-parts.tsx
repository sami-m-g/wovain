import { cn } from "@wovain/ui/lib/utils";
import { ArrowRight, ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { BriefForm } from "@/components/marketing/brief-form";
import { container, displayTitle } from "@/components/marketing/section";
import type { Step } from "@/content/types";
import { Link } from "@/i18n/navigation";

export interface Crumb {
  name: string;
  path: string;
}

/** Visible breadcrumbs; the last crumb is the current page. */
export const Breadcrumbs = async ({ items }: { items: Crumb[] }) => {
  const t = await getTranslations("Seo");
  return (
    <nav aria-label={t("breadcrumbLabel")}>
      <ol className="text-muted-foreground flex flex-wrap items-center gap-1 text-sm">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li className="flex items-center gap-1" key={item.path}>
              {last ? (
                <span aria-current="page" className="text-foreground">
                  {item.name}
                </span>
              ) : (
                <Link
                  className="hover:text-foreground hover:underline"
                  href={item.path}
                >
                  {item.name}
                </Link>
              )}
              {last ? null : (
                <ChevronRight
                  aria-hidden="true"
                  className="size-3.5 rtl:rotate-180"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

/** The top of a public content page: breadcrumbs, the H1, its lead and an optional aside. */
export const PageHero = ({
  crumbs,
  title,
  lead,
  aside,
  children,
}: {
  crumbs: ReactNode;
  title: string;
  lead: string;
  aside?: ReactNode;
  children?: ReactNode;
}) => (
  <section className="pt-10 pb-16 sm:pt-14 sm:pb-20">
    <div
      className={cn(
        container,
        "grid gap-12",
        aside ? "lg:grid-cols-[1fr_20rem] lg:items-start lg:gap-16" : ""
      )}
    >
      <div className="flex max-w-3xl flex-col gap-6">
        {crumbs}
        <h1 className="font-display text-display-2 font-semibold text-balance">
          {title}
        </h1>
        <p className="text-muted-foreground max-w-[60ch] text-lg leading-relaxed sm:text-xl">
          {lead}
        </p>
        {children}
      </div>
      {aside}
    </div>
  </section>
);

/** Steps as one continuous ribbon, a passage per step. */
export const StepRibbon = ({ steps }: { steps: Step[] }) => (
  <ol className="flex flex-col">
    {steps.map((step, index) => (
      <li
        className="grid grid-cols-[1.25rem_1fr] gap-x-5 sm:gap-x-8"
        key={step.title}
      >
        <span
          aria-hidden="true"
          className={cn(
            "bg-foreground/40 w-px justify-self-center",
            index === 0 && "rounded-t-full",
            index === steps.length - 1 && "rounded-b-full"
          )}
        />
        <div className="border-border flex flex-col gap-2 border-b py-6 first:pt-0">
          <h3 className="font-display text-xl font-semibold tracking-[-0.02em]">
            {step.title}
          </h3>
          <p className="text-muted-foreground max-w-[62ch] leading-relaxed">
            {step.body}
          </p>
        </div>
      </li>
    ))}
  </ol>
);

/** A titled block inside a content page, on the shared grid. */
export const ContentBlock = ({
  id,
  title,
  children,
  className,
}: {
  id: string;
  title: string;
  children: ReactNode;
  className?: string;
}) => (
  <section
    aria-labelledby={`${id}-title`}
    className={cn(
      "border-border scroll-mt-20 border-t py-16 sm:py-20",
      className
    )}
    id={id}
  >
    <div
      className={cn(container, "grid gap-8 md:grid-cols-[4fr_8fr] md:gap-16")}
    >
      <h2
        className="font-display text-display-3 font-semibold"
        id={`${id}-title`}
      >
        {title}
      </h2>
      <div>{children}</div>
    </div>
  </section>
);

/** A linked row in a ruled list. */
export const RowLink = ({
  href,
  title,
  body,
  meta,
}: {
  href: string;
  title: string;
  body: string;
  meta?: ReactNode;
}) => (
  <Link
    className="group flex items-start justify-between gap-6 py-6"
    href={href}
  >
    <span className="flex flex-col gap-1">
      <span className="font-display text-xl font-semibold tracking-[-0.02em] group-hover:underline">
        {title}
      </span>
      <span className="text-muted-foreground text-sm leading-relaxed">
        {body}
      </span>
      {meta}
    </span>
    <ArrowRight
      aria-hidden="true"
      className="text-muted-foreground mt-1.5 size-4 shrink-0 transition-transform group-hover:translate-x-1 rtl:rotate-180"
    />
  </Link>
);

/** The closing band: a working brief form, pre-filled when the page has an example. */
export const CtaBand = async ({ brief }: { brief?: string }) => {
  const t = await getTranslations("Seo");
  return (
    <section
      aria-labelledby="cta-title"
      className="bg-foreground text-background"
    >
      <div className={cn(container, "flex flex-col gap-6 py-20 sm:py-24")}>
        <h2 className={cn(displayTitle, "max-w-3xl")} id="cta-title">
          {t("ctaTitle")}
        </h2>
        <p className="max-w-[55ch] text-lg opacity-80">{t("ctaBody")}</p>
        <BriefForm
          className="text-foreground"
          defaultValue={brief}
          id="cta-brief"
        />
      </div>
    </section>
  );
};
