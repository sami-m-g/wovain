import type { Metadata, Viewport } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Archivo } from "next/font/google";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import "@/index.css";
import "@/lib/orpc.server";
import Providers from "@/components/providers";
import { routing } from "@/i18n/routing";
import { alternatesFor, siteUrl } from "@/lib/seo";

const archivo = Archivo({
  axes: ["wdth"],
  display: "swap",
  subsets: ["latin"],
  variable: "--font-archivo",
});

export const generateStaticParams = () =>
  routing.locales.map((locale) => ({ locale }));

export const generateMetadata = async ({
  params,
}: LayoutProps<"/[locale]">): Promise<Metadata> => {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    return {};
  }
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
    { color: "#f6f7fb", media: "(prefers-color-scheme: light)" },
    { color: "#0e1020", media: "(prefers-color-scheme: dark)" },
  ],
};

const LocaleLayout = async ({
  children,
  params,
}: LayoutProps<"/[locale]"> & { children: ReactNode }) => {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "Common" });

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={`${archivo.variable} antialiased`}>
        <a
          className="bg-primary text-primary-foreground fixed start-3 top-3 z-50 -translate-y-24 px-4 py-3 text-sm font-semibold transition-transform focus-visible:translate-y-0"
          href="#main"
        >
          {t("skipToContent")}
        </a>
        <NextIntlClientProvider>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
};

export default LocaleLayout;
