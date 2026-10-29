import { Separator } from "@wovain/ui/components/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@wovain/ui/components/sidebar";
import { TooltipProvider } from "@wovain/ui/components/tooltip";
import { getTranslations } from "next-intl/server";
import { cookies, headers } from "next/headers";
import type { CSSProperties } from "react";
import { Suspense } from "react";

import { BRAND_ASSETS } from "@/brand/brand";
import { AnalyticsIdentity } from "@/components/app/analytics-identity";
import { AppBreadcrumb } from "@/components/app/app-breadcrumb";
import { AppMotion } from "@/components/app/app-motion";
import { AppSidebar } from "@/components/app/app-sidebar";
import { ConnectionToasts } from "@/components/app/connection-toasts";
import { VoiceButton } from "@/components/app/voice-button";
import { AuthSession } from "@/components/auth-session";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ModeToggle } from "@/components/mode-toggle";
import { AppToaster } from "@/components/toaster";
import { ENV } from "@/env.server";
import { enterLocale } from "@/i18n/locale";
import { Link } from "@/i18n/navigation";
import { auth, core } from "@/services";

// The sidebar component remembers open/collapsed in this cookie.
const SIDEBAR_COOKIE = "sidebar_state";
const RAIL_WIDTH = { "--sidebar-width": "15rem" } as CSSProperties;
const MARK_SIZE = 22;

// Each page checks the session itself so it can send people back to the exact URL after sign-in.
const DashboardLayout = async ({
  children,
  params,
}: LayoutProps<"/[locale]/dashboard">) => {
  await enterLocale(params);
  const shell = await getTranslations("Shell");
  const common = await getTranslations("Common");
  const jar = await cookies();
  const sidebarOpen = jar.get(SIDEBAR_COOKIE)?.value !== "false";
  // The Store page shows in the rail only while store-management is on
  // for the merchant.
  const session = await auth.api.getSession({ headers: await headers() });
  const store =
    session?.user === undefined
      ? false
      : await core.flags.isOn("store-management", { userId: session.user.id });

  return (
    <TooltipProvider>
      <SidebarProvider defaultOpen={sidebarOpen} style={RAIL_WIDTH}>
        <AppSidebar docsUrl={ENV.DOCS_URL} store={store} />
        {/* Session replays mask the merchant's text here (ph-mask): shop
            names, briefs, emails. Inputs are masked everywhere. */}
        <SidebarInset className="ph-mask outline-none" id="main" tabIndex={-1}>
          <header className="border-border bg-background/95 supports-backdrop-filter:bg-background/80 sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur sm:px-8">
            {/* Above the page: the content below is its own stacking context
                (isolate), so nothing in it, a focused card's z-index included,
                can paint over the bar. */}
            <SidebarTrigger
              aria-label={shell("toggleSidebar")}
              className="-ms-1.5"
            />
            <Separator
              className="me-1 data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center"
              orientation="vertical"
            />
            {/* The rail is a sheet on phones, so the bar carries the mark. */}
            <Link
              aria-label={common("homeLabel")}
              className="shrink-0 md:hidden"
              href="/"
            >
              {/* oxlint-disable-next-line nextjs/no-img-element -- static SVG mark */}
              <img
                alt=""
                height={MARK_SIZE}
                src={BRAND_ASSETS.mark}
                width={MARK_SIZE}
              />
            </Link>
            <AppBreadcrumb />
            <div className="ms-auto flex items-center gap-2">
              {/* Hold to talk, while the voice-input flag is on. */}
              <Suspense>
                <VoiceButton />
              </Suspense>
              <LocaleSwitcher />
              <ModeToggle />
            </div>
          </header>
          <AppMotion>
            <div className="isolate mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-8 lg:py-10">
              <Suspense>
                <AuthSession>{children}</AuthSession>
              </Suspense>
            </div>
          </AppMotion>
          <Suspense>
            <ConnectionToasts />
          </Suspense>
          <AnalyticsIdentity />
          <AppToaster />
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
};

export default DashboardLayout;
