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
  "/dashboard/connections": "connections",
  "/dashboard/new": "newDrop",
  "/dashboard/runs": "runs",
} as const;

const isSection = (path: string): path is keyof typeof SECTIONS =>
  path in SECTIONS;

/** Overview › the current section, in the top bar. */
export const AppBreadcrumb = () => {
  const t = useTranslations("Shell.nav");
  const pathname = usePathname();
  const crumbs = isSection(pathname)
    ? [{ href: pathname, label: t(SECTIONS[pathname]) }]
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
            <BreadcrumbItem>
              <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
};
