"use client";

import { useQuery } from "@tanstack/react-query";
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
import {
  Bot,
  ChartLine,
  CreditCard,
  History,
  Layers,
  LayoutGrid,
  PlugZap,
  Plus,
  Store,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { BRAND_ASSETS, BRAND_NAME } from "@/brand/brand";
import type { NavItem } from "@/components/app/nav-main";
import { NavMain } from "@/components/app/nav-main";
import { NavSecondary } from "@/components/app/nav-secondary";
import { NavUser } from "@/components/app/nav-user";
import { Logo } from "@/components/brand/logo";
import { Link } from "@/i18n/navigation";
import { orpc } from "@/utils/orpc";

const NAV: readonly NavItem[] = [
  { href: "/dashboard", icon: LayoutGrid, key: "overview" },
  { href: "/dashboard/new", icon: Plus, key: "newDrop" },
  { href: "/dashboard/insights", icon: ChartLine, key: "insights" },
  { href: "/dashboard/runs", icon: History, key: "runs" },
  { href: "/dashboard/connections", icon: PlugZap, key: "connections" },
  { href: "/dashboard/billing", icon: CreditCard, key: "billing" },
];

// Store management, while its flag is on (openspec store-management).
const PRODUCTS: NavItem = {
  href: "/dashboard/products",
  icon: Store,
  key: "products",
};

// Shown only while the autopilot-triggers flag is on for the merchant.
const AUTOPILOT: NavItem = {
  href: "/dashboard/autopilot",
  icon: Bot,
  key: "autopilot",
};

// Drops (design-drops), shown only while the flag is on for the merchant.
const DROPS: NavItem = {
  href: "/dashboard/drops",
  icon: Layers,
  key: "drops",
};

const MARK_SIZE = 20;

/**
 * The plum app rail, built on shadcn's sidebar-07 block: it collapses to
 * icons on desktop (Cmd/Ctrl+B or the rail edge) and becomes a sheet on
 * phones. The rail is dark in both themes, so the logo uses its dark tone.
 */
export const AppSidebar = ({
  docsUrl,
  drops = false,
  products = false,
}: {
  docsUrl: string;
  drops?: boolean;
  products?: boolean;
}) => {
  const common = useTranslations("Common");
  const autopilot = useQuery(orpc.autopilot.status.queryOptions());
  // Drops after New drop, Products after Insights, Autopilot after Runs.
  const withDrops = drops ? NAV.toSpliced(2, 0, DROPS) : NAV;
  const insightsIndex = withDrops.findIndex((item) => item.key === "insights");
  const base = products
    ? withDrops.toSpliced(insightsIndex + 1, 0, PRODUCTS)
    : withDrops;
  const runsIndex = base.findIndex((item) => item.key === "runs");
  const items =
    autopilot.data?.enabled === true
      ? base.toSpliced(runsIndex + 1, 0, AUTOPILOT)
      : base;
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
                src={BRAND_ASSETS.markDark}
                width={MARK_SIZE}
              />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={items} />
        <NavSecondary docsUrl={docsUrl} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
};
