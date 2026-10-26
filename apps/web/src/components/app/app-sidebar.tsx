"use client";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@wovain/ui/components/sidebar";
import { History, LayoutGrid, PlugZap, Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { BRAND_ASSETS, BRAND_NAME } from "@/brand/brand";
import { ApiStatus } from "@/components/app/api-status";
import type { NavItem } from "@/components/app/nav-main";
import { NavMain } from "@/components/app/nav-main";
import { NavUser } from "@/components/app/nav-user";
import { Logo } from "@/components/brand/logo";
import { Link } from "@/i18n/navigation";

const NAV: readonly NavItem[] = [
  { href: "/dashboard", icon: LayoutGrid, key: "overview" },
  { href: "/dashboard/new", icon: Plus, key: "newDrop" },
  { href: "/dashboard/runs", icon: History, key: "runs" },
  { href: "/dashboard/connections", icon: PlugZap, key: "connections" },
];

const MARK_SIZE = 20;

/**
 * The plum app rail, built on shadcn's sidebar-07 block: it collapses to
 * icons on desktop (Cmd/Ctrl+B or the rail edge) and becomes a sheet on
 * phones. The rail is dark in both themes, so the logo uses its dark tone.
 */
export const AppSidebar = ({ docsUrl }: { docsUrl: string }) => {
  const common = useTranslations("Common");
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              aria-label={common("homeLabel")}
              render={<Link href="/" />}
              size="lg"
            >
              <Logo
                className="group-data-[collapsible=icon]:hidden"
                height={24}
                tone="dark"
              />
              {/* oxlint-disable-next-line nextjs/no-img-element -- static SVG mark */}
              <img
                alt={BRAND_NAME}
                className="hidden shrink-0 group-data-[collapsible=icon]:block"
                height={MARK_SIZE}
                src={BRAND_ASSETS.mark}
                width={MARK_SIZE}
              />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={NAV} />
      </SidebarContent>
      <SidebarFooter>
        <ApiStatus />
        <NavUser docsUrl={docsUrl} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
};
