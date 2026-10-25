import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";

import { ApiStatus } from "@/components/app/api-status";
import { AppNav } from "@/components/app/app-nav";
import { ConnectionToasts } from "@/components/app/connection-toasts";
import { Wordmark } from "@/components/brand/wordmark";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ModeToggle } from "@/components/mode-toggle";
import UserMenu from "@/components/user-menu";
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
  return (
    <div className="min-h-svh lg:grid lg:grid-cols-[15rem_1fr]">
      <div className="bg-sidebar text-sidebar-foreground sticky top-0 z-30 flex flex-col gap-3 px-3 pt-3 pb-2 lg:h-svh lg:gap-8 lg:px-4 lg:py-6">
        <Link
          aria-label={common("homeLabel")}
          className="px-1 text-white"
          href="/"
        >
          <Wordmark />
        </Link>
        <AppNav />
        <div className="mt-auto hidden px-1 lg:block">
          <ApiStatus />
        </div>
      </div>
      <div className="flex min-w-0 flex-col">
        <header className="border-border flex h-16 items-center justify-end gap-2 border-b px-4 sm:px-8">
          <LocaleSwitcher />
          <ModeToggle />
          <UserMenu />
        </header>
        <main
          className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 outline-none sm:px-8 lg:py-12"
          id="main"
          tabIndex={-1}
        >
          {children}
          <Suspense>
            <ConnectionToasts />
          </Suspense>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
