import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Settings } from "@/components/auth/settings/settings";
import { enterLocale, requireLocale } from "@/i18n/locale";
import { pageMetadata } from "@/lib/seo";
import { requireSession } from "@/lib/session";

const VIEWS = ["account", "security"] as const;

export const dynamicParams = false;

export const generateStaticParams = () => VIEWS.map((path) => ({ path }));

export const generateMetadata = async ({
  params,
}: PageProps<"/[locale]/dashboard/settings/[path]">): Promise<Metadata> => {
  const locale = await requireLocale(params);
  const { path } = await params;
  return pageMetadata({
    index: false,
    locale,
    path: `/dashboard/settings/${path}`,
    titleKey: "settingsTitle",
  });
};

const SettingsPage = async ({
  params,
}: PageProps<"/[locale]/dashboard/settings/[path]">) => {
  const locale = await enterLocale(params);
  const { path } = await params;
  if (!VIEWS.some((view) => view === path)) {
    notFound();
  }
  await requireSession(locale, `/dashboard/settings/${path}`);
  return <Settings path={path} />;
};

export default SettingsPage;
