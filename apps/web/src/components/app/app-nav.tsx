"use client";

import { cn } from "@wovain/ui/lib/utils";
import { History, LayoutGrid, PlugZap, Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";

const ITEMS = [
  { href: "/dashboard", icon: LayoutGrid, key: "overview" },
  { href: "/dashboard/new", icon: Plus, key: "newDrop" },
  { href: "/dashboard/runs", icon: History, key: "runs" },
  { href: "/dashboard/connections", icon: PlugZap, key: "connections" },
] as const;

export const AppNav = ({ className }: { className?: string }) => {
  const t = useTranslations("Shell.nav");
  const common = useTranslations("Common");
  const pathname = usePathname();

  return (
    <nav aria-label={common("primaryNav")} className={className}>
      <ul className="flex gap-1 lg:flex-col">
        {ITEMS.map(({ href, icon: Icon, key }) => {
          const active = pathname === href;
          return (
            <li className="flex-1 lg:flex-none" key={href}>
              <Link
                aria-current={active ? "page" : undefined}
                className={cn(
                  "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground flex min-h-11 flex-col items-center justify-center gap-1 px-2 py-1.5 text-xs font-semibold lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:text-sm",
                  active &&
                    "bg-sidebar-accent text-sidebar-foreground shadow-[inset_3px_0_0_var(--ink-indigo)] rtl:shadow-[inset_-3px_0_0_var(--ink-indigo)]"
                )}
                href={href}
              >
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};
