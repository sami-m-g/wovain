import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import "@/index.css";
import "@/lib/orpc.server";
import { BRAND_CSS, PALETTE } from "@/brand/brand";
import { fontVariables } from "@/brand/fonts";
import { ConsentBanner } from "@/components/consent-banner";
import Providers from "@/components/providers";
import { enterLocale, requireLocale } from "@/i18n/locale";
import { routing } from "@/i18n/routing";
import { alternatesFor, siteUrl } from "@/lib/seo";

// Only the configured locales exist; anything else (/llms.txt, /foo) is a 404.
export const dynamicParams = false;

export const generateStaticParams = () =>
  routing.locales.map((locale) => ({ locale }));

export const generateMetadata = async ({
  params,
}: LayoutProps<"/[locale]">): Promise<Metadata> => {
  const locale = await requireLocale(params);
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return {
    alternates: alternatesFor("/", locale),
    applicationName: t("siteName"),
    description: t("defaultDescription"),
    metadataBase: siteUrl,
    openGraph: {
      description: t("defaultDescription"),
      locale,
      siteName: t("siteName"),
      title: t("defaultTitle"),
      type: "website",
    },
    title: {
      default: t("defaultTitle"),
      template: `%s · ${t("siteName")}`,
    },
    twitter: {
      card: "summary_large_image",
      description: t("defaultDescription"),
      title: t("defaultTitle"),
    },
  };
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { color: PALETTE.light.paper, media: "(prefers-color-scheme: light)" },
    { color: PALETTE.dark.paper, media: "(prefers-color-scheme: dark)" },
  ],
};

const LocaleLayout = async ({
  children,
  params,
}: LayoutProps<"/[locale]"> & { children: ReactNode }) => {
  const locale = await enterLocale(params);
  const t = await getTranslations({ locale, namespace: "Common" });

  return (
    <html className={fontVariables} lang={locale} suppressHydrationWarning>
      <head>
        {/* The brand palette as CSS variables; tokens.css maps them to roles. */}
        <style>{BRAND_CSS}</style>
      </head>
      <body className="antialiased">
        <a
          className="bg-primary text-primary-foreground fixed start-3 top-3 z-50 -translate-y-24 rounded-lg px-4 py-3 text-sm font-medium transition-transform focus-visible:translate-y-0"
          href="#main"
        >
          {t("skipToContent")}
        </a>
        <NextIntlClientProvider>
          <Providers>
            {children}
            <ConsentBanner />
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
};

export default LocaleLayout;
