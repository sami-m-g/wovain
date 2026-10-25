import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";

import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { routing } from "@/i18n/routing";

const MarketingLayout = async ({
  children,
  params,
}: LayoutProps<"/[locale]">) => {
  const { locale } = await params;
  if (hasLocale(routing.locales, locale)) {
    // Layouts render apart from their pages, so each sets the locale for static rendering.
    setRequestLocale(locale);
  }
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <main className="flex-1 outline-none" id="main" tabIndex={-1}>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
};

export default MarketingLayout;
