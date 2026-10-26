"use client";

import { cn } from "@wovain/ui/lib/utils";
import { CreditCard, History, LayoutGrid, PlugZap, Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";

const ITEMS = [
  { href: "/dashboard", icon: LayoutGrid, key: "overview" },
  { href: "/dashboard/new", icon: Plus, key: "newDrop" },
  { href: "/dashboard/runs", icon: History, key: "runs" },
  { href: "/dashboard/connections", icon: PlugZap, key: "connections" },
  { href: "/dashboard/billing", icon: CreditCard, key: "billing" },
] as const;

export const AppNav = ({ className }: { className?: string }) => {
  const t = useTranslations("Shell.nav");
  const common = useTranslations("Common");
  const pathname = usePathname();

  return (
    <nav aria-label={common("primaryNav")} className={className}>
      <ul className="flex gap-1 lg:flex-col lg:gap-0.5">
        {ITEMS.map(({ href, icon: Icon, key }) => {
          const active = pathname === href;
          return (
            <li className="flex-1 lg:flex-none" key={href}>
              <Link
                aria-current={active ? "page" : undefined}
                className={cn(
                  "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground flex min-h-11 flex-col items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors lg:min-h-9 lg:flex-row lg:justify-start lg:gap-2.5 lg:px-2.5 lg:text-sm",
                  active && "bg-sidebar-accent text-sidebar-foreground"
                )}
                href={href}
              >
                <Icon
                  aria-hidden="true"
                  className={cn(
                    "size-4 shrink-0",
                    active && "text-sidebar-primary"
                  )}
                />
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};
