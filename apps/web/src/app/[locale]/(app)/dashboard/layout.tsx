import { BookOpen } from "lucide-react";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";

import { AnalyticsIdentity } from "@/components/app/analytics-identity";
import { ApiStatus } from "@/components/app/api-status";
import { AppNav } from "@/components/app/app-nav";
import { ConnectionToasts } from "@/components/app/connection-toasts";
import { Logo } from "@/components/brand/logo";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ModeToggle } from "@/components/mode-toggle";
import { AppToaster } from "@/components/toaster";
import UserMenu from "@/components/user-menu";
import { ENV } from "@/env.server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

// Each page checks the session itself so it can send people back to the exact URL after sign-in.
const DashboardLayout = async ({
  children,
  params,
}: LayoutProps<"/[locale]/dashboard">) => {
  const { locale } = await params;
  if (hasLocale(routing.locales, locale)) {
    setRequestLocale(locale);
  }
  const common = await getTranslations("Common");
  const header = await getTranslations("Header");
  return (
    <div className="bg-background min-h-svh lg:grid lg:grid-cols-[15rem_1fr]">
      <div className="bg-sidebar text-sidebar-foreground border-sidebar-border sticky top-0 z-30 flex flex-col gap-2 border-b px-3 pt-3 pb-2 lg:h-svh lg:gap-8 lg:border-e lg:border-b-0 lg:px-3 lg:py-5">
        <Link
          aria-label={common("homeLabel")}
          className="w-fit rounded-md px-2 py-1"
          href="/"
        >
          <Logo height={24} tone="dark" />
        </Link>
        <AppNav />
        <div className="mt-auto hidden flex-col gap-3 px-2 lg:flex">
          <a
            className="text-sidebar-foreground/75 hover:text-sidebar-foreground inline-flex items-center gap-2 text-xs"
            href={ENV.DOCS_URL}
          >
            <BookOpen aria-hidden="true" className="size-3.5" />
            {header("docs")}
          </a>
          <ApiStatus />
        </div>
      </div>
      <div className="flex min-w-0 flex-col">
        <header className="border-border flex h-14 items-center justify-end gap-2 border-b px-4 sm:px-8">
          <LocaleSwitcher />
          <ModeToggle />
          <UserMenu />
        </header>
        {/* Session replays mask the merchant's text here (ph-mask): shop
            names, briefs, emails. Inputs are masked everywhere. */}
        <main
          className="ph-mask mx-auto w-full max-w-6xl flex-1 px-4 py-8 outline-none sm:px-8 lg:py-10"
          id="main"
          tabIndex={-1}
        >
          {children}
          <Suspense>
            <ConnectionToasts />
          </Suspense>
          <AnalyticsIdentity />
          <AppToaster />
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
