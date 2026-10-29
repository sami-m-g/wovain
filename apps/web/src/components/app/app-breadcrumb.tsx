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
  "/dashboard/settings": "settings",
  "/dashboard/settings/account": "account",
  "/dashboard/settings/security": "security",
  "/dashboard/store": "store",
} as const;

type Section = keyof typeof SECTIONS;

// A section shown under another one: a new drop is one of the drops.
const PARENTS: Partial<Record<Section, Section>> = {
  "/dashboard/new": "/dashboard/drops",
};

// In the story rail, connections, billing and the account are parts of
// Settings.
const STORY_PARENTS: Partial<Record<Section, Section>> = {
  ...PARENTS,
  "/dashboard/billing": "/dashboard/settings",
  "/dashboard/connections": "/dashboard/settings",
  "/dashboard/settings/account": "/dashboard/settings",
  "/dashboard/settings/security": "/dashboard/settings",
};

const isSection = (path: string): path is Section => path in SECTIONS;

/**
 * Overview (Home in the story rail) › the parent section, if any › the
 * current section. `story` is the story-ui flag.
 */
export const AppBreadcrumb = ({ story = false }: { story?: boolean }) => {
  const t = useTranslations("Shell.nav");
  const pathname = usePathname();
  const root = story ? t("home") : t("overview");
  const parents = story ? STORY_PARENTS : PARENTS;
  const parent = isSection(pathname) ? parents[pathname] : undefined;
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
            <BreadcrumbPage>{root}</BreadcrumbPage>
          ) : (
            <BreadcrumbLink render={<Link href="/dashboard" />}>
              {root}
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
