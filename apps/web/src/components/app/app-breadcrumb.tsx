"use client";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@wovain/ui/components/breadcrumb";
import { cn } from "@wovain/ui/lib/utils";
import { useTranslations } from "next-intl";
import { Fragment } from "react";

import { Link, usePathname } from "@/i18n/navigation";

const SECTIONS = {
  "/dashboard/autopilot": "autopilot",
  "/dashboard/billing": "billing",
  "/dashboard/connections": "connections",
  "/dashboard/drops": "drops",
  "/dashboard/insights": "insights",
  "/dashboard/new": "newDrop",
  "/dashboard/onboarding": "onboarding",
  "/dashboard/products": "products",
} as const;

type Section = keyof typeof SECTIONS;

// A section shown under another one: a new drop is one of the drops.
const PARENTS: Partial<Record<Section, Section>> = {
  "/dashboard/new": "/dashboard/drops",
};

const isSection = (path: string): path is Section => path in SECTIONS;

/** Overview › the parent section, if any › the current section. */
export const AppBreadcrumb = () => {
  const t = useTranslations("Shell.nav");
  const pathname = usePathname();
  const parent = isSection(pathname) ? PARENTS[pathname] : undefined;
  const crumbs = isSection(pathname)
    ? [
        ...(parent === undefined
          ? []
          : [{ current: false, href: parent, label: t(SECTIONS[parent]) }]),
        { current: true, href: pathname, label: t(SECTIONS[pathname]) },
      ]
    : [];

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {/* Phones show only the current page; the rail sheet has the rest. */}
        <BreadcrumbItem className={cn(crumbs.length > 0 && "max-md:hidden")}>
          {crumbs.length === 0 ? (
            <BreadcrumbPage>{t("overview")}</BreadcrumbPage>
          ) : (
            <BreadcrumbLink render={<Link href="/dashboard" />}>
              {t("overview")}
            </BreadcrumbLink>
          )}
        </BreadcrumbItem>
        {crumbs.map((crumb) => (
          <Fragment key={crumb.href}>
            <BreadcrumbSeparator className="max-md:hidden rtl:rotate-180" />
            <BreadcrumbItem className={cn(!crumb.current && "max-md:hidden")}>
              {crumb.current ? (
                <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink render={<Link href={crumb.href} />}>
                  {crumb.label}
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
};
