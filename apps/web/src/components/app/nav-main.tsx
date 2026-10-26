"use client";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@wovain/ui/components/sidebar";
import type { LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";

export interface NavItem {
  href: "/dashboard" | `/dashboard/${string}`;
  icon: LucideIcon;
  key: "overview" | "newDrop" | "runs" | "connections";
}

/** Is `href` the page, or the section the page belongs to? */
const isActiveHref = (pathname: string, href: string) =>
  href === "/dashboard"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);

/** The rail's page links (sidebar-07's NavMain, flattened: no sub-menus). */
export const NavMain = ({ items }: { items: readonly NavItem[] }) => {
  const t = useTranslations("Shell.nav");
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map(({ href, icon: Icon, key }) => {
            const active = isActiveHref(pathname, href);
            return (
              <SidebarMenuItem key={href}>
                <SidebarMenuButton
                  // Saffron marks the active icon on the plum rail (DESIGN.md).
                  className="data-active:[&_svg]:text-sidebar-primary"
                  isActive={active}
                  onClick={() => {
                    if (isMobile) {
                      setOpenMobile(false);
                    }
                  }}
                  render={
                    <Link
                      aria-current={active ? "page" : undefined}
                      href={href}
                    />
                  }
                  tooltip={t(key)}
                >
                  <Icon aria-hidden="true" />
                  <span>{t(key)}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
};
