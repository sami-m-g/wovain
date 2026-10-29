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
  House,
  Layers,
  LayoutGrid,
  PlugZap,
  Plus,
  Settings,
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
  { href: "/dashboard/drops", icon: Layers, key: "drops" },
  { href: "/dashboard/connections", icon: PlugZap, key: "connections" },
  { href: "/dashboard/billing", icon: CreditCard, key: "billing" },
];

// The story-ui rail: four places that tell one story (openspec story-ui).
// New drop and Insights leave the rail; their pages belong to Drops and Home.
const STORY_NAV: readonly NavItem[] = [
  {
    also: ["/dashboard/insights"],
    href: "/dashboard",
    icon: House,
    key: "home",
  },
  {
    also: ["/dashboard/new", "/dashboard/campaign", "/dashboard/models"],
    href: "/dashboard/drops",
    icon: Layers,
    key: "drops",
  },
  {
    also: ["/dashboard/connections", "/dashboard/billing"],
    href: "/dashboard/settings",
    icon: Settings,
    key: "settings",
  },
];

// Store management, while its flag is on (openspec store-management).
const STORE: NavItem = {
  href: "/dashboard/store",
  icon: Store,
  key: "store",
};

// Shown only while the autopilot-triggers flag is on for the merchant.
const AUTOPILOT: NavItem = {
  href: "/dashboard/autopilot",
  icon: Bot,
  key: "autopilot",
};

const MARK_SIZE = 20;

/**
 * The plum app rail, built on shadcn's sidebar-07 block: it collapses to
 * icons on desktop (Cmd/Ctrl+B or the rail edge) and becomes a sheet on
 * phones. The rail is dark in both themes, so the logo uses its dark tone.
 */
export const AppSidebar = ({
  docsUrl,
  store = false,
  story = false,
}: {
  docsUrl: string;
  store?: boolean;
  // The story-ui flag: the four-item rail.
  story?: boolean;
}) => {
  const common = useTranslations("Common");
  const autopilot = useQuery(orpc.autopilot.status.queryOptions());
  // Store after Insights (after Drops in the story rail), Autopilot after Drops.
  const nav = story ? STORY_NAV : NAV;
  const storeAfter = story ? "drops" : "insights";
  const storeIndex = nav.findIndex((item) => item.key === storeAfter);
  const base = store ? nav.toSpliced(storeIndex + 1, 0, STORE) : nav;
  // The story rail keeps its four places together: Autopilot comes last.
  const autopilotAfter = story
    ? base.length - 1
    : base.findIndex((item) => item.key === "drops");
  const items =
    autopilot.data?.enabled === true
      ? base.toSpliced(autopilotAfter + 1, 0, AUTOPILOT)
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
