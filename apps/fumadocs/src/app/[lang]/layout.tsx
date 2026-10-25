import { RootProvider } from "fumadocs-ui/provider/next";
import type { Metadata } from "next";

import "./global.css";
import { Inter } from "next/font/google";
import { notFound } from "next/navigation";

import { ENV } from "@/env";
import { i18n, isLocale, ogLocales } from "@/lib/i18n";
import { appName } from "@/lib/shared";
import { i18nUI } from "@/lib/translations";

const inter = Inter({
  subsets: ["latin"],
});

export const generateStaticParams = () =>
  i18n.languages.map((lang) => ({ lang }));

export const generateMetadata = async (
  props: LayoutProps<"/[lang]">
): Promise<Metadata> => {
  const { lang } = await props.params;

  return {
    metadataBase: new URL(ENV.SITE_URL),
    openGraph: {
      locale: ogLocales[lang],
      siteName: appName,
      type: "website",
    },
    title: {
      default: appName,
      template: `%s · ${appName}`,
    },
  };
};

const Layout = async ({ children, params }: LayoutProps<"/[lang]">) => {
  const { lang } = await params;
  if (!isLocale(lang)) {
    notFound();
  }

  return (
    <html lang={lang} className={inter.className} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <RootProvider i18n={i18nUI.provider(lang)}>{children}</RootProvider>
      </body>
    </html>
  );
};

export default Layout;
